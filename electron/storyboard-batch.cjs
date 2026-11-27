const path=require('node:path'),crypto=require('node:crypto');
const {atomic,readHistoryJson}=require('./generation-job-storage.cjs');
const {matchesMediaReference}=require('./reference-upload-guard.cjs');
const ACTIVE=['pending','preparing'];
const canUseMedia=item=>ACTIVE.includes(item.status)||item.status==='stopped'||item.status==='failed'&&item.canRetry===true;
const existingTask=(jobs,projectId,shotId)=>jobs.some(j=>j.projectId===projectId&&j.shotId===shotId&&j.kind==='video'&&!j.projectVideoDeleted&&['success','submitting','submitted','downloading','uncertain'].includes(j.status));
function stage(job){if(job.status==='success'||job.status==='failed'||job.status==='uncertain'||job.status==='downloading')return job.status;if(job.status==='submitting')return 'preparing';if(job.remoteStatus==='awaiting-canvas')return 'awaiting-canvas';if(job.remoteStatus==='success')return 'downloading';if(/^(running|processing|in_progress|generating)$/i.test(String(job.remoteStatus||'')))return 'generating';if(/^(queued|pending|waiting)$/i.test(String(job.remoteStatus||'')))return 'queued';return 'submitted';}
function createStoryboardBatchQueue({directory,owner,loadJobs,guard,submit,completedLimit=30}){
 const file=path.join(directory,'batches.json');let runs=readHistoryJson(file,rows=>Array.isArray(rows)&&rows.every(run=>run&&typeof run.id==='string'&&Array.isArray(run.items)&&run.items.every(item=>item&&typeof item.id==='string')),[]);const workers=new Map(),controllers=new Map();
 // A crash can occur after the paid POST and before its acknowledgement. A stored
 // preparing entry must be reconciled to its original job, never sent again.
 for(const r of runs){r.running=false;for(const i of r.items)if(i.status==='preparing'){i.status='uncertain';i.interrupted=true;}}
 const persist=()=>atomic(file,runs);
 const assertOwner=accountId=>{if(!accountId||String(owner())!==String(accountId))throw Error('账号已变化，请重新载入批量队列');};
 function jobIndex(){
  const byItem=new Map(),byId=new Map();
  for(const job of loadJobs()){
   if(job.preflightOnly)continue;
   byId.set(job.id,job);
   if(job.storyboardBatchRunId&&job.storyboardBatchItemId){
    const id=job.storyboardBatchRunId+':'+job.storyboardBatchItemId;
    if(!byItem.has(id))byItem.set(id,job);
   }
  }
  return {byItem,byId};
 }
 function reconcile(run,{byItem,byId}=jobIndex()){for(const item of run.items){const job=byItem.get(run.id+':'+item.id)||byId.get(item.jobId);if(job){item.jobId=job.id;item.status=item.interrupted&&job.status==='submitting'?'uncertain':stage(job);item.error=item.interrupted&&job.status==='submitting'?'提交中断，请核对原任务，未自动重发':job.error||job.warning||'';item.sent=job.submissionAttempted!==false&&item.status!=='preparing';item.canRetry=item.status==='failed'&&job.submissionAttempted===false;}}return run;}
 function pruneCompleted(){
  if(runs.length<=completedLimit)return;
  const index=jobIndex(),counts=new Map();
  runs=runs.filter(run=>{
   if(run.running||workers.has(run.id))return true;
   if(!reconcile(run,index).items.every(item=>['success','failed','skipped'].includes(item.status)))return true;
   const key=run.accountId+':'+run.projectId,count=(counts.get(key)||0)+1;
   counts.set(key,count);
   return count<=completedLimit;
  });
 }
 function view(run,index){reconcile(run,index);const counts={};for(const i of run.items)counts[i.status]=(counts[i.status]||0)+1;const total=run.items.length,done=(counts.success||0)+(counts.failed||0)+(counts.skipped||0),sent=run.items.filter(i=>i.sent).length;
  return {id:run.id,projectId:run.projectId,scope:run.scope,createdAt:run.createdAt,running:run.running,total,counts,sent,retryable:run.items.filter(item=>item.canRetry===true).length,sentPercent:total?Math.round((sent+(counts.skipped||0))/total*100):0,percent:total?Math.round(done/total*100):0,items:run.items.map(({id,shotId,label,status,error,jobId})=>({id,shotId,label,status,error,jobId}))};}
 function stopRun(run){run.running=false;controllers.get(run.id)?.abort();for(const i of run.items)if(i.status==='pending')i.status='stopped';persist();}
 function launch(run){
  const controller=new AbortController();controllers.set(run.id,controller);
  const work=Promise.resolve().then(()=>pump(run,controller.signal));workers.set(run.id,work);
  work.finally(()=>{workers.delete(run.id);controllers.delete(run.id);}).catch(()=>{});
 }
 async function pump(run,signal){try{for(const item of run.items){if(!run.running)break;if(item.status!=='pending')continue;
   try{assertOwner(run.accountId);await guard(run);assertOwner(run.accountId);}catch{stopRun(run);break;}
   if(!run.running)break;if(existingTask(loadJobs(),run.projectId,item.shotId)){item.status='skipped';persist();continue;}
   item.status='preparing';persist();
   try{const job=await submit(item,run,signal);item.jobId=job.id;item.status=stage(job);item.sent=true;item.error=job.error||job.warning||'';}
   catch(error){reconcile(run);if(!item.jobId){item.status=run.running?'failed':'stopped';item.error=error.message;item.canRetry=error.beforeSubmission===true;}else if(item.status==='preparing'){item.status='uncertain';item.error='提交未确认，请核对原任务，未自动重发';}}
   persist();
  }}finally{run.running=false;pruneCompleted();persist();}}
 const api={
  list({accountId,projectId}){if(String(owner())!==String(accountId))return [];const index=jobIndex();return runs.filter(r=>r.accountId===accountId&&r.projectId===projectId).slice(0,10).map(run=>view(run,index));},
  start({accountId,projectId,items,scope,settings}){assertOwner(accountId);if(!projectId||!Array.isArray(items)||!items.length||items.length>20000||new Set(items.map(i=>i.shotId)).size!==items.length)throw Error('批量范围无效');if(runs.some(r=>r.accountId===accountId&&r.projectId===projectId&&r.running))throw Error('当前项目已有发送队列');
   const run={id:crypto.randomUUID(),accountId,projectId,scope,settings,createdAt:new Date().toISOString(),running:true,items:items.map(({skipReason,...i})=>({...i,id:crypto.randomUUID(),status:i.skip?'skipped':'pending',error:skipReason||''}))};runs.unshift(run);pruneCompleted();persist();launch(run);return view(run);},
  stop({id,accountId}){assertOwner(accountId);const r=runs.find(r=>r.id===id&&r.accountId===accountId);if(!r)throw Error('批量队列不存在');stopRun(r);return view(r);},
  resume({id,accountId}){assertOwner(accountId);const r=runs.find(r=>r.id===id&&r.accountId===accountId);if(!r||r.running||workers.has(id)||runs.some(row=>row.projectId===r.projectId&&row.running))throw Error('队列正在发送或不存在');reconcile(r);for(const i of r.items){
   if(i.status==='failed'&&i.canRetry===true){i.previousJobId=i.jobId;i.id=crypto.randomUUID();delete i.jobId;delete i.canRetry;i.error='';i.status='pending';}
   else if(['stopped','pending'].includes(i.status))i.status='pending';
  }r.running=true;persist();launch(r);return view(r);},
  stopAll(){for(const r of runs)if(r.running)stopRun(r);},
  hasActive:()=>workers.size>0||runs.some(r=>r.running),
  hasPending(projectId,shotId){return runs.some(r=>r.running&&r.projectId===projectId&&r.items.some(i=>i.shotId===shotId&&ACTIVE.includes(i.status)));},
  usesMedia(media,projectId){
   const row=typeof media==='string'?{id:media}:media;
   return runs.some(r=>(!projectId||r.projectId===projectId)&&r.items.some(i=>canUseMedia(i)&&i.value?.references?.some(ref=>matchesMediaReference(row,ref,{assetSlot:row.wasAdopted===true}))));
  },
  retainedPaths:()=>runs.flatMap(run=>run.items.filter(canUseMedia).flatMap(item=>(item.value?.references||[]).map(ref=>ref.filePath).filter(Boolean))),
  assertDispatch(input){if(!input.storyboardBatchRunId)return;const r=runs.find(r=>r.id===input.storyboardBatchRunId);if(!r||!r.running||String(owner())!==String(r.accountId))throw Error('批量发送已停止或账号已变化，未提交生成');return guard(r,input);},
  idle:()=>Promise.allSettled([...workers.values()]),
 };return api;
}
module.exports={createStoryboardBatchQueue,existingTask,stage};
