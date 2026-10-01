import { buildSceneSourceTape, validateScenePlan } from './directorSegmentation.js';
import { buildSegmentationMessages, buildSegmentSkillRequest, buildSceneAuditMessages } from './directorSegmentationMessages.js';
import { identifyPromptContract, validateGeneratedSegment, parseSceneAudit } from './directorPromptValidation.js';
import { createSceneSnapshot } from './directorQuickStore.js';

const activePhases = new Set(['planning','validating-plan','generating','auditing','ready-to-commit']);
export const isQuickRunActive = run => Boolean(run && activePhases.has(run.phase));
const uid = () => crypto.randomUUID();
const parseJson = value => JSON.parse(String(value).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
const error = (message,code='FAILED') => Object.assign(new Error(message),{code});
const clone = value => structuredClone(value);
const snapshotKey = s => JSON.stringify([s.accountId,s.projectId,s.episodeId,s.sceneLabel]);

/** A scene transaction: no React closures or credentials belong in its checkpoint. */
export function createQuickGenerationController({getContext,executeText,executeSkill,checkpoints,commitRun,cancelRequest=()=>{},onChange=()=>{}}) {
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
    await assertCurrent(run,version);
    const taskId=`director-quick-${run.id}-${kind}-${uid()}`;
    run.pendingRequestId=taskId;await persist(run);
    await assertCurrent(run,version);
    const response=await (kind==='skill'?executeSkill:executeText)({...payload,taskId,snapshot:run.snapshot});
    await assertCurrent(run,version);
    run.pendingRequestId=null;
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
      if(!run.plan){
        let issues=run.planIssues||[];
        for(let attempt=run.planQualityFailures||0;attempt<2;attempt++){
          run.phase='planning';run.planningAttempts=(run.planningAttempts||0)+1;await persist(run);
          const output=run.lastPlanningOutput||await request(run,version,'plan',{messages:buildSegmentationMessages({snapshot:run.snapshot,tape,validationIssues:issues}),profileId:run.snapshot.profileId});
          run.phase='validating-plan';run.lastPlanningOutput=output;await persist(run);
          let candidate;
          try{candidate=parseJson(output);}catch{issues=[{code:'INVALID_JSON',message:'请只返回完整且有效的 JSON 计划'}];run.lastPlanningOutput='';run.planIssues=issues;run.planQualityFailures=(run.planQualityFailures||0)+1;await persist(run);continue;}
          const validated=validateScenePlan(candidate,{tape,maxDurationSeconds:run.snapshot.maxDurationSeconds});
          if(!validated.ok){issues=validated.issues;run.lastPlanningOutput='';run.planIssues=issues;run.planQualityFailures=(run.planQualityFailures||0)+1;await persist(run);continue;}
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
          if(run.segmentDrafts[segment.id]?.validated)continue;
          const previous=run.plan.segments[segment.index-2];
          let issues=run.segmentDrafts[segment.id]?.issues||[];
          let accepted=false;
          for(let attempt=run.segmentQualityFailures[segment.id]||0;attempt<2;attempt++){
            const built=buildSegmentSkillRequest({snapshot:run.snapshot,tape,plan:run.plan,segment,sharedBaseline:run.sharedBaseline,previousPrompt:previous?run.segmentDrafts[previous.id]?.prompt?.content:''});
            if(issues.length)built.input+=`\n\n【修正本条】\n${JSON.stringify(issues)}\n只修正本条问题，保持原台词、剧情、编号、目标时长和整场基准。`;
            run.currentSegmentIndex=segment.index;await persist(run);
            const output=await request(run,version,'skill',{...built,skillId:run.snapshot.skillId,profileId:run.snapshot.profileId});
            const checked=validateGeneratedSegment({output,expectedLabel:`${run.snapshot.sceneLabel}-${segment.index}`,source:tape.sourceText.slice(segment.sourceStart,segment.sourceEnd),contract,sharedBaseline:run.sharedBaseline});
            const failures=(run.segmentQualityFailures[segment.id]||0)+(checked.ok?0:1);
            run.segmentQualityFailures[segment.id]=failures;
            run.segmentDrafts[segment.id]={prompt:checked.prompt||{label:`${run.snapshot.sceneLabel}-${segment.index}`,content:output},baseline:checked.baseline||'',validated:checked.ok,issues:checked.issues||[],qualityFailures:failures};
            if(checked.ok&&!run.sharedBaseline&&checked.baseline)run.sharedBaseline=checked.baseline;
            await persist(run);
            if(checked.ok){if(!run.sharedBaseline && checked.baseline)run.sharedBaseline=checked.baseline;accepted=true;break;}
            issues=checked.issues||[];
          }
          if(!accepted)throw error(issues.map(i=>i.message||i.code).join('；')||`第 ${segment.index} 条未通过核对`,'NEEDS_REVIEW');
        }
        run.phase='auditing';await persist(run);
        let auditIssue=null;
        for(const range of auditRanges(run)){
          const rangeKey=range.join('-');if(run.checks.ranges[rangeKey])continue;
          const prompts=range.map(index=>run.segmentDrafts[run.plan.segments[index-1].id].prompt);
          const output=await request(run,version,'audit',{messages:buildSceneAuditMessages({snapshot:run.snapshot,tape,plan:run.plan,prompts,range}),profileId:run.snapshot.profileId});
          const result=parseSceneAudit(output,{plan:run.plan,range});
          if(!result.ok){auditIssue=result.issues;run.lastAuditOutput=output;break;}
          run.checks.ranges[rangeKey]=true;await persist(run);
        }
        if(auditIssue){
          const index=Math.min(...auditIssue.map(i=>Number(i.segmentIndex)).filter(i=>Number.isInteger(i)&&i>0));
          if(!Number.isFinite(index)||run.auditRepairIndexes.includes(index))throw error(auditIssue.map(i=>i.message||i.code).join('；')||'全场核对未通过','NEEDS_REVIEW');
          run.auditRepairIndexes.push(index);run.checks.ranges={};
          const failedId=run.plan.segments[index-1].id;
          run.segmentQualityFailures[failedId]=(run.segmentQualityFailures[failedId]||0)+1;
          for(const segment of run.plan.segments.slice(index-1))delete run.segmentDrafts[segment.id];
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
      run.phase=e.code==='ACCOUNT_CHANGED'?'paused':e.code==='STALE'?'stale':e.code==='NEEDS_REVIEW'?'needs-review':'failed';
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
    async start(sceneRequest){
      const snapshot=await createSceneSnapshot(sceneRequest);
      if([...runs.values()].some(r=>isQuickRunActive(r)&&snapshotKey(r.snapshot)===snapshotKey(snapshot)))throw error('当前场景正在生成','BUSY');
      const run={id:uid(),snapshot,phase:'planning',createdAt:new Date().toISOString(),revision:0,plan:null,segmentDrafts:{},segmentQualityFailures:{},sharedBaseline:'',checks:{audited:false,ranges:{}},errors:[],promptIds:[],auditRepairIndexes:[]};
      runs.set(run.id,run);
      const initialVersion=versions.get(run.id)||0;
      await persist(run);
      if(disposed||!isQuickRunActive(run)||(versions.get(run.id)||0)!==initialVersion)return clone(run);
      return schedule(run);
    },
    async resume(runId){
      let run=runs.get(runId);if(!run){run=await checkpoints.load({runId});if(!run)throw error('找不到生成进度');runs.set(runId,run);}
      run.checks||={audited:false,ranges:{}};run.checks.ranges||={};run.auditRepairIndexes||=[];run.segmentQualityFailures||={};
      if(run.phase==='completed')return clone(run);
      return schedule(run);
    },
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
      for(const run of saved||[]){if(!run?.id||!run.snapshot||runs.has(run.id))continue;
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
