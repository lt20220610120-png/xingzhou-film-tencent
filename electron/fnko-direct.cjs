// Both canvas and art use the persisted generation-job identity, including uncertain POSTs.
async function runFnkoDirect(payload,signal,{jobs,renewImageReferences=async p=>p,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 const input=await renewImageReferences(payload);
 if(input.firstFramePath&&!input.references?.length)input.references=[{kind:'image',filePath:input.firstFramePath}];
 if(!input.ratio)input.ratio=({'1280x720':'16:9','720x1280':'9:16','1024x1024':'1:1','1024x768':'4:3','768x1024':'3:4'})[input.size]||'auto';
 let job;
 try{
  job=await jobs.submit({...input,signal});
  for(let n=0;n<120;n++){
   if(job.status==='success')return job;
   if(job.status==='failed')throw Error(job.error||'原任务失败');
   signal?.throwIfAborted();await wait(30000);
   job=await jobs.refresh({id:job.id,apiKey:input.apiKey,endpoint:input.endpoint});
  }
  throw Error('原任务仍在处理中，请稍后刷新，仅查询原结果');
 }catch(error){
  if(job?.status==='failed')throw error;
  const id=job?.id||error.generationJobId;if(!id)throw error;
  return {pendingGeneration:{id,provider:'fnko'},error:error.message};
 }
}
module.exports={runFnkoDirect};
