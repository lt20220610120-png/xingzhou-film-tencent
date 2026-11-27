const {randomBytes}=require('node:crypto');
const {runtimeIncident,limitedReporter}=require('../shared/runtime-incident.cjs');

function collector(dsn,fetchFn){
  let address;
  try{address=new URL(dsn);}catch{return null;}
  const parts=address.pathname.split('/'),project=parts.pop(),publicKey=address.username;
  const loopback=['localhost','127.0.0.1','[::1]'].includes(address.hostname);
  if((address.protocol!=='https:'&&!(loopback&&address.protocol==='http:'))||
      !/^\d{1,12}$/.test(project)||!/^\w{10,80}$/.test(publicKey)||
      address.password||address.hash||address.search)return null;
  address.username='';
  address.pathname=parts.join('/')+'/api/'+project+'/envelope/';
  return async incident=>{
    const id=randomBytes(16).toString('hex');
    const data=JSON.stringify({
      event_id:id,timestamp:Date.now()/1000,platform:'javascript',level:'error',
      release:'xingzhou-film@'+incident.version,
      message:`${incident.surface} · ${incident.operation}`,
      fingerprint:['xingzhou',incident.surface,incident.operation,String(incident.status)],
      tags:{surface:incident.surface,operation:incident.operation,mode:incident.mode,http_status:String(incident.status)},
    });
    const header=JSON.stringify({event_id:id,sent_at:new Date().toISOString()});
    const item=JSON.stringify({type:'event',length:Buffer.byteLength(data)});
    const response=await fetchFn(address,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(2500),
      headers:{'content-type':'application/x-sentry-envelope','x-sentry-auth':'Sentry sentry_version=7, sentry_key='+publicKey},
      body:[header,item,data].join('\n'),
    });
    await response.body?.cancel();
  };
}

function createRuntimeMonitor({dsn,version,fetchFn=fetch}={}){
  const send=collector(dsn,fetchFn);
  if(!send)return {enabled:false,client:()=>{},cloud:()=>{}};
  const report=limitedReporter(send);
  return {
    enabled:true,
    client:value=>{
      if(value?.surface==='main'||value?.surface==='renderer')report(runtimeIncident(value,value.surface,value.version));
    },
    cloud:value=>report(runtimeIncident({...value,mode:'cloud'},'cloud',version)),
  };
}

function cloudGatewayIncident(action,status){
  switch(action){
    case 'project-local-share-prepare':
    case 'project-local-share':
    case 'project-local-share-recover':
      return status>=400?'local-share':null;
    case 'director-live-sync':
    case 'storyboard-patch':
    case 'project-update':
    case 'prompt-publish':
      if(status===409)return 'save-conflict';
      return status===403||status>=500?'cloud-write':null;
    case 'project-get':
    case 'project-list':
    case 'project-prompt-binding':
      return status===403||status>=500?'cloud-read':null;
    default:return null;
  }
}
module.exports={createRuntimeMonitor,cloudGatewayIncident};
