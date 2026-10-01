import {parseDirectorScenes} from './scriptImport.js';
import {createSceneSnapshot,directorSceneInput} from './directorQuickStore.js';

const clone=value=>structuredClone(value);
const active=new Set(['running','pausing']);
export const isDirectorBatchActive=batch=>Boolean(batch&&active.has(batch.phase));
const fault=(message,code='FAILED')=>Object.assign(new Error(message),{code});
const fingerprintFields=['accountId','projectId','episodeId','sceneLabel','sourceHash','settingsHash','skillId','skillHash','profileId','profileHash'];
const contextFor=(context,target)=>({...context,inputText:context.inputText??directorSceneInput(context.project,context.episode,target.sceneLabel),sceneLabel:target.sceneLabel,maxDurationSeconds:target.maxDurationSeconds});

export async function createDirectorBatchPlan({accountId,project,skill,profile,maxDurationSeconds,existingPolicy='missing-only'}){
 if(!['missing-only','append-all'].includes(existingPolicy))throw fault('已有结果处理方式无效');
 if(!project||project.cloudLocked||project.cloudConflict||project.canWrite===false||project.permissions?.canWrite===false||project.permissions?.canGenerate===false)throw fault('当前项目不能生成提示词');
 const targets=[];
 const episodes=(project.episodes||[]).filter(e=>e.kind!=='setting'&&e.title!=='设定和小传');
 for(const [index,episode] of episodes.entries()){
  for(const scene of parseDirectorScenes(episode.content,index+1)){
   const source=directorSceneInput(project,episode,scene.label);
   const snapshot=await createSceneSnapshot({accountId,project,episode,sceneLabel:scene.label,inputText:source,skill,profile,maxDurationSeconds});
   const existing=(episode.prompts||[]).filter(p=>String(p.label||'').startsWith(`${scene.label}-`));
   const skip=!source?.trim()||existingPolicy==='missing-only'&&existing.length>0;
   targets.push({episodeId:episode.id,episodeNumber:index+1,episodeTitle:episode.title||`第${index+1}集`,sceneLabel:scene.label,
    fingerprint:Object.fromEntries(fingerprintFields.map(key=>[key,snapshot[key]])),existingCount:existing.length,
    status:skip?'skipped':'pending',reason:!source?.trim()?'场景为空':skip?'已有提示词，跳过；未判定完整性':'',sceneRunId:null});
  }
 }
 if(!targets.length)throw fault('项目没有可生成的场景');
 return {id:crypto.randomUUID(),kind:'batch',schemaVersion:1,phase:'preview',createdAt:new Date().toISOString(),revision:0,
  snapshot:{accountId,projectId:project.id,skillId:skill.id,profileId:profile.id,maxDurationSeconds},
  projectName:project.name,skillName:skill.name,modelName:profile.name||profile.model,existingPolicy,episodeCount:episodes.length,targets,errors:[]};
}

/** The queue only schedules the existing scene transaction; it owns no AI rules. */
export function createDirectorBatchController({sceneController,checkpoints,getContext,onChange=()=>{}}){
 const batches=new Map(),executions=new Map(),tails=new Map();let disposed=false;
 const emit=()=>{if(!disposed)onChange();};
 const persist=async batch=>{
  batch.updatedAt=new Date().toISOString();batch.revision=(batch.revision||0)+1;
  const copy=clone(batch),tail=(tails.get(batch.id)||Promise.resolve()).catch(()=>{}).then(()=>checkpoints.save({run:copy}));
  tails.set(batch.id,tail);await tail;emit();
 };
 const execute=async batch=>{
  try{
   for(const target of batch.targets){
    if(disposed||batch.phase!=='running')break;
    if(['completed','skipped','stale'].includes(target.status))continue;
    const requestTarget={...batch.snapshot,episodeId:target.episodeId,sceneLabel:target.sceneLabel};
    const context=await getContext(requestTarget);
    if(context?.accountId!==batch.snapshot.accountId)throw fault('账号已切换，整本任务已暂停','ACCOUNT_CHANGED');
    if(!context.project||!context.episode||!context.skill||!context.profile||context.permissions?.canGenerate===false)throw fault('项目、Skill、模型或生成权限已变化，请核对后继续','STALE_CONFIGURATION');
    const request=contextFor(context,requestTarget),latest=await createSceneSnapshot(request);
    if(fingerprintFields.some(key=>latest[key]!==target.fingerprint[key])){
     target.status='stale';target.reason='原文、项目设定、Skill 或模型已变化，本场未继续';await persist(batch);continue;
    }
    // Persist the child ID before starting it. A crash between the child commit
    // and queue acknowledgement can then resume that same child without rebilling.
    target.sceneRunId||=crypto.randomUUID();target.status='running';target.reason='';batch.currentSceneLabel=target.sceneLabel;batch.currentEpisodeId=target.episodeId;
    await persist(batch);if(disposed||batch.phase!=='running')break;
    let child=sceneController.get(target.sceneRunId);
    if(!child)try{child=await checkpoints.load({runId:target.sceneRunId,allowMissing:true});}catch(error){if(error.code!=='DIRECTOR_QUICK_NOT_FOUND')throw error;}
    const result=child?await sceneController.resume(target.sceneRunId):await sceneController.start(request,{runId:target.sceneRunId,batchId:batch.id});
    if(result.phase==='completed'){
     target.status='completed';target.warningCount=result.auditWarnings?.length||0;target.reason=target.warningCount?`已保存，有 ${target.warningCount} 项衔接提醒`:'';
    }else{
     target.status=result.phase==='stale'?'stale':result.phase==='paused'?'paused':'failed';target.reason=result.errors?.[0]?.message||'任务已暂停';
     target.errorCode=result.errors?.[0]?.code||result.phase;
     if(batch.phase!=='cancelled'&&!['needs-review','stale'].includes(result.phase)){batch.phase='paused';batch.errors=[{message:target.reason,sceneLabel:target.sceneLabel,code:target.errorCode}];}
    }
    await persist(batch);
   }
   if(batch.phase==='running')batch.phase=batch.targets.some(t=>['failed','stale'].includes(t.status))?'completed-with-errors':'completed';
   if(batch.phase==='pausing')batch.phase='paused';
   await persist(batch);
  }catch(error){
   if(batch.phase!=='cancelled')batch.phase='paused';batch.errors=[{message:error.message,code:error.code||'FAILED'}];
   try{await persist(batch);}catch{emit();}
  }
  return clone(batch);
 };
 const schedule=batch=>{
  if(executions.has(batch.id))return executions.get(batch.id);
  const other=[...batches.values()].find(b=>b.id!==batch.id&&isDirectorBatchActive(b)&&b.snapshot.accountId===batch.snapshot.accountId&&b.snapshot.projectId===batch.snapshot.projectId);
  if(other)throw fault('这个项目已有整本生成任务，请先暂停或结束','BUSY');
  const task=execute(batch).finally(()=>executions.delete(batch.id));executions.set(batch.id,task);return task;
 };
 return {
  entries:()=>[...batches.values()].map(clone),get:id=>batches.has(id)?clone(batches.get(id)):null,
  async start(plan){
   if(disposed)throw fault('任务已停止');
   if(plan?.kind!=='batch'||!plan.targets?.length)throw fault('整本任务清单无效');
   if([...batches.values()].some(b=>isDirectorBatchActive(b)&&b.snapshot.projectId===plan.snapshot.projectId&&b.snapshot.accountId===plan.snapshot.accountId))throw fault('这个项目已有整本生成任务','BUSY');
   const batch=clone(plan);batch.phase='running';batches.set(batch.id,batch);await persist(batch);
   if(batch.phase!=='running')return clone(batch);return schedule(batch);
  },
  async resume(id){
   const batch=batches.get(id);if(!batch)throw fault('找不到整本任务记录');
   if(executions.has(id))return executions.get(id);
   if(['completed','cancelled'].includes(batch.phase))return clone(batch);
   batch.phase='running';batch.errors=[];await persist(batch);return schedule(batch);
  },
  async pause(id){
   const batch=batches.get(id);if(!batch||!isDirectorBatchActive(batch))return;
   batch.phase=executions.has(id)?'pausing':'paused';await persist(batch);
   const target=batch.targets.find(t=>t.status==='running');
   if(target?.sceneRunId)await sceneController.pauseAfterRequest(target.sceneRunId);
  },
  async cancel(id){
   const batch=batches.get(id);if(!batch)return;batch.phase='cancelled';await persist(batch);
   const target=batch.targets.find(t=>t.status==='running');
   if(target?.sceneRunId)await sceneController.stop(target.sceneRunId);
  },
  async restore(){
   for(const saved of await checkpoints.list()){
    if(saved?.kind!=='batch'||batches.has(saved.id))continue;
    const batch=clone(saved);if(isDirectorBatchActive(batch))batch.phase='paused';batches.set(batch.id,batch);
   }emit();
  },
  async pauseAll(){for(const batch of batches.values())if(isDirectorBatchActive(batch))await this.cancelForAccountSwitch(batch.id);},
  async cancelForAccountSwitch(id){const batch=batches.get(id);if(!batch)return;batch.phase='paused';await persist(batch);const target=batch.targets.find(t=>t.status==='running');if(target?.sceneRunId)await sceneController.stop(target.sceneRunId);},
  activate(){disposed=false;},dispose(){disposed=true;},
 };
}
