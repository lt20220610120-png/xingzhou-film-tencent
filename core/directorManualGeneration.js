import {createSceneSnapshot,snapshotMatchesContext,directorSceneInput} from './directorQuickStore.js';
import {buildNumberedSceneTasks,buildWholeSceneSubmission,splitNumberedPromptOutput} from './directorCreative.js';
import {buildProjectPreamble,collectDirectorPromptHistory} from './projectStore.js';
import {isQuickRunActive} from './directorQuickGeneration.js';

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
 if(project.cloudLocked||project.cloudConflict||project.canWrite===false||project.permissions?.canWrite===false||project.permissions?.canGenerate===false||episode.canWrite===false)return fail('项目锁定或权限已变化，完整回包已保留');
 if(!snapshotMatchesContext(s,{accountId:state.accountId,project,episode,sceneLabel:s.sceneLabel,inputText:directorSceneInput(project,episode,s.sceneLabel),skill:state.skills?.find(x=>x.id===s.skillId),profile:state.apiProfiles?.find(x=>x.id===s.profileId)}))return fail('提交时原文或配置已变化，完整回包已保留');
 const history=collectDirectorPromptHistory(project),current=episode.prompts||[],deleted=new Set([...(project.deletedPromptIds||[]),...project.episodes.flatMap(e=>e.deletedPromptIds||[])]);
 if(run.promptIds.some(id=>deleted.has(id)))return fail('本次结果已删除，不会通过继续任务重新添加');
 const records=run.prompts.map((p,i)=>({...p,id:run.promptIds[i],sceneLabel:s.sceneLabel,generationMode:'quick',segmentationMode:'manual',generationRunId:run.id,skillId:s.skillId,profileId:s.profileId,skill:state.skills?.find(x=>x.id===s.skillId)?.name||'',sourceText:run.sourceText,sourceHash:s.sourceHash,createdAt:run.createdAt}));
 for(const p of records)for(const old of [current.find(x=>x.id===p.id),history.find(x=>x.id===p.id)])if(old&&(old.generationRunId!==run.id||old.content!==p.content))return fail('已生成内容被人工修改，保留修改和原始回包');
 const merge=list=>[...list,...records.filter(p=>!list.some(old=>old.id===p.id))];
 const next={...project,promptHistory:merge(history),episodes:project.episodes.map(e=>e.id===episode.id?{...e,prompts:merge(current),status:'已生成提示词'}:e)};
 return{state:{...state,directorProjects:state.directorProjects.map(p=>p.id===project.id?next:p)},applied:true};
}

/** Manual boundaries are immutable input. One complete original Skill request
 * per scene; paid replies are checkpointed before parsing or publishing. */
export function createDirectorManualController({getContext,executeSkill,checkpoints,commitRun,cancelRequest=()=>{},onChange=()=>{}}){
 const runs=new Map(),executions=new Map(),tails=new Map();let disposed=false;
 const persist=async run=>{run.updatedAt=new Date().toISOString();run.revision=(run.revision||0)+1;const copy=clone(run),tail=(tails.get(run.id)||Promise.resolve()).catch(()=>{}).then(()=>checkpoints.save({run:copy}));tails.set(run.id,tail);await tail;if(!disposed)onChange();};
 const assertCurrent=async run=>{
  if(disposed||run.stopRequested)throw fault('整本任务已停止，已返回内容保留','PAUSED');
  const context=await getContext(run.snapshot);
  if(context?.accountId!==run.snapshot.accountId)throw fault('账号已切换，完整回包已保留','ACCOUNT_CHANGED');
  if(!context.project||!context.episode||context.permissions?.canGenerate===false||context.project.cloudLocked||context.project.cloudConflict)throw fault('项目或权限已变化，完整回包已保留','STALE');
  if(!await snapshotMatchesContext(run.snapshot,{...context,sceneLabel:run.snapshot.sceneLabel,inputText:directorSceneInput(context.project,context.episode,run.snapshot.sceneLabel)}))throw fault('原文、项目设定、Skill 或模型已变化，完整回包已保留','STALE');
 };
 const execute=async run=>{
  try{
   await assertCurrent(run);
   if(!run.output){
    if(run.partialOutput)throw fault('上次回包截断，已返回文字保留；请核对后重新建立任务','NEEDS_REVIEW');
    run.phase='generating';run.pendingRequestId=`director-manual-${run.id}-${crypto.randomUUID()}`;await persist(run);await assertCurrent(run);
    const result=await executeSkill({snapshot:run.snapshot,taskId:run.pendingRequestId,skillId:run.snapshot.skillId,input:buildWholeSceneSubmission({sourceText:run.sourceText,expectedLabels:run.expectedLabels}),expectedLabels:run.expectedLabels,maxOutputTokens:32768});
    run.output=result?.output??result;run.pendingRequestId=null;await persist(run);
   }
   await assertCurrent(run);
   if(typeof run.output!=='string'||!run.output.trim())throw fault('接口未返回提示词正文');
   run.prompts=parseReply(run);run.phase='ready-to-commit';await persist(run);await assertCurrent(run);
   const saved=await commitRun(clone(run));if(!saved?.applied)throw fault(saved?.conflict||'保存失败，完整回包已保留','STALE');
   run.phase='completed';run.errors=[];await persist(run);
  }catch(e){
   if(e.partialText){run.partialOutput=e.partialText;run.output='';}
   run.pendingRequestId=null;run.phase=['PAUSED','ACCOUNT_CHANGED'].includes(e.code)?'paused':e.code==='STALE'?'stale':'failed';run.errors=[{message:e.message,code:e.code||'FAILED',at:new Date().toISOString()}];
   try{await persist(run);}catch(saveError){run.errors.push({code:'SAVE_FAILED',message:saveError.message});if(!disposed)onChange();}
  }
  return clone(run);
 };
 const schedule=run=>{if(executions.has(run.id))return executions.get(run.id);const task=execute(run).finally(()=>executions.delete(run.id));executions.set(run.id,task);return task;};
 return{
  get:id=>runs.has(id)?clone(runs.get(id)):null,entries:()=>[...runs.values()].map(clone),
  async start(context,{runId=crypto.randomUUID(),batchId}={}){
   if(disposed)throw fault('任务已停止');
   const snapshot=await createSceneSnapshot(context),expectedLabels=manualSceneTasks(snapshot.sourceSnapshot,snapshot.sceneLabel).map(t=>t.label);
   if(!expectedLabels.length)throw fault('场景为空');
   if([...runs.values()].some(r=>isQuickRunActive(r)&&r.snapshot.accountId===snapshot.accountId&&r.snapshot.projectId===snapshot.projectId&&r.snapshot.episodeId===snapshot.episodeId&&r.snapshot.sceneLabel===snapshot.sceneLabel))throw fault('当前场景正在生成','BUSY');
   if(runs.has(runId))throw fault('任务编号已存在','BUSY');
   const run={id:runId,kind:'manual-scene',batchId,snapshot,phase:'generating',createdAt:new Date().toISOString(),revision:0,expectedLabels,promptIds:expectedLabels.map(()=>crypto.randomUUID()),sourceText:[buildProjectPreamble(context.project),snapshot.sourceSnapshot].filter(Boolean).join('\n\n'),errors:[]};runs.set(runId,run);await persist(run);
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
