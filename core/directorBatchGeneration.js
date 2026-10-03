import {parseDirectorScenes} from './scriptImport.js';
import {createSceneSnapshot,directorSceneInput} from './directorQuickStore.js';

const clone=value=>structuredClone(value);
const active=new Set(['running','pausing']);
const finished=new Set(['completed','skipped','stale']);
export const isDirectorBatchActive=batch=>Boolean(batch&&active.has(batch.phase));
const fault=(message,code='FAILED')=>Object.assign(new Error(message),{code});
const fingerprintFields=['accountId','projectId','episodeId','sceneLabel','sourceHash','settingsHash','skillId','skillHash','profileId','profileHash'];
const contextFor=(context,target)=>({...context,inputText:context.inputText??directorSceneInput(context.project,context.episode,target.sceneLabel),sceneLabel:target.sceneLabel,maxDurationSeconds:target.maxDurationSeconds});
const concurrencyOf=value=>{
 if(value==null||value==='all')return 'all';
 if(Number.isInteger(value)&&value>0)return value;
 throw fault('并发场景数必须是全部场景或正整数');
};

export async function createDirectorBatchPlan({accountId,project,skill,profile,maxDurationSeconds,existingPolicy='missing-only',concurrency='all'}){
 if(!['missing-only','append-all'].includes(existingPolicy))throw fault('已有结果处理方式无效');
 concurrency=concurrencyOf(concurrency);
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
 return {id:crypto.randomUUID(),kind:'batch',schemaVersion:2,phase:'preview',createdAt:new Date().toISOString(),revision:0,concurrency,
  snapshot:{accountId,projectId:project.id,skillId:skill.id,profileId:profile.id,maxDurationSeconds},
  projectName:project.name,skillName:skill.name,modelName:profile.name||profile.model,existingPolicy,episodeCount:episodes.length,targets,errors:[]};
}

/** Each concurrent worker schedules the existing durable scene transaction. */
export function createDirectorBatchController({sceneController,checkpoints,getContext,onChange=()=>{}}){
 const batches=new Map(),executions=new Map(),tails=new Map(),interruptions=new Map();let disposed=false;
 const emit=()=>{if(!disposed)onChange();};
 const refreshActive=batch=>{
  const targets=batch.targets.filter(target=>target.status==='running');
  batch.activeSceneCount=targets.length;batch.currentSceneLabels=targets.map(target=>target.sceneLabel);
  batch.currentSceneLabel=targets[0]?.sceneLabel||null;batch.currentEpisodeId=targets[0]?.episodeId||null;
 };
 const persist=async batch=>{
  refreshActive(batch);batch.updatedAt=new Date().toISOString();batch.revision=(batch.revision||0)+1;
  const copy=clone(batch),tail=(tails.get(batch.id)||Promise.resolve()).catch(()=>{}).then(()=>checkpoints.save({run:copy}));
  tails.set(batch.id,tail);await tail;emit();
 };
 const recordError=(batch,entry)=>{
  if(!batch.errors.some(error=>error.sceneLabel===entry.sceneLabel&&error.code===entry.code&&error.message===entry.message))batch.errors.push(entry);
 };
 const signalChildren=async(batch,method)=>{
  const ids=[...new Set(batch.targets.filter(target=>target.status==='running'&&target.sceneRunId).map(target=>target.sceneRunId))];
  const outcomes=await Promise.allSettled(ids.map(id=>sceneController[method](id)));
  for(const result of outcomes)if(result.status==='rejected')recordError(batch,{message:result.reason?.message||'场景任务停止失败',code:result.reason?.code||'STOP_FAILED'});
 };
 const interruptForFault=async(batch,error)=>{
  if(batch.phase==='cancelled')return;
  recordError(batch,{message:error.message,code:error.code||'FAILED'});
  batch.phase='pausing';
  if(!interruptions.has(batch.id)){
   // A throttled request was rejected before forwarding, but another scene
   // may already be paid and streaming. Stop admitting new work while letting
   // those replies checkpoint before pause; account/config faults still stop.
   const method=error.code==='RATE_LIMITED'?'pauseAfterRequest':'stop';
   const task=(async()=>{await persist(batch);await signalChildren(batch,method);})().finally(()=>interruptions.delete(batch.id));
   interruptions.set(batch.id,task);
  }
  await interruptions.get(batch.id);
 };
 const executeTarget=async(batch,target)=>{
  if(disposed||batch.phase!=='running')return;
  try{
    const requestTarget={...batch.snapshot,episodeId:target.episodeId,sceneLabel:target.sceneLabel};
    const context=await getContext(requestTarget);
    if(disposed||batch.phase!=='running')return;
    if(context?.accountId!==batch.snapshot.accountId)throw fault('账号已切换，整本任务已暂停','ACCOUNT_CHANGED');
    if(!context.project||!context.episode||!context.skill||!context.profile||context.permissions?.canGenerate===false)throw fault('项目、Skill、模型或生成权限已变化，请核对后继续','STALE_CONFIGURATION');
    const request=contextFor(context,requestTarget),latest=await createSceneSnapshot(request);
    if(disposed||batch.phase!=='running')return;
    if(fingerprintFields.some(key=>latest[key]!==target.fingerprint[key])){
     target.status='stale';target.reason='原文、项目设定、Skill 或模型已变化，本场未继续';await persist(batch);return;
    }
    // Persist the child ID before starting it. A crash between the child commit
    // and queue acknowledgement can then resume that same child without rebilling.
    target.sceneRunId||=crypto.randomUUID();target.status='running';target.reason='';delete target.errorCode;
    await persist(batch);
    if(disposed||batch.phase!=='running'){target.status='paused';await persist(batch);return;}
    let child=sceneController.get(target.sceneRunId);
    if(!child)try{child=await checkpoints.load({runId:target.sceneRunId,allowMissing:true});}catch(error){if(error.code!=='DIRECTOR_QUICK_NOT_FOUND')throw error;}
    if(disposed||batch.phase!=='running'){target.status='paused';await persist(batch);return;}
    const task=child?sceneController.resume(target.sceneRunId):sceneController.start(request,{runId:target.sceneRunId,batchId:batch.id});
    // Start registers its child after snapshotting; a simultaneous pause must
    // reach that newly registered child as well as the already active children.
    await Promise.resolve();
    if(disposed||batch.phase!=='running')try{await sceneController[batch.phase==='pausing'?'pauseAfterRequest':'stop'](target.sceneRunId);}catch(error){recordError(batch,{message:error.message||'场景任务停止失败',sceneLabel:target.sceneLabel,code:error.code||'STOP_FAILED'});}
    const result=await task;
    if(result.phase==='completed'){
     target.status='completed';target.warningCount=result.auditWarnings?.length||0;target.reason=target.warningCount?`已保存，有 ${target.warningCount} 项核对提醒`:'';
    }else{
     target.status=result.phase==='stale'?'stale':result.phase==='paused'?'paused':'failed';target.reason=result.errors?.[0]?.message||'任务已暂停';
     target.errorCode=result.errors?.[0]?.code||result.phase;
     if(batch.phase!=='cancelled'&&batch.phase!=='pausing')recordError(batch,{message:target.reason,sceneLabel:target.sceneLabel,code:target.errorCode});
     if(['ACCOUNT_CHANGED','RATE_LIMITED'].includes(target.errorCode))await interruptForFault(batch,fault(target.reason,target.errorCode));
    }
    await persist(batch);
  }catch(error){
   target.status=['ACCOUNT_CHANGED','STALE_CONFIGURATION'].includes(error.code)?'paused':'failed';target.reason=error.message||'场景生成失败';target.errorCode=error.code||'FAILED';
   if(batch.phase!=='cancelled'){
    recordError(batch,{message:target.reason,sceneLabel:target.sceneLabel,code:target.errorCode});
    if(['ACCOUNT_CHANGED','STALE_CONFIGURATION','RATE_LIMITED'].includes(error.code))await interruptForFault(batch,error);
   }
   try{await persist(batch);}catch{emit();}
  }
 };
 const execute=async batch=>{
  try{
   const pending=batch.targets.filter(target=>!finished.has(target.status));
   const configured=concurrencyOf(batch.concurrency),limit=configured==='all'?pending.length:Math.min(configured,pending.length);
   let next=0;
   const worker=async()=>{
    while(!disposed&&batch.phase==='running'&&next<pending.length){const target=pending[next++];await executeTarget(batch,target);}
   };
   await Promise.all(Array.from({length:limit},worker));
   if(interruptions.has(batch.id))await interruptions.get(batch.id);
   if(disposed&&batch.phase==='running')batch.phase='paused';
   if(batch.phase==='running')batch.phase=batch.targets.some(target=>['failed','stale','paused'].includes(target.status))?'completed-with-errors':'completed';
   if(batch.phase==='pausing')batch.phase='paused';
   await persist(batch);
  }catch(error){
   await interruptForFault(batch,error);
   if(batch.phase!=='cancelled')batch.phase='paused';
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
   concurrencyOf(plan.concurrency);
   if([...batches.values()].some(b=>isDirectorBatchActive(b)&&b.snapshot.projectId===plan.snapshot.projectId&&b.snapshot.accountId===plan.snapshot.accountId))throw fault('这个项目已有整本生成任务','BUSY');
   const batch=clone(plan);batch.phase='running';batch.errors||=[];batches.set(batch.id,batch);await persist(batch);
   if(batch.phase!=='running')return clone(batch);return schedule(batch);
  },
  async resume(id){
   const batch=batches.get(id);if(!batch)throw fault('找不到整本任务记录');
   if(executions.has(id))return executions.get(id);
   if(['completed','cancelled'].includes(batch.phase))return clone(batch);
   if([...batches.values()].some(other=>other.id!==id&&isDirectorBatchActive(other)&&other.snapshot.projectId===batch.snapshot.projectId&&other.snapshot.accountId===batch.snapshot.accountId))throw fault('这个项目已有整本生成任务，请先暂停或结束','BUSY');
   batch.errorHistory=[...(batch.errorHistory||[]),...batch.errors.map(entry=>({...entry,previousAttemptAt:new Date().toISOString()}))];
   batch.phase='running';batch.errors=[];await persist(batch);return schedule(batch);
  },
  async pause(id){
   const batch=batches.get(id);if(!batch||!isDirectorBatchActive(batch))return;
   batch.phase=executions.has(id)?'pausing':'paused';await persist(batch);
   await signalChildren(batch,'pauseAfterRequest');await persist(batch);
  },
  async cancel(id){
   const batch=batches.get(id);if(!batch)return;batch.phase='cancelled';await persist(batch);
   await signalChildren(batch,'stop');await persist(batch);
  },
  async restore(){
   for(const saved of await checkpoints.list()){
    if(saved?.kind!=='batch'||batches.has(saved.id))continue;
    const batch=clone(saved);batch.errors||=[];if(isDirectorBatchActive(batch))batch.phase='paused';
    for(const target of batch.targets)if(target.status==='running'){target.status='paused';target.reason='上次运行中断，继续时恢复已保存的场景进度';}
    refreshActive(batch);batches.set(batch.id,batch);
   }emit();
  },
  async pauseAll(){await Promise.all([...batches.values()].filter(isDirectorBatchActive).map(batch=>this.cancelForAccountSwitch(batch.id)));},
  async cancelForAccountSwitch(id){const batch=batches.get(id);if(!batch)return;batch.phase='paused';await persist(batch);await signalChildren(batch,'stop');await persist(batch);},
  activate(){disposed=false;},dispose(){disposed=true;},
 };
}
