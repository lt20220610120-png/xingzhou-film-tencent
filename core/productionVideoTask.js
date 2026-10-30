import {nextVideoAttempt} from './productionVideoPolicy.js';
import {isFundingError} from './productionRecovery.js';
const statusName={submitting:'提交中',submitted:'排队 / 生成中',downloading:'已生成，正在下载',success:'已成功',failed:'生成失败',uncertain:'原提交待确认'};
/** One durable clip state machine. Query/download failures never count as generation failures. */
export async function runProductionVideoTask({ctx,item,tasks,models,submit,refresh,archive,onReady,wait}){
 const {run}=ctx;
 const remember=job=>{const i=tasks.findIndex(j=>j.id===job.id);if(i<0)tasks.push(job);else tasks[i]=job;};
 const observe=async job=>{ctx.guard();const changed=item.remoteJobStatus!==job.status||item.warning!==(job.warning||'')||item.error!==(job.error||'');item.jobId=job.id;item.remoteJobStatus=job.status;item.status=job.status;item.checkedAt=job.checkedAt;item.warning=job.warning||'';item.error=job.error||'';item.activeModel=job.model;item.activeProfileId=job.profileId;item.remoteStatus=job.remoteStatus;
  if(job.referenceVerification)item.referenceVerification=job.referenceVerification;await ctx.checkpoint();if(changed)await ctx.log?.(`${item.label} · ${statusName[job.status]||job.status}${job.warning?'：'+job.warning:job.error?'：'+job.error:''}`,job.status==='failed'?'warning':'info');};
 let originalStatus=item.status;
 const matching=()=>tasks.filter(j=>j.id===item.jobId||j.workflowRunId===run.id&&j.workflowItemId===item.id);
 let candidates=matching(),job=candidates.find(j=>j.status==='success')||candidates.find(j=>!['failed','success'].includes(j.status))||candidates.at(-1);
 if(job?.status==='failed'&&isFundingError(job.error)){item.previousFailedJobs=[...(item.previousFailedJobs||[]).filter(j=>j.id!==job.id),{id:job.id,status:'failed',profileId:job.profileId,model:job.model,error:job.error}];job=null;}
 if(!job&&['submitting','uncertain'].includes(originalStatus))throw Error('此前提交结果未确认，继续核对原任务，不能重复生成');
 while(true){ctx.guard();
  if(job){remember(job);await observe(job);
   if(job.status==='success'){Object.assign(item,await archive(job),{status:'downloaded',error:'',warning:''});await ctx.checkpoint();await ctx.log?.(`${item.label} · 已成功，视频池下载完成并按集归档。`,'success');await onReady();return;}
   if(job.status==='failed'){
    if(isFundingError(job.error)){ctx.videoBudget=job.error;throw Error(job.error);}
    const previous=item.previousFailedJobs||[];if(!previous.some(j=>j.id===job.id))item.previousFailedJobs=[...previous,{id:job.id,status:'failed',profileId:job.profileId,model:job.model,error:job.error}];await ctx.checkpoint();job=null;
   }else{
    if(!job.jobId&&job.status!=='downloading'){item.status='uncertain';await ctx.checkpoint();throw Error('原提交未取得上游任务编号，保留原任务继续核对；不重复生成');}
    // A transient read may throw. Preserve the same upstream task and try a read again.
    await wait(5000);ctx.guard();try{job=await refresh(job);}catch(error){item.warning='原任务查询暂未完成：'+error.message;await ctx.checkpoint();await ctx.log?.(item.label+' · '+item.warning+'；继续查询原任务，不重新生成。','warning');}continue;
   }
  }
  if(ctx.videoBudget)throw Error(ctx.videoBudget);
  candidates=matching();const history=[...new Map([...(item.previousFailedJobs||[]),...candidates].map(j=>[j.id,j])).values()];
  // A historical funding failure belongs to a previous run; after recharge it
  // does not consume the user-defined generation attempts.
  const selected=nextVideoAttempt(run.config,history,models);if(!selected){item.status='retry-exhausted';item.error='主备视频模型已达到本次设置的尝试次数；保留所有原任务，可暂停后增加次数继续';await ctx.checkpoint();await ctx.log?.(item.label+' · '+item.error,'warning');return;}
  item.status='preparing';item.error='';item.warning='';await ctx.checkpoint();await ctx.log?.(`${item.label} · 使用${selected.id===run.config.videoModel?'主':'备用'}模型提交：${selected.name||selected.model}`);
  try{job=await submit(selected);}catch(error){if(isFundingError(error)){ctx.videoBudget=error.message;item.status='failed';}else if(item.status==='preparing'||/前置引用核验失败，尚未提交生成/.test(error.message)||error.beforeSubmission)item.status='blocked';else item.status='uncertain';item.error=error.message;await ctx.checkpoint();throw error;}
 }
}
