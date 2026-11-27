const surfaces=new Set(['main','renderer','cloud']);
const modes=new Set(['local','cloud','unknown']);
const operations=new Set([
  'uncaught','unhandled-rejection','renderer-exit','render-error',
  'libtv-preparation','libtv-submit','local-share','save-conflict',
  'cloud-write','cloud-read',
]);
const statuses=new Set([400,401,403,409,423,429,500,502,503,504]);

// Construct the payload from fixed vocabularies. Never forward an exception,
// request object, stack trace, breadcrumb, URL, or remotely controlled message.
function runtimeIncident(value,surface,version){
  if(!surfaces.has(surface)||!operations.has(value?.operation))return null;
  if(typeof version!=='string'||!/^\d{1,3}\.\d{1,3}\.\d{1,4}$/.test(version))return null;
  return {
    surface,version,operation:value.operation,
    mode:modes.has(value.mode)?value.mode:'unknown',
    status:statuses.has(value.status)?value.status:0,
  };
}

function limitedReporter(deliver,{now=Date.now,maxKeys=80,intervalMs=60000,maxInFlight=2}={}){
  const sent=new Map();
  let inFlight=0;
  return value=>{
    if(!value||inFlight>=maxInFlight)return;
    const key=JSON.stringify([value.surface,value.operation,value.mode,value.status]);
    const time=now();
    if(sent.has(key)&&time-sent.get(key)<intervalMs)return;
    sent.delete(key);
    sent.set(key,time);
    if(sent.size>maxKeys)sent.delete(sent.keys().next().value);
    inFlight++;
    void Promise.resolve().then(()=>deliver(value)).catch(()=>{}).finally(()=>{inFlight--;});
  };
}

module.exports={runtimeIncident,limitedReporter};
