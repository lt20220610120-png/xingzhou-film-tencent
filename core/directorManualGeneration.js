import {directorRunEntries} from './directorRunView.js';
import {createSceneSnapshot,snapshotMatchesContext,directorSceneInput} from './directorQuickStore.js';
import {buildNumberedSceneTasks,buildWholeSceneSubmission,splitNumberedPromptOutput} from './directorCreative.js';
import {buildProjectPreamble,collectDirectorPromptHistory} from './projectStore.js';
import {isQuickRunActive} from './directorQuickGeneration.js';
import {buildDirectorOwnershipReview,parseDirectorOwnershipReview} from './directorOwnershipReview.js';

const clone=value=>structuredClone(value);
const fault=(message,code='FAILED')=>Object.assign(new Error(message),{code});
export function manualSceneTasks(source,label){
 const tasks=buildNumberedSceneTasks(source,label);
 if(new Set(tasks.map(t=>t.label)).size!==tasks.length)throw fault(`场景 ${label} 的人工分段编号重复，请先整理`);
 const chunks=String(source||'').split(/^\s*[（(]\d+[）)]\s*$/mu);
 if(chunks.length>1&&chunks.slice(1).some(s=>!s.trim()))throw fault(`场景 ${label} 有空白人工分段，请先整理`);
 return tasks;
}
function parseReply(run){
 const labels=run.expectedLabels,parts=splitNumberedPromptOutput(run.output);
 if(parts.length!==labels.length)throw fault(`整场应返回 ${labels.length} 条，实际返回 ${parts.length} 条；完整回包已保存，请核对后重新建立任务`,'NEEDS_REVIEW');
 return parts.map((part,i)=>{
  const label=labels[i];
  if(part.label!==label&&part.label!==label.split('-').at(-1))throw fault(`提示词编号 ${part.label} 与人工分段 ${label} 不一致，回包已保存`,'NEEDS_REVIEW');
  const canonical=/^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\d+-\d+-\d+(?:\*\*|__)?\s*$/.test(part.content.split('\n',1)[0]);
  if(!(canonical?part.content.split('\n').slice(1).join('\n'):part.content).trim())throw fault(`提示词 ${label} 正文为空，回包已保存`,'NEEDS_REVIEW');
  return{label,content:canonical?part.content:`${label}\n${part.content}`};
 });
}
export function commitManualSceneRun(state,run){
 const fail=message=>({state,applied:false,conflict:message});
 const s=run.snapshot,project=state.directorProjects?.find(p=>p.id===s.projectId),episode=project?.episodes?.find(e=>e.id===s.episodeId);
 if(state.accountId!==s.accountId||!project||!episode)return fail('账号或目标项目已变化，完整回包已保留');
 if(episode.activeSceneGenerationRuns?.[s.sceneLabel]?.runId&&episode.activeSceneGenerationRuns[s.sceneLabel].runId!==run.id)return fail('本场已有新的生成批次，旧结果仅保留在历史中');
 if(project.cloudLocked||project.cloudConflict||project.canWrite===false||project.permissions?.canWrite===false||project.permissions?.canGenerate===false||episode.canWrite===false)return fail('项目锁定或权限已变化，完整回包已保留');
 if(!snapshotMatchesContext(s,{accountId:state.accountId,project,episode,sceneLabel:s.sceneLabel,inputText:directorSceneInput(project,episode,s.sceneLabel),skill:state.skills?.find(x=>x.id===s.skillId),profile:state.apiProfiles?.find(x=>x.id===s.profileId)}))return fail('提交时原文或配置已变化，完整回包已保留');
 const history=collectDirectorPromptHistory(project),current=episode.prompts||[],deleted=new Set([...(project.deletedPromptIds||[]),...project.episodes.flatMap(e=>e.deletedPromptIds||[])]);
 if(run.promptIds.some(id=>deleted.has(id)))return fail('本次结果已删除，不会通过继续任务重新添加');
 const records=run.prompts.map((p,i)=>({...p,id:run.promptIds[i],sceneLabel:s.sceneLabel,generationMode:'quick',segmentationMode:'manual',generationRunId:run.id,promptEditionId:s.promptEditionId,skillId:s.skillId,profileId:s.profileId,profileHash:s.profileHash,skill:state.skills?.find(x=>x.id===s.skillId)?.name||'',sourceText:run.sourceText,sourceHash:s.sourceHash,createdAt:run.createdAt,
  ...(run.reviewRequired?{sceneAuditStatus:run.ownershipReview?.find(r=>r.label===p.label)?.ok?'passed':run.auditStatus||'pending',sceneAuditWarnings:(run.ownershipReview?.find(r=>r.label===p.label)?.issues||run.auditWarnings||[]).map(message=>({code:'AGENT_OWNERSHIP_REVIEW',message}))}:{})}));
 for(const p of records)for(const old of [current.find(x=>x.id===p.id),history.find(x=>x.id===p.id)])if(old&&(old.generationRunId!==run.id||old.content!==p.content&&run.committedContents?.[p.id]!==old.content))return fail('已生成内容被人工修改，保留修改和原始回包');
 const replacements=new Map(records.map(p=>[p.id,p]));
 const merge=list=>[...list.map(p=>replacements.get(p.id)||p),...records.filter(p=>!list.some(old=>old.id===p.id))];
 const next={...project,promptHistory:merge(history),episodes:project.episodes.map(e=>e.id===episode.id?{...e,prompts:merge(current),manualSceneReplies:[...(e.manualSceneReplies||[]),...(!(e.manualSceneReplies||[]).some(r=>r.id===run.id)&&run.output?[{id:run.id,sceneLabel:s.sceneLabel,output:run.output,sourceText:run.sourceText,createdAt:run.createdAt}]:[])],status:'已生成提示词'}:e)};
 return{state:{...state,directorProjects:state.directorProjects.map(p=>p.id===project.id?next:p)},applied:true};
}

/** Manual boundaries are immutable input. One complete original Skill request
 * per scene; paid replies are checkpointed before parsing or publishing. */
export function createDirectorManualController({getContext,executeSkill,reviewSkill=null,checkpoints,commitRun,beginRun=null,cancelRequest=()=>{},onChange=()=>{}}){
 const runs=new Map(),executions=new Map(),tails=new Map();let disposed=false;
 const persist=async run=>{run.updatedAt=new Date().toISOString();run.revision=(run.revision||0)+1;const copy=clone(run),tail=(tails.get(run.id)||Promise.resolve()).catch(()=>{}).then(()=>checkpoints.save({run:copy}));tails.set(run.id,tail);await tail;if(!disposed)onChange();};
 const assertCurrent=async run=>{
  if(disposed||run.stopRequested)throw fault('整本任务已停止，已返回内容保留','PAUSED');
  const context=await getContext(run.snapshot);
  if(context?.accountId!==run.snapshot.accountId)throw fault('账号已切换，完整回包已保留','ACCOUNT_CHANGED');
  const currentRun=context.episode?.activeSceneGenerationRuns?.[run.snapshot.sceneLabel]?.runId;
  if(currentRun&&currentRun!==run.id)throw fault('本场已开始新的生成批次，旧任务仅保留在历史中','STALE');
  if(!context.project||!context.episode||context.permissions?.canGenerate===false||context.project.cloudLocked||context.project.cloudConflict)throw fault('项目或权限已变化，完整回包已保留','STALE');
  if(!await snapshotMatchesContext(run.snapshot,{...context,sceneLabel:run.snapshot.sceneLabel,inputText:directorSceneInput(context.project,context.episode,run.snapshot.sceneLabel)}))throw fault('原文、项目设定、Skill 或模型已变化，完整回包已保留','STALE');
 };
 const execute=async run=>{
  const commit=async()=>{await assertCurrent(run);const saved=await commitRun(clone(run));if(!saved?.applied)throw fault(saved?.conflict||'保存失败，完整回包已保留','STALE');run.committedContents=Object.fromEntries(run.prompts.map((p,i)=>[run.promptIds[i],p.content]));await persist(run);};
  try{
   await assertCurrent(run);
   if(!run.output){
    if(run.partialOutput)throw fault('上次回包截断，已返回文字保留；请核对后重新建立任务','NEEDS_REVIEW');
    run.phase='generating';run.pendingRequestId=`director-manual-${run.id}-${crypto.randomUUID()}`;await persist(run);await assertCurrent(run);
    const result=await executeSkill({snapshot:run.snapshot,taskId:run.pendingRequestId,skillId:run.snapshot.skillId,input:buildWholeSceneSubmission({sourceText:run.sourceText,segmentSource:run.snapshot.sourceSnapshot,expectedLabels:run.expectedLabels}),expectedLabels:run.expectedLabels,maxOutputTokens:32768});
    run.output=result?.output??result;run.pendingRequestId=null;await persist(run);
   }
   await assertCurrent(run);
   if(typeof run.output!=='string'||!run.output.trim())throw fault('接口未返回提示词正文');
   run.prompts=parseReply(run);
   if(run.reviewRequired){
    run.originalOutput||=run.output;
    if(!run.committedContents){run.auditStatus='pending';await persist(run);await commit();}
    run.phase='auditing';await persist(run);await assertCurrent(run);
    if(!run.reviewOutput){
     if(run.pauseRequested)throw fault('已保存生成正文，逐段复核尚未开始','PAUSED');
     if(run.reviewPartialOutput)throw fault('上次复核回包未完成，已保留正文与复核记录，请重新生成或人工核对','NEEDS_REVIEW');
     run.pendingStage='review';run.pendingRequestId=`director-manual-review-${run.id}-${crypto.randomUUID()}`;await persist(run);await assertCurrent(run);
     const result=await reviewSkill({snapshot:run.snapshot,taskId:run.pendingRequestId,skillId:run.snapshot.skillId,...buildDirectorOwnershipReview(run),expectedLabels:run.expectedLabels,maxOutputTokens:32768});
     run.reviewOutput=result?.output??result;run.pendingRequestId=null;await persist(run);await assertCurrent(run);
    }
    run.ownershipReview=parseDirectorOwnershipReview(run.reviewOutput,run.expectedLabels);
    run.auditWarnings=run.ownershipReview.flatMap(row=>row.issues.map(issue=>`${row.label}：${issue}`));
    run.prompts=run.prompts.map(prompt=>{const row=run.ownershipReview.find(r=>r.label===prompt.label);return row.correctedContent?parseReply({expectedLabels:[prompt.label],output:row.correctedContent})[0]:prompt;});
    run.output=run.prompts.map(p=>p.content).join('\n\n');run.auditStatus=run.ownershipReview.every(r=>r.ok)?'passed':'warning';await persist(run);
   }
   run.phase='ready-to-commit';await persist(run);await commit();
   if(run.reviewRequired&&run.auditStatus!=='passed')throw fault(run.auditWarnings.join('；')||'Agent逐段复核尚未通过，正文与问题已保留','NEEDS_REVIEW');
   run.phase='completed';run.errors=[];await persist(run);
  }catch(e){
   if(e.partialText){if(run.pendingStage==='review')run.reviewPartialOutput=e.partialText;else{run.partialOutput=e.partialText;run.output='';}}
   if(run.reviewRequired&&run.prompts?.length&&run.phase==='auditing'&&!['PAUSED','ACCOUNT_CHANGED','STALE'].includes(e.code)){run.auditStatus='warning';run.auditWarnings=[e.message];try{await commit();}catch{/* Never overwrite edits or a new batch merely to record an audit failure. */}}
   run.pendingRequestId=null;run.phase=['PAUSED','ACCOUNT_CHANGED'].includes(e.code)?'paused':e.code==='STALE'?'stale':e.code==='NEEDS_REVIEW'?'needs-review':'failed';run.errors=[{message:e.message,code:e.code||'FAILED',at:new Date().toISOString()}];
   try{await persist(run);}catch(saveError){run.errors.push({code:'SAVE_FAILED',message:saveError.message});if(!disposed)onChange();}
  }
  return clone(run);
 };
 const schedule=run=>{if(executions.has(run.id))return executions.get(run.id);const task=execute(run).finally(()=>executions.delete(run.id));executions.set(run.id,task);return task;};
 return{
  get:id=>runs.has(id)?clone(runs.get(id)):null,entries:options=>directorRunEntries(runs.values(),options),
  async start(context,{runId=crypto.randomUUID(),batchId}={}){
   if(disposed)throw fault('任务已停止');
   const snapshot=await createSceneSnapshot(context),expectedLabels=manualSceneTasks(snapshot.sourceSnapshot,snapshot.sceneLabel).map(t=>t.label);
   if(!expectedLabels.length)throw fault('场景为空');
   if([...runs.values()].some(r=>isQuickRunActive(r)&&r.snapshot.accountId===snapshot.accountId&&r.snapshot.projectId===snapshot.projectId&&r.snapshot.episodeId===snapshot.episodeId&&r.snapshot.sceneLabel===snapshot.sceneLabel))throw fault('当前场景正在生成','BUSY');
   if(runs.has(runId))throw fault('任务编号已存在','BUSY');
   const run={id:runId,kind:'manual-scene',batchId,snapshot,phase:'generating',createdAt:new Date().toISOString(),revision:0,reviewRequired:Boolean(reviewSkill),expectedLabels,promptIds:expectedLabels.map(()=>crypto.randomUUID()),sourceText:[buildProjectPreamble(context.project),snapshot.sourceSnapshot].filter(Boolean).join('\n\n'),errors:[]};runs.set(runId,run);await persist(run);
   if(beginRun){try{const result=await beginRun(clone(run));if(!result?.applied)throw fault(result?.conflict||'新批次准备失败','STALE');}catch(e){run.phase=e.code==='STALE'?'stale':'failed';run.errors=[{code:e.code||'SAVE_FAILED',message:e.message}];await persist(run);return clone(run);}}
   return schedule(run);
  },
  async resume(id){let run=runs.get(id);if(!run){run=await checkpoints.load({runId:id});if(run?.kind!=='manual-scene')throw fault('找不到人工分段进度');runs.set(id,run);}if(run.phase==='completed')return clone(run);if(executions.has(id))return executions.get(id);run.stopRequested=false;run.pauseRequested=false;return schedule(run);},
  async pauseAfterRequest(id){const run=runs.get(id);if(run&&isQuickRunActive(run)){run.pauseRequested=true;await persist(run);}},
  async stop(id){const run=runs.get(id);if(!run||!isQuickRunActive(run))return;run.stopRequested=true;run.phase='paused';await persist(run);if(run.pendingRequestId)try{await cancelRequest(run.pendingRequestId);}catch{}},
  async restore(){for(const run of await checkpoints.list()){if(run?.kind!=='manual-scene'||runs.has(run.id))continue;if(isQuickRunActive(run))run.phase='paused';runs.set(run.id,run);}if(!disposed)onChange();},
  async pauseAll(){await Promise.all([...runs.values()].filter(isQuickRunActive).map(r=>this.stop(r.id)));},
  activate(){disposed=false;},dispose(){disposed=true;for(const run of runs.values())if(run.pendingRequestId)cancelRequest(run.pendingRequestId);},
 };
}
