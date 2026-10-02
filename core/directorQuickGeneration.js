import { buildSceneSourceTape, validateScenePlan, parseStructuredJson } from './directorSegmentation.js';
import { recalibrateScenePlanTimings } from './directorTiming.js';
import { packScenePlan } from './directorPlanPacking.js';
import { buildSegmentationMessages, buildSegmentSkillRequest, buildSceneAuditMessages } from './directorSegmentationMessages.js';
import { identifyPromptContract, validateGeneratedSegment, repairGeneratedDialogueModes, repairGeneratedDialogueContinuations, parseSceneAudit } from './directorPromptValidation.js';
import { createSceneSnapshot } from './directorQuickStore.js';

const activePhases = new Set(['planning','validating-plan','generating','auditing','ready-to-commit']);
export const isQuickRunActive = run => Boolean(run && activePhases.has(run.phase));
const uid = () => crypto.randomUUID();
const parseJson = parseStructuredJson;
const error = (message,code='FAILED') => Object.assign(new Error(message),{code});
const clone = value => structuredClone(value);
const snapshotKey = s => JSON.stringify([s.accountId,s.projectId,s.episodeId,s.sceneLabel]);

/** A scene transaction: no React closures or credentials belong in its checkpoint. */
export function createQuickGenerationController({getContext,executeText,executeSkill,checkpoints,commitRun,commitProgress=null,groundedTiming=false,maxQualityAttempts=2,cancelRequest=()=>{},onChange=()=>{}}) {
  const runs=new Map(),listeners=new Set(),executions=new Map(),versions=new Map(),saveTails=new Map();
  let disposed=false;
  const emit=()=>{if(disposed)return;onChange();for(const listener of listeners)listener();};
  const persist=async run=>{
    run.updatedAt=new Date().toISOString();run.revision=(run.revision||0)+1;
    const copy=clone(run);
    const tail=(saveTails.get(run.id)||Promise.resolve()).catch(()=>{}).then(()=>checkpoints.save({run:copy}));
    saveTails.set(run.id,tail);await tail;emit();
  };
  const assertCurrent=async(run,version)=>{
    if(disposed || versions.get(run.id)!==version)throw error('任务已停止','STOPPED');
    const context=await getContext(run.snapshot);
    if(!context || context.accountId!==run.snapshot.accountId)throw error('账号已切换，任务已暂停','ACCOUNT_CHANGED');
    if(!context.project || !context.episode || !context.skill || !context.profile)throw error('项目、场景、Skill 或模型已不存在','STALE');
    if(context.permissions?.canGenerate===false || context.project.cloudLocked)throw error('项目已锁定或无权生成','STALE');
    const latest=await createSceneSnapshot({...context,sceneLabel:run.snapshot.sceneLabel,maxDurationSeconds:run.snapshot.maxDurationSeconds});
    if(disposed||versions.get(run.id)!==version)throw error('任务已停止','STOPPED');
    for(const key of ['sourceHash','settingsHash','skillHash','profileHash'])if(latest[key]!==run.snapshot[key])throw error('原文、项目设定、Skill 或模型配置已修改，请重新生成','STALE');
    return context;
  };
  const request=async(run,version,kind,payload)=>{
    if(run.pauseRequested)throw error('已保存当前进度，任务已暂停','PAUSED');
    await assertCurrent(run,version);
    const taskId=`director-quick-${run.id}-${kind}-${uid()}`;
    run.pendingRequestId=taskId;await persist(run);
    await assertCurrent(run,version);
    let response;
    try{response=await (kind==='skill'?executeSkill:executeText)({...payload,taskId,snapshot:run.snapshot});}
    catch(e){
      await assertCurrent(run,version);
      // Retry only explicit completion/capacity or transient service failures,
      // never an ambiguous timeout/cancellation that may already be billed.
      const retryable=/输出被截断|只返回了推理过程|没有返回模型正文|HTTP (?:429|502|503|504)/i.test(e.message||'');
      if(!retryable||payload.recoveryAttempt)throw e;
      run.recoveries||=[];run.recoveries.push({kind,message:e.message,partialText:e.partialText||'',at:new Date().toISOString()});
      run.retryMessage='接口未完整返回，正在自动重试本次未完成请求';await persist(run);
      return request(run,version,kind,{...payload,recoveryAttempt:1,maxOutputTokens:32768});
    }
    await assertCurrent(run,version);
    run.pendingRequestId=null;
    run.retryMessage='';
    const value=response?.output ?? response;
    if(typeof value!=='string'||!value.trim())throw error('模型没有返回正文','EMPTY_OUTPUT');
    return value;
  };
  const auditRanges=run=>{
    const segments=run.plan.segments;
    const size=segments.reduce((n,s)=>n+(run.segmentDrafts[s.id]?.prompt?.content.length||0),0)+run.plan.sourceText.length;
    if(size<24000)return [segments.map(s=>s.index)];
    return segments.map((s,i)=>i?null:[s.index]).filter(Boolean).concat(segments.slice(1).map((s,i)=>[segments[i].index,s.index]));
  };
  const execute=async run=>{
    const version=(versions.get(run.id)||0)+1;versions.set(run.id,version);
    try {
      await assertCurrent(run,version);
      const tape=buildSceneSourceTape(run.snapshot.sourceSnapshot);
      const sourceFor=segment=>({text:tape.sourceText.slice(segment.sourceStart,segment.sourceEnd),sourceText:tape.sourceText,sourceStart:segment.sourceStart,sourceEnd:segment.sourceEnd});
      // Older failed checkpoints often contain valid paid output rejected by
      // the former cast/OS parser. Recheck it locally before spending again.
      if(run.processingVersion!==3){
        const context=await assertCurrent(run,version),contract=identifyPromptContract(context.skill);
        run.segmentQualityFailures={};run.auditRepairIndexes=[];run.auditRepairAttempts={};run.auditWarnings=[];run.checks={audited:false,ranges:{}};
        run.planQualityFailures=0;run.planIssues=[];
        if(groundedTiming&&run.plan){
          const candidate={segments:run.plan.segments.map(segment=>{
            const unit=tape.units.find(unit=>unit.end===segment.sourceEnd)||tape.units.find(unit=>unit.start<segment.sourceEnd&&unit.end>segment.sourceEnd);
            return {...segment,end:unit?{unitId:unit.id,...(unit.end===segment.sourceEnd?{}:{prefix:unit.text.slice(0,segment.sourceEnd-unit.start)})}:null};
          })};
          const checked=validateScenePlan(recalibrateScenePlanTimings(candidate,{tape}).candidate,{tape,maxDurationSeconds:run.snapshot.maxDurationSeconds,groundedTiming:true});
          if(!checked.ok){
            run.previousDrafts=Object.values(run.segmentDrafts).filter(d=>d.prompt?.content);
            run.previousPlan=run.plan;run.plan=null;run.segmentDrafts={};run.promptIds=[];run.sharedBaseline='';run.lastPlanningOutput='';
          }else run.plan={...run.plan,segments:checked.plan.segments.map((segment,i)=>({...segment,id:run.plan.segments[i].id,index:i+1}))};
        }
        let baseline='';
        for(const segment of run.plan?.segments||[]){
          const draft=run.segmentDrafts[segment.id];if(!draft?.prompt?.content)continue;
          let candidateOutput=draft.prompt.content;
          let checked=validateGeneratedSegment({output:candidateOutput,expectedLabel:`${run.snapshot.sceneLabel}-${segment.index}`,source:sourceFor(segment),contract,sharedBaseline:baseline});
          if(!checked.ok&&checked.issues?.length&&checked.issues.every(item=>item.code==='DIALOGUE_MODE_CHANGED')){
            candidateOutput=repairGeneratedDialogueModes({output:candidateOutput,source:sourceFor(segment)});
            checked=validateGeneratedSegment({output:candidateOutput,expectedLabel:`${run.snapshot.sceneLabel}-${segment.index}`,source:sourceFor(segment),contract,sharedBaseline:baseline});
          }
          if(!checked.ok&&checked.issues?.length&&checked.issues.every(item=>item.code==='MISSING_DIALOGUE_CONTINUATION')){
            candidateOutput=repairGeneratedDialogueContinuations({output:candidateOutput,source:sourceFor(segment)});
            checked=validateGeneratedSegment({output:candidateOutput,expectedLabel:`${run.snapshot.sceneLabel}-${segment.index}`,source:sourceFor(segment),contract,sharedBaseline:baseline});
          }
          run.segmentDrafts[segment.id]={...draft,prompt:checked.prompt||{...draft.prompt,content:candidateOutput},baseline:checked.baseline||'',validated:checked.ok,issues:checked.issues||[]};
          if(checked.ok&&!baseline&&checked.baseline)baseline=checked.baseline;
        }
        run.sharedBaseline=baseline||run.sharedBaseline;run.processingVersion=3;await persist(run);
      }
      if(!run.plan){
        let issues=run.planIssues||[];
        for(let attempt=run.planQualityFailures||0;attempt<maxQualityAttempts;attempt++){
          run.phase='planning';run.planningAttempts=(run.planningAttempts||0)+1;await persist(run);
          const output=run.lastPlanningOutput||await request(run,version,'plan',{messages:buildSegmentationMessages({snapshot:run.snapshot,tape,validationIssues:issues,previousCandidate:run.previousPlanningCandidate}),profileId:run.snapshot.profileId});
          run.phase='validating-plan';run.lastPlanningOutput=output;await persist(run);
          let candidate;
          try{candidate=parseJson(output);}catch{issues=[{code:'INVALID_JSON',message:'请只返回完整且有效的 JSON 计划'}];run.lastPlanningOutput='';run.planIssues=issues;run.planQualityFailures=(run.planQualityFailures||0)+1;await persist(run);continue;}
          if(candidate.capacityIssue){
            issues=[{code:'PER_CLIP_CAPACITY',message:'上限只限制每一条视频，整场可以任意长。整场超过上限请按原文顺序拆成多条，并输出 segments 数组；不要因为整场台词总时长超过上限而报容量不足。',evidence:candidate.capacityIssue}];
            run.lastPlanningOutput='';run.planIssues=issues;run.planQualityFailures=(run.planQualityFailures||0)+1;await persist(run);continue;
          }
          if(Array.isArray(candidate?.segments))candidate.segments.forEach(segment=>{if(segment.visualNotes===undefined)segment.visualNotes=[];});
          if(groundedTiming){
            candidate=recalibrateScenePlanTimings(candidate,{tape}).candidate;
            const packed=packScenePlan(candidate,{tape,maxDurationSeconds:run.snapshot.maxDurationSeconds});
            if(packed.changed){run.planPacking={version:1,originalSegmentCount:packed.originalSegmentCount,segmentCount:packed.segmentCount};candidate=packed.candidate;}
          }
          const validated=validateScenePlan(candidate,{tape,maxDurationSeconds:run.snapshot.maxDurationSeconds,groundedTiming});
          if(!validated.ok){issues=validated.issues;run.previousPlanningCandidate=candidate;run.planningHistory=[...(run.planningHistory||[]),{output,issues,at:new Date().toISOString()}].slice(-3);run.lastPlanningOutput='';run.planIssues=issues;run.planQualityFailures=(run.planQualityFailures||0)+1;await persist(run);continue;}
          run.plan={...validated.plan,id:`plan-${run.id}`,version:1,sceneLabel:run.snapshot.sceneLabel,
            sourceSnapshot:tape.sourceSnapshot,sourceText:tape.sourceText,sceneHeader:tape.sceneHeader,
            sourceHash:run.snapshot.sourceHash,settingsHash:run.snapshot.settingsHash,skillHash:run.snapshot.skillHash,profileHash:run.snapshot.profileHash,
            maxDurationSeconds:run.snapshot.maxDurationSeconds,rulesVersion:1,createdAt:new Date().toISOString(),
            segments:validated.plan.segments.map((s,i)=>({...s,id:`${run.id}-segment-${i+1}`,index:i+1}))};
          run.promptIds=run.plan.segments.map(()=>uid());run.commitKey=run.id;run.lastPlanningOutput='';await persist(run);break;
        }
        if(!run.plan)throw error(issues.map(i=>i.message||i.code).join('；')||'分段计划未通过时长与原文核对','NEEDS_REVIEW');
      }
      while(!run.checks.audited){
        run.phase='generating';await persist(run);
        const context=await assertCurrent(run,version);
        const contract=identifyPromptContract(context.skill);
        for(const segment of run.plan.segments){
          if(run.segmentDrafts[segment.id]?.validated){
            if(commitProgress){await assertCurrent(run,version);const result=await commitProgress(clone(run));if(!result?.applied)throw error(result?.conflict||'已生成结果保存失败','STALE');}
            continue;
          }
          const previous=run.plan.segments[segment.index-2];
          let issues=run.segmentDrafts[segment.id]?.issues||[];
          let accepted=false;
          for(let attempt=run.segmentQualityFailures[segment.id]||0;attempt<maxQualityAttempts;attempt++){
            const built=buildSegmentSkillRequest({snapshot:run.snapshot,tape,plan:run.plan,segment,sharedBaseline:run.sharedBaseline,previousPrompt:previous?run.segmentDrafts[previous.id]?.prompt?.content:''});
            if(issues.length)built.input+=`\n\n【修正本条】\n${JSON.stringify(issues)}\n只修正本条问题，保持原台词、剧情、编号、目标时长和整场基准。`;
            run.currentSegmentIndex=segment.index;await persist(run);
            const output=await request(run,version,'skill',{...built,skillId:run.snapshot.skillId,profileId:run.snapshot.profileId});
            let candidateOutput=output;
            let checked=validateGeneratedSegment({output:candidateOutput,expectedLabel:`${run.snapshot.sceneLabel}-${segment.index}`,source:sourceFor(segment),contract,sharedBaseline:run.sharedBaseline});
            if(!checked.ok&&checked.issues?.length&&checked.issues.every(item=>item.code==='DIALOGUE_MODE_CHANGED')){
              candidateOutput=repairGeneratedDialogueModes({output:candidateOutput,source:sourceFor(segment)});
              checked=validateGeneratedSegment({output:candidateOutput,expectedLabel:`${run.snapshot.sceneLabel}-${segment.index}`,source:sourceFor(segment),contract,sharedBaseline:run.sharedBaseline});
            }
            if(!checked.ok&&checked.issues?.length&&checked.issues.every(item=>item.code==='MISSING_DIALOGUE_CONTINUATION')){
              candidateOutput=repairGeneratedDialogueContinuations({output:candidateOutput,source:sourceFor(segment)});
              checked=validateGeneratedSegment({output:candidateOutput,expectedLabel:`${run.snapshot.sceneLabel}-${segment.index}`,source:sourceFor(segment),contract,sharedBaseline:run.sharedBaseline});
            }
            const failures=(run.segmentQualityFailures[segment.id]||0)+(checked.ok?0:1);
            run.segmentQualityFailures[segment.id]=failures;
            run.segmentDrafts[segment.id]={prompt:checked.prompt||{label:`${run.snapshot.sceneLabel}-${segment.index}`,content:candidateOutput},baseline:checked.baseline||'',validated:checked.ok,issues:checked.issues||[],qualityFailures:failures};
            if(checked.ok&&!run.sharedBaseline&&checked.baseline)run.sharedBaseline=checked.baseline;
            await persist(run);
            if(checked.ok){
              if(commitProgress){await assertCurrent(run,version);const result=await commitProgress(clone(run));if(!result?.applied)throw error(result?.conflict||'已生成结果保存失败','STALE');await assertCurrent(run,version);}
              accepted=true;break;
            }
            issues=checked.issues||[];
          }
          if(!accepted)throw error(issues.map(i=>i.message||i.code).join('；')||`第 ${segment.index} 条未通过核对`,'NEEDS_REVIEW');
        }
        run.phase='auditing';await persist(run);
        let auditIssue=null;
        for(const range of auditRanges(run)){
          const rangeKey=range.join('-');if(run.checks.ranges[rangeKey])continue;
          const prompts=range.map(index=>run.segmentDrafts[run.plan.segments[index-1].id].prompt);
          const messages=buildSceneAuditMessages({snapshot:run.snapshot,tape,plan:run.plan,prompts,range});
          let output=await request(run,version,'audit',{messages,profileId:run.snapshot.profileId});
          let result=parseSceneAudit(output,{plan:run.plan,range});
          if(!result.ok&&result.issues.every(entry=>entry.code==='INVALID_AUDIT_OUTPUT')){
            run.lastAuditOutput=output;await persist(run);
            output=await request(run,version,'audit',{messages:[...messages,{role:'user',content:`请修正核对输出格式或证据，不改变核对范围。只返回完整JSON：${JSON.stringify(result.issues)}`}],profileId:run.snapshot.profileId});
            result=parseSceneAudit(output,{plan:run.plan,range});
          }
          if(!result.ok){auditIssue=result.issues;run.lastAuditOutput=output;break;}
          run.checks.ranges[rangeKey]=true;await persist(run);
        }
        if(auditIssue){
          const index=Math.min(...auditIssue.map(i=>Number(i.segmentIndex)).filter(i=>Number.isInteger(i)&&i>0));
          run.auditRepairAttempts||={};
          for(const item of run.auditRepairIndexes||[])run.auditRepairAttempts[item]=Math.max(1,run.auditRepairAttempts[item]||0);
          if(!Number.isFinite(index)||(run.auditRepairIndexes||[]).length>=2){
            // Local structural/source checks have already passed. Preserve the
            // generated cards and publish them with a visible audit warning
            // after two bounded semantic repair rounds instead of forcing a
            // user into an endless paid retry loop.
            run.auditWarnings=auditIssue;run.checks.audited=true;run.checks.ranges={};await persist(run);break;
          }
          run.auditRepairAttempts[index]=(run.auditRepairAttempts[index]||0)+1;
          run.auditRepairIndexes.push(index);run.checks.ranges={};
          for(const segment of run.plan.segments.slice(index-1)){
            delete run.segmentDrafts[segment.id];
            run.segmentQualityFailures[segment.id]=0;
          }
          run.segmentDrafts[run.plan.segments[index-1].id]={validated:false,issues:auditIssue};
          if(index===1)run.sharedBaseline='';await persist(run);continue;
        }
        run.checks.audited=true;await persist(run);
      }
      await assertCurrent(run,version);
      run.phase='ready-to-commit';await persist(run);
      await assertCurrent(run,version);
      const result=await commitRun(clone(run));
      if(versions.get(run.id)!==version||disposed)return clone(run);
      if(!result?.applied)throw error(result?.conflict||'结果与当前项目不一致，已保留草稿','STALE');
      run.phase='completed';run.errors=[];run.pendingRequestId=null;await persist(run);
    }catch(e){
      if(versions.get(run.id)!==version)return clone(run);
      run.pendingRequestId=null;
      run.phase=['ACCOUNT_CHANGED','PAUSED'].includes(e.code)?'paused':e.code==='STALE'?'stale':e.code==='NEEDS_REVIEW'?'needs-review':'failed';
      run.errors=[{message:e.message||'生成失败',code:e.code||'FAILED',partialText:e.partialText||'',at:new Date().toISOString()}];
      try{await persist(run);}catch(saveError){run.errors.push({code:'SAVE_FAILED',message:saveError.message});emit();}
    }
    return clone(run);
  };
  const schedule=run=>{
    if(executions.has(run.id))return executions.get(run.id);
    const busy=[...runs.values()].find(other=>other.id!==run.id&&isQuickRunActive(other)&&snapshotKey(other.snapshot)===snapshotKey(run.snapshot));
    if(busy)return Promise.reject(error('当前场景已有生成任务，请先停止或等待完成','BUSY'));
    run.errors=[];
    const task=execute(run).finally(()=>{if(executions.get(run.id)===task)executions.delete(run.id);});executions.set(run.id,task);return task;
  };
  return {
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    get:runId=>runs.has(runId)?clone(runs.get(runId)):null,
    entries:()=>[...runs.values()].map(clone),
    async start(sceneRequest,{runId,batchId}={}){
      const snapshot=await createSceneSnapshot(sceneRequest);
      if([...runs.values()].some(r=>isQuickRunActive(r)&&snapshotKey(r.snapshot)===snapshotKey(snapshot)))throw error('当前场景正在生成','BUSY');
      const id=runId||uid();if(runs.has(id))throw error('任务编号已存在','BUSY');
      const run={id,kind:'scene',...(batchId?{batchId}:{}),snapshot,phase:'planning',createdAt:new Date().toISOString(),revision:0,processingVersion:3,plan:null,segmentDrafts:{},segmentQualityFailures:{},sharedBaseline:'',checks:{audited:false,ranges:{}},errors:[],promptIds:[],auditRepairIndexes:[]};
      runs.set(run.id,run);
      const initialVersion=versions.get(run.id)||0;
      await persist(run);
      if(disposed||!isQuickRunActive(run)||(versions.get(run.id)||0)!==initialVersion)return clone(run);
      return schedule(run);
    },
    async resume(runId){
      let run=runs.get(runId);if(!run){run=await checkpoints.load({runId});if(!run)throw error('找不到生成进度');runs.set(runId,run);}
      run.checks||={audited:false,ranges:{}};run.checks.ranges||={};run.auditRepairIndexes||=[];run.auditRepairAttempts||={};run.auditWarnings||=[];run.segmentQualityFailures||={};
      if(run.phase==='completed')return clone(run);
      run.pauseRequested=false;
      // A user-requested continuation gets a new bounded repair round. Keep
      // accepted paid drafts and fixed IDs; never loop automatically forever.
      if(run.phase==='needs-review'){
        run.repairRounds=(run.repairRounds||0)+1;run.planQualityFailures=0;
        for(const [id,draft] of Object.entries(run.segmentDrafts))if(!draft.validated)run.segmentQualityFailures[id]=0;
      }
      return schedule(run);
    },
    async pauseAfterRequest(runId){const run=runs.get(runId);if(!run||!isQuickRunActive(run))return;run.pauseRequested=true;await persist(run);},
    async stop(runId){
      const run=runs.get(runId);if(!run||!isQuickRunActive(run))return;
      if(run.phase==='ready-to-commit'){await executions.get(runId);return;}
      versions.set(runId,(versions.get(runId)||0)+1);
      executions.delete(runId);
      const requestId=run.pendingRequestId;run.phase='paused';run.pendingRequestId=null;
      try{await persist(run);}finally{if(requestId)try{await cancelRequest(requestId);}catch{}}
    },
    async restore(){
      const saved=await checkpoints.list();
      for(const run of saved||[]){if(!run?.id||!run.snapshot||run.kind==='batch'||runs.has(run.id))continue;
        if(isQuickRunActive(run)){run.phase='paused';run.pendingRequestId=null;}
        run.checks||={audited:false,ranges:{}};run.checks.ranges||={};run.auditRepairIndexes||=[];run.segmentQualityFailures||={};
        runs.set(run.id,run);
      }emit();
    },
    async pauseAll(){await Promise.all([...runs.values()].filter(isQuickRunActive).map(run=>this.stop(run.id)));},
    activate(){disposed=false;},
    dispose(){disposed=true;for(const run of runs.values()){versions.set(run.id,(versions.get(run.id)||0)+1);if(run.pendingRequestId)cancelRequest(run.pendingRequestId);}listeners.clear();},
  };
}
