const crypto=require('node:crypto');
async function requestProtectedSkill(payload,{token,gateway,signal,onProgress,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const taskId=payload.taskId||crypto.randomUUID(),credentials=token();
 const cancel=()=>{void gateway('protected-skill-cancel',{taskId},credentials).catch(()=>{});};
 if(signal?.aborted)throw new DOMException('任务已停止','AbortError');
 signal?.addEventListener('abort',cancel,{once:true});
 try{
  await gateway('protected-skill-start',{taskId,skillId:payload.builtinSkillId,input:payload.skillInput,beforeUserMessages:payload.beforeUserMessages||[],afterUserMessages:payload.afterUserMessages||[],maxOutputTokens:payload.maxOutputTokens,profile:{endpoint:payload.endpoint,apiKey:payload.apiKey,model:payload.model,protocol:payload.protocol,provider:payload.provider,reasoningEffort:payload.reasoningEffort}},credentials);
  // Cancellation during the first request may have arrived before the server created its record.
  if(signal?.aborted){cancel();throw new DOMException('任务已停止','AbortError');}
  for(let n=0;n<480;n++){
   if(signal?.aborted)throw new DOMException('任务已停止','AbortError');
   if(token()!==credentials)throw Error('登录状态已变化，请重新操作');
   const status=await gateway('protected-skill-status',{taskId},credentials);
   if(signal?.aborted)throw new DOMException('任务已停止','AbortError');
   if(token()!==credentials)throw Error('登录状态已变化，请重新操作');
   if(status.state==='completed')return status.output;
   if(status.state==='failed')throw Error(status.error||'内置Skill请求失败');
   if(status.state==='cancelled')throw new DOMException('任务已停止','AbortError');
   onProgress?.({phase:'waiting',receivedBytes:0});await wait(1500);
  }
  throw Error('等待时间较长，原任务未重发，请保留任务编号后核对');
 }finally{signal?.removeEventListener('abort',cancel);}
}
module.exports={requestProtectedSkill};
