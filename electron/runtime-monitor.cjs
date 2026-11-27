const {runtimeIncident,limitedReporter}=require('../cloud-backend/shared/runtime-incident.cjs');

function desktopRuntimeMonitor({version,enabled,token,send}){
  const report=limitedReporter(async incident=>{
    const current=token();
    if(current)await send(incident,current);
  });
  return (surface,operation,{mode='unknown',status}={})=>{
    if(enabled)report(runtimeIncident({operation,mode,status},surface,version));
  };
}

function ipcIncident(channel,payload,error){
  if(error?.name==='AbortError'||error?.code==='ACCOUNT_CHANGED')return null;
  const status=error?.httpStatus??error?.status;
  const mode=payload?.storageMode==='local'||payload?.storageMode==='cloud'?payload.storageMode:'unknown';
  if(channel==='collab-add-member')return {operation:'local-share',status,mode};
  if(channel.startsWith('libtv-')&&['libtv-projects','libtv-models','libtv-model-schema'].includes(channel))return {operation:'libtv-preparation',status,mode};
  if(['generation-submit','media-generate-video'].includes(channel)&&payload?.provider==='libtv'){
    return {operation:error?.libtvStage==='prepare'||error?.beforeSubmission?'libtv-preparation':'libtv-submit',status,mode};
  }
  if(status===409&&['collab-patch-storyboard','collab-update-project'].includes(channel))return {operation:'save-conflict',status,mode};
  return null;
}
module.exports={desktopRuntimeMonitor,ipcIncident};
