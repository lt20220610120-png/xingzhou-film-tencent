import { buildSceneSourceTape, validateScenePlan, parseStructuredJson } from './directorSegmentation.js';
import { recalibrateScenePlanTimings, getDirectorSegmentTimingFacts } from './directorTiming.js';
import { packScenePlan } from './directorPlanPacking.js';
import { buildSegmentationMessages, buildWholeSceneSkillRequest, buildSceneAuditMessages } from './directorSegmentationMessages.js';
import { identifyPromptContract, validateAndRepairGeneratedSegment, splitWholeScenePromptOutput, parseSceneAudit } from './directorPromptValidation.js';
import { createSceneSnapshot } from './directorQuickStore.js';
import { effectiveDirectorDurationLimit } from './directorDurationPolicy.js';

const activePhases = new Set(['planning','validating-plan','generating','auditing','ready-to-commit']);
export const isQuickRunActive = run => Boolean(run && activePhases.has(run.phase));
const uid = () => crypto.randomUUID();
const parseJson = parseStructuredJson;
const error = (message,code='FAILED') => Object.assign(new Error(message),{code});
const clone = value => structuredClone(value);
const snapshotKey = s => JSON.stringify([s.accountId,s.projectId,s.episodeId,s.sceneLabel]);
const PROCESSING_VERSION = 7;
const issueMessages = issues => [...new Set((issues || []).map(issue => issue.message || issue.code).filter(Boolean))].join('；');
const trimmedRange=(sourceText,start,end)=>{
  while(start<end&&/\s/u.test(sourceText[start]))start++;
  while(end>start&&/\s/u.test(sourceText[end-1]))end--;
  return {sourceStart:start,sourceEnd:end};
};
// Old plan offsets refer to its canonical text before harmless import markers
// were removed. Map those positions to the new tape; repeated lines must retain
// their own paid performances instead of borrowing the first equal string.
const reusablePaidRanges=(run,tape)=>{
  const oldText=run.plan.sourceText,oldTape=buildSceneSourceTape(oldText);
  if(oldTape.sourceText!==tape.sourceText)return [];
  return run.plan.segments.flatMap(segment=>{
    const draft=run.segmentDrafts[segment.id];if(!draft?.prompt?.content)return [];
    const rows=oldTape.sourceMap.filter(row=>row.kind==='text'&&row.originalStart<segment.sourceEnd&&row.originalEnd>segment.sourceStart);
    if(!rows.length)return [];
    const mapped=(row,offset)=>row.sourceStart+oldText.slice(row.originalStart,Math.max(row.originalStart,Math.min(offset,row.originalEnd))).replace(/\r\n?/gu,'\n').length;
    const range=trimmedRange(tape.sourceText,mapped(rows[0],segment.sourceStart),mapped(rows.at(-1),segment.sourceEnd));
    return [{...range,source:tape.sourceText.slice(range.sourceStart,range.sourceEnd),output:draft.prompt.content}];
  });
};

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
      if(kind==='skill'&&e.partialText){
        run.wholeSceneResponses||=[];
        run.wholeSceneResponses.push({output:e.partialText,complete:false,planId:run.plan?.id,requestGroupId:payload.requestGroupId,at:new Date().toISOString(),error:e.message});
        run.wholeSceneOutput=e.partialText;
        await persist(run);
      }
      // Only explicit completion recovery gets a bounded larger-output retry.
      // HTTP failures may already have reached a paid provider, even when they
      // return no partial body. The verified pre-forward 429 is handled below
      // the IPC boundary by the gateway admission scheduler.
      const retryable=/输出被截断|只返回了推理过程|没有返回模型正文/i.test(e.message||'');
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
      if(run.processingVersion!==PROCESSING_VERSION){
        const recoveringVersion6=run.processingVersion===6;
        const context=await assertCurrent(run,version),contract=identifyPromptContract(context.skill);
      run.segmentQualityFailures={};run.wholeSceneQualityFailures=0;run.wholeSceneIssues=[];run.auditRepairIndexes=[];run.auditRepairAttempts={};run.auditWarnings=[];run.checks={audited:false,ranges:{}};
        run.planQualityFailures=0;run.planIssues=[];
        if(groundedTiming&&run.plan){
          const candidate={segments:run.plan.segments.map(segment=>{
            const unit=tape.units.find(unit=>unit.end===segment.sourceEnd)||tape.units.find(unit=>unit.start<segment.sourceEnd&&unit.end>segment.sourceEnd);
            return {...segment,end:unit?{unitId:unit.id,...(unit.end===segment.sourceEnd?{}:{prefix:unit.text.slice(0,segment.sourceEnd-unit.start)})}:null};
          })};
          const calibrated=recalibrateScenePlanTimings(candidate,{tape,maxDurationSeconds:run.snapshot.maxDurationSeconds}).candidate;
          const packed=packScenePlan(calibrated,{tape,maxDurationSeconds:run.snapshot.maxDurationSeconds});
          const checked=validateScenePlan(packed.candidate,{tape,maxDurationSeconds:run.snapshot.maxDurationSeconds,groundedTiming:true});
          const paidPartition=validateScenePlan(candidate,{tape,maxDurationSeconds:run.snapshot.maxDurationSeconds,groundedTiming:false});
          const completePaidDrafts=recoveringVersion6&&run.plan.sourceText===tape.sourceText&&paidPartition.ok&&run.plan.segments.every(segment=>{
            const draft=run.segmentDrafts[segment.id];
            const speech=getDirectorSegmentTimingFacts({sourceText:tape.sourceText,sourceStart:segment.sourceStart,sourceEnd:segment.sourceEnd});
            const capacity=segment.durationCompression?35:effectiveDirectorDurationLimit(run.snapshot.maxDurationSeconds);
            return speech.speechSecondsAt4<=capacity+0.25&&draft?.prompt?.content&&validateAndRepairGeneratedSegment({output:draft.prompt.content,expectedLabel:`${run.snapshot.sceneLabel}-${segment.index}`,source:sourceFor(segment),contract,sharedBaseline:run.sharedBaseline}).ok;
          });
          const partitionChanged=checked.ok&&(checked.plan.segments.length!==run.plan.segments.length||checked.plan.segments.some((segment,index)=>segment.sourceStart!==run.plan.segments[index].sourceStart||segment.sourceEnd!==run.plan.segments[index].sourceEnd));
          const compressionChanged=checked.ok&&checked.plan.segments.some((segment,index)=>JSON.stringify(segment.durationCompression||null)!==JSON.stringify(run.plan.segments[index]?.durationCompression||null));
          if(completePaidDrafts){
            // v2.4.15 paid plans already have complete legal speech boundaries.
            // Re-estimating shorter actions cannot justify regenerating every
            // paid clip. New scenes still receive the new timing/packing rules.
            run.recoveredPaidPartition=true;
          }else if(!checked.ok||partitionChanged||compressionChanged||run.plan.sourceText!==tape.sourceText){
            if(recoveringVersion6)run.reusablePaidClips=reusablePaidRanges(run,tape);
            run.previousDrafts=[...(run.previousDrafts||[]),...Object.values(run.segmentDrafts).filter(d=>d.prompt?.content)];
            // A partially published plan is immutable. A new source partition
            // needs fresh plan/prompt IDs while preserving its paid history.
            run.nextPlanId=`plan-${run.id}-revised-${uid()}`;
            run.previousPlans=[...(run.previousPlans||[]),clone(run.plan)];
            run.previousWholeSceneResponses=[...(run.previousWholeSceneResponses||[]),...(run.wholeSceneResponses||[])];
            run.wholeSceneResponses=[];run.wholeSceneOutput='';run.processedWholeSceneResponseIndex=-1;run.wholeSceneQualityFailures=0;run.wholeSceneIssues=[];
            run.previousPlan=run.plan;run.plan=null;run.segmentDrafts={};run.promptIds=[];run.sharedBaseline='';run.lastPlanningOutput=recoveringVersion6&&checked.ok?JSON.stringify(packed.candidate):'';
          }else{
            const published=context.episode.quickScenePlans?.find(plan=>plan.id===run.plan.id);
            // New timing facts alone cannot rewrite a plan already referenced
            // by saved cards. The store rejects differing JSON for that ID.
            run.plan=published?clone(published):{...run.plan,segments:checked.plan.segments.map((segment,i)=>({...segment,id:run.plan.segments[i].id,index:i+1}))};
          }
        }
        let baseline='';
        for(const segment of run.plan?.segments||[]){
          const draft=run.segmentDrafts[segment.id];if(!draft?.prompt?.content)continue;
          const checked=validateAndRepairGeneratedSegment({output:draft.prompt.content,expectedLabel:`${run.snapshot.sceneLabel}-${segment.index}`,source:sourceFor(segment),contract,sharedBaseline:baseline});
          run.segmentDrafts[segment.id]={...draft,prompt:checked.prompt||{...draft.prompt,content:checked.output},baseline:checked.baseline||'',validated:checked.ok,issues:checked.issues||[],localRepairs:checked.repairs};
          if(checked.ok&&!baseline&&checked.baseline)baseline=checked.baseline;
        }
        run.sharedBaseline=baseline||run.sharedBaseline;run.processingVersion=PROCESSING_VERSION;await persist(run);
        if(recoveringVersion6&&!run.plan&&!run.lastPlanningOutput&&run.previousPlanningCandidate){
          const calibrated=recalibrateScenePlanTimings(run.previousPlanningCandidate,{tape,maxDurationSeconds:run.snapshot.maxDurationSeconds}).candidate;
          const packed=packScenePlan(calibrated,{tape,maxDurationSeconds:run.snapshot.maxDurationSeconds});
          if(validateScenePlan(packed.candidate,{tape,maxDurationSeconds:run.snapshot.maxDurationSeconds,groundedTiming:true}).ok){run.lastPlanningOutput=JSON.stringify(packed.candidate);await persist(run);}
        }
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
            const originalSegmentCount=candidate.segments?.length;
            const calibration=recalibrateScenePlanTimings(candidate,{tape,maxDurationSeconds:run.snapshot.maxDurationSeconds});
            candidate=calibration.candidate;
            if(calibration.changed)run.timingCalibration={version:2,changes:calibration.changes};
            if(candidate.segments?.length!==originalSegmentCount)run.planPacking={version:2,originalSegmentCount,segmentCount:candidate.segments?.length};
            const packed=packScenePlan(candidate,{tape,maxDurationSeconds:run.snapshot.maxDurationSeconds});
            if(packed.changed){run.planPacking={version:1,originalSegmentCount:packed.originalSegmentCount,segmentCount:packed.segmentCount};candidate=packed.candidate;}
          }
          const validated=validateScenePlan(candidate,{tape,maxDurationSeconds:run.snapshot.maxDurationSeconds,groundedTiming});
          if(!validated.ok){issues=validated.issues;run.previousPlanningCandidate=candidate;run.planningHistory=[...(run.planningHistory||[]),{output,issues,at:new Date().toISOString()}].slice(-3);run.lastPlanningOutput='';run.planIssues=issues;run.planQualityFailures=(run.planQualityFailures||0)+1;await persist(run);continue;}
          run.plan={...validated.plan,id:run.nextPlanId||`plan-${run.id}`,version:1,sceneLabel:run.snapshot.sceneLabel,
            sourceSnapshot:tape.sourceSnapshot,sourceText:tape.sourceText,sceneHeader:tape.sceneHeader,
            sourceHash:run.snapshot.sourceHash,settingsHash:run.snapshot.settingsHash,skillHash:run.snapshot.skillHash,profileHash:run.snapshot.profileHash,
            maxDurationSeconds:run.snapshot.maxDurationSeconds,rulesVersion:1,createdAt:new Date().toISOString(),
            segments:validated.plan.segments.map((s,i)=>({...s,id:`${run.nextPlanId||run.id}-segment-${i+1}`,index:i+1}))};
          run.promptIds=run.plan.segments.map(()=>uid());run.commitKey=run.id;run.lastPlanningOutput='';await persist(run);break;
        }
        if(!run.plan)throw error(issueMessages(issues)||'分段计划未通过时长与原文核对','NEEDS_REVIEW');
      }
      // When only import formatting/provenance changes, recover exact matching
      // paid ranges under the new immutable plan. Merged or otherwise changed
      // ranges still require whole-scene direction through the original Skill.
      if(run.reusablePaidClips?.length){
        const context=await assertCurrent(run,version),contract=identifyPromptContract(context.skill);
        for(const segment of run.plan.segments){
          if(run.segmentDrafts[segment.id]?.validated)continue;
          const source=sourceFor(segment),label=`${run.snapshot.sceneLabel}-${segment.index}`;
          const range=trimmedRange(tape.sourceText,segment.sourceStart,segment.sourceEnd);
          const cachedIndex=run.reusablePaidClips.findIndex(clip=>clip.sourceStart===range.sourceStart&&clip.sourceEnd===range.sourceEnd&&clip.source===tape.sourceText.slice(range.sourceStart,range.sourceEnd));
          const cached=run.reusablePaidClips[cachedIndex];
          if(!cached)continue;
          const output=cached.output.replace(/^\d+-\d+-\d+(?=\s*\n)/u,label);
          const checked=validateAndRepairGeneratedSegment({output,expectedLabel:label,source,contract,sharedBaseline:run.sharedBaseline});
          if(!checked.ok)continue;
          run.segmentDrafts[segment.id]={prompt:checked.prompt,validated:true,issues:[],baseline:checked.baseline||'',localRepairs:checked.repairs,recoveredPaidText:true};
          run.reusablePaidClips.splice(cachedIndex,1);
          if(!run.sharedBaseline&&checked.baseline)run.sharedBaseline=checked.baseline;
        }
        run.reusablePaidClips=[];await persist(run);
      }
      // An interrupted run from this same processing version can already have
      // paid text that needs only deterministic formatting repairs introduced
      // after it was saved. Recover that text before making another request;
      // keep the calibrated plan, accepted clips and their durable IDs intact.
      const recoveryContext=await assertCurrent(run,version);
      const recoveryContract=identifyPromptContract(recoveryContext.skill);
      let recoveredDraft=false;
      for(const segment of run.plan.segments){
        const draft=run.segmentDrafts[segment.id];
        if(draft?.validated||!draft?.prompt?.content)continue;
        const checked=validateAndRepairGeneratedSegment({output:draft.prompt.content,expectedLabel:`${run.snapshot.sceneLabel}-${segment.index}`,source:sourceFor(segment),contract:recoveryContract,sharedBaseline:run.sharedBaseline});
        if(!checked.ok&&checked.output===draft.prompt.content)continue;
        run.segmentDrafts[segment.id]={...draft,prompt:checked.prompt||{...draft.prompt,content:checked.output},baseline:checked.baseline||'',validated:checked.ok,issues:checked.issues||[],localRepairs:[...new Set([...(draft.localRepairs||[]),...checked.repairs])]};
        if(checked.ok&&!run.sharedBaseline&&checked.baseline)run.sharedBaseline=checked.baseline;
        recoveredDraft=true;
      }
      if(recoveredDraft)await persist(run);
      while(!run.checks.audited){
        run.phase='generating';await persist(run);
        const context=await assertCurrent(run,version);
        const contract=identifyPromptContract(context.skill);
        let publishedProgress=false;
        const publishProgress=async()=>{if(commitProgress){await assertCurrent(run,version);const result=await commitProgress(clone(run));if(!result?.applied)throw error(result?.conflict||'已生成结果保存失败','STALE');await assertCurrent(run,version);publishedProgress=true;}};
        const consumeResponse=async(response,responseIndex)=>{
          const labels=run.plan.segments.map(segment=>`${run.snapshot.sceneLabel}-${segment.index}`);
          const parsed=splitWholeScenePromptOutput({output:response.output,expectedLabels:labels,complete:response.complete!==false});
          const issues=[...parsed.issues];
          for(const segment of run.plan.segments){
            const label=labels[segment.index-1],item=parsed.prompts.find(prompt=>prompt.label===label);
            if(!item)continue;
            const existing=run.segmentDrafts[segment.id];
            const checked=validateAndRepairGeneratedSegment({output:item.content,expectedLabel:label,source:sourceFor(segment),contract,sharedBaseline:run.sharedBaseline});
            if(existing?.validated){
              // The accepted local draft is authoritative. Repair calls still
              // rehearse the whole scene; a model's rewritten copy must neither
              // replace this card nor block a correct repair of another card.
              continue;
            }
            run.currentSegmentIndex=segment.index;
            run.segmentDrafts[segment.id]={...existing,prompt:checked.prompt||{label,content:checked.output},baseline:checked.baseline||'',validated:checked.ok,issues:checked.issues||[],localRepairs:checked.repairs};
            if(checked.ok&&!run.sharedBaseline&&checked.baseline)run.sharedBaseline=checked.baseline;
            if(!checked.ok)issues.push(...checked.issues.map(issue=>({...issue,segmentIndex:segment.index})));
            await persist(run);
            if(checked.ok)await publishProgress();
          }
          run.wholeSceneIssues=issues;
          run.processedWholeSceneResponseIndex=responseIndex;
          if(issues.length)run.wholeSceneQualityFailures=(run.wholeSceneQualityFailures||0)+1;
          await persist(run);
        };
        // A complete API response is written before any split/validation/store
        // work. A crash here can consume that paid response on resume locally.
        for(let index=(run.processedWholeSceneResponseIndex??-1)+1;index<(run.wholeSceneResponses||[]).length;index++){
          const response=run.wholeSceneResponses[index];
          // A bounded completion retry belongs to one paid request chain. If
          // its full reply is already cached, do not first lock an earlier
          // truncated draft as accepted text after a crash/restart.
          const superseded=response.complete===false&&response.requestGroupId&&run.wholeSceneResponses.slice(index+1).some(later=>later.complete!==false&&later.planId===response.planId&&later.requestGroupId===response.requestGroupId);
          if(superseded){run.processedWholeSceneResponseIndex=index;await persist(run);continue;}
          if(response.planId===run.plan.id)await consumeResponse(response,index);
          else{run.processedWholeSceneResponseIndex=index;await persist(run);}
        }
        const finished=()=>run.plan.segments.every(segment=>run.segmentDrafts[segment.id]?.validated)&&!(run.wholeSceneIssues||[]).length;
        while(!finished()&&(run.wholeSceneQualityFailures||0)<maxQualityAttempts){
          const validationIssues=[...(run.wholeSceneIssues||[]),...run.plan.segments.flatMap(segment=>(run.segmentDrafts[segment.id]?.issues||[]).map(issue=>({...issue,segmentIndex:segment.index})))];
          const built=buildWholeSceneSkillRequest({snapshot:run.snapshot,tape,plan:run.plan,sharedBaseline:run.sharedBaseline,drafts:run.segmentDrafts,validationIssues,repairAttempt:run.wholeSceneQualityFailures||0});
          run.currentSegmentIndex=null;run.wholeSceneAttempts=(run.wholeSceneAttempts||0)+1;await persist(run);
          const requestGroupId=uid();
          const output=await request(run,version,'skill',{...built,requestGroupId,skillId:run.snapshot.skillId,profileId:run.snapshot.profileId});
          run.wholeSceneResponses||=[];
          run.wholeSceneResponses.push({output,complete:true,planId:run.plan.id,requestGroupId,at:new Date().toISOString()});
          run.wholeSceneOutput=output;await persist(run);
          await consumeResponse(run.wholeSceneResponses.at(-1),run.wholeSceneResponses.length-1);
        }
        if(!finished())throw error(issueMessages(run.wholeSceneIssues)||'整场提示词尚未完整通过核对','NEEDS_REVIEW');
        // Re-publish recovered validated cards without changing their IDs.
        if(!publishedProgress)await publishProgress();
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
            const existing=run.segmentDrafts[segment.id];
            if(existing?.prompt?.content)run.previousDrafts=[...(run.previousDrafts||[]),clone(existing)];
            run.segmentDrafts[segment.id]={...existing,validated:false,issues:segment.index===index?auditIssue:[]};
            run.segmentQualityFailures[segment.id]=0;
          }
          run.wholeSceneQualityFailures=0;run.wholeSceneIssues=auditIssue;
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
      const run={id,kind:'scene',...(batchId?{batchId}:{}),snapshot,phase:'planning',createdAt:new Date().toISOString(),revision:0,processingVersion:PROCESSING_VERSION,plan:null,segmentDrafts:{},segmentQualityFailures:{},sharedBaseline:'',checks:{audited:false,ranges:{}},errors:[],promptIds:[],auditRepairIndexes:[]};
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
        run.repairRounds=(run.repairRounds||0)+1;run.planQualityFailures=0;run.wholeSceneQualityFailures=0;
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
