const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {atomic}=require('./generation-job-storage.cjs');
const ACTIVE=['pending','preparing'];
const existingTask=(jobs,projectId,shotId)=>jobs.some(j=>j.projectId===projectId&&j.shotId===shotId&&j.kind==='video'&&!j.projectVideoDeleted&&['success','submitting','submitted','downloading','uncertain'].includes(j.status));
function stage(job){if(job.status==='success'||job.status==='failed'||job.status==='uncertain'||job.status==='downloading')return job.status;if(job.status==='submitting')return 'preparing';if(job.remoteStatus==='awaiting-canvas')return 'awaiting-canvas';if(job.remoteStatus==='success')return 'downloading';if(/^(running|processing|in_progress|generating)$/i.test(String(job.remoteStatus||'')))return 'generating';if(/^(queued|pending|waiting)$/i.test(String(job.remoteStatus||'')))return 'queued';return 'submitted';}
function createStoryboardBatchQueue({directory,owner,loadJobs,guard,submit}){
 const file=path.join(directory,'batches.json');let runs=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];const workers=new Map();
 // A crash can occur after the paid POST and before its acknowledgement. A stored
 // preparing entry must be reconciled to its original job, never sent again.
 for(const r of runs){r.running=false;for(const i of r.items)if(i.status==='preparing'){i.status='uncertain';i.interrupted=true;}}
 const persist=()=>atomic(file,runs);
 const assertOwner=accountId=>{if(!accountId||String(owner())!==String(accountId))throw Error('账号已变化，请重新载入批量队列');};
 function reconcile(run){const jobs=loadJobs();for(const item of run.items){const job=jobs.find(j=>j.storyboardBatchRunId===run.id&&j.storyboardBatchItemId===item.id)||jobs.find(j=>j.id===item.jobId);if(job){item.jobId=job.id;item.status=item.interrupted&&job.status==='submitting'?'uncertain':stage(job);item.error=item.interrupted&&job.status==='submitting'?'提交中断，请核对原任务，未自动重发':job.error||job.warning||'';item.sent=job.submissionAttempted!==false&&item.status!=='preparing';}}return run;}
 function view(run){reconcile(run);const counts={};for(const i of run.items)counts[i.status]=(counts[i.status]||0)+1;const total=run.items.length,done=(counts.success||0)+(counts.failed||0)+(counts.skipped||0),sent=run.items.filter(i=>i.sent).length;
  return {id:run.id,projectId:run.projectId,scope:run.scope,createdAt:run.createdAt,running:run.running,total,counts,sent,sentPercent:total?Math.round((sent+(counts.skipped||0))/total*100):0,percent:total?Math.round(done/total*100):0,items:run.items.map(({id,shotId,label,status,error,jobId})=>({id,shotId,label,status,error,jobId}))};}
 function stopRun(run){run.running=false;for(const i of run.items)if(i.status==='pending')i.status='stopped';persist();}
 async function pump(run){try{for(const item of run.items){if(!run.running)break;if(item.status!=='pending')continue;
   try{assertOwner(run.accountId);await guard(run);assertOwner(run.accountId);}catch{stopRun(run);break;}
   if(!run.running)break;if(existingTask(loadJobs(),run.projectId,item.shotId)){item.status='skipped';persist();continue;}
   item.status='preparing';persist();
   try{const job=await submit(item,run);item.jobId=job.id;item.status=stage(job);item.sent=true;item.error=job.error||job.warning||'';}
   catch(error){reconcile(run);if(!item.jobId){item.status=run.running?'failed':'stopped';item.error=error.message;}else if(item.status==='preparing'){item.status='uncertain';item.error='提交未确认，请核对原任务，未自动重发';}}
   persist();
  }}finally{run.running=false;persist();}}
 const api={
  list({accountId,projectId}){if(String(owner())!==String(accountId))return [];return runs.filter(r=>r.accountId===accountId&&r.projectId===projectId).slice(0,10).map(view);},
  start({accountId,projectId,items,scope,settings}){assertOwner(accountId);if(!projectId||!Array.isArray(items)||!items.length||items.length>20000||new Set(items.map(i=>i.shotId)).size!==items.length)throw Error('批量范围无效');if(runs.some(r=>r.accountId===accountId&&r.projectId===projectId&&r.running))throw Error('当前项目已有发送队列');
   const run={id:crypto.randomUUID(),accountId,projectId,scope,settings,createdAt:new Date().toISOString(),running:true,items:items.map(i=>({...i,id:crypto.randomUUID(),status:i.skip?'skipped':'pending',error:''}))};runs.unshift(run);persist();const work=Promise.resolve().then(()=>pump(run));workers.set(run.id,work);work.finally(()=>workers.delete(run.id)).catch(()=>{});return view(run);},
  stop({id,accountId}){assertOwner(accountId);const r=runs.find(r=>r.id===id&&r.accountId===accountId);if(!r)throw Error('批量队列不存在');stopRun(r);return view(r);},
  resume({id,accountId}){assertOwner(accountId);const r=runs.find(r=>r.id===id&&r.accountId===accountId);if(!r||r.running||workers.has(id)||runs.some(row=>row.projectId===r.projectId&&row.running))throw Error('队列正在发送或不存在');reconcile(r);for(const i of r.items)if(['stopped','pending'].includes(i.status))i.status='pending';r.running=true;persist();const work=Promise.resolve().then(()=>pump(r));workers.set(id,work);work.finally(()=>workers.delete(id)).catch(()=>{});return view(r);},
  stopAll(){for(const r of runs)if(r.running)stopRun(r);},
  hasActive:()=>workers.size>0||runs.some(r=>r.running),
  hasPending(projectId,shotId){return runs.some(r=>r.running&&r.projectId===projectId&&r.items.some(i=>i.shotId===shotId&&ACTIVE.includes(i.status)));},
  usesMedia(id){return runs.some(r=>r.running&&r.items.some(i=>ACTIVE.includes(i.status)&&i.value?.references?.some(ref=>ref.id===id)));},
  assertDispatch(input){if(!input.storyboardBatchRunId)return;const r=runs.find(r=>r.id===input.storyboardBatchRunId);if(!r||!r.running||String(owner())!==String(r.accountId))throw Error('批量发送已停止或账号已变化，未提交生成');return guard(r,input);},
  idle:()=>Promise.allSettled([...workers.values()]),
 };return api;
}
module.exports={createStoryboardBatchQueue,existingTask,stage};
