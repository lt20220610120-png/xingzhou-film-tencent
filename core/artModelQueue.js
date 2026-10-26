// All stages in this renderer share one request budget, including manual retries.
// Five background slots leave room for one deliberate human request (six total).
const queues=new WeakMap();
export function getArtModelQueue(api){
 if(queues.has(api))return queues.get(api);
 let active=0,automatic=0;const pending=[],listeners=new Set();
 const emit=()=>listeners.forEach(fn=>fn());
 const pump=()=>{
  for(let index=pending.length-1;index>=0;index--)if(pending[index].stopped()){
   pending.splice(index,1)[0].reject(Error('任务已停止'));
  }
  while(active<6){
   let index=pending.findIndex(row=>row.manual);
   if(index<0&&automatic<5)index=pending.findIndex(row=>!row.manual);
   if(index<0)break;
   const row=pending.splice(index,1)[0];active++;if(!row.manual)automatic++;
   Promise.resolve().then(()=>{if(row.stopped())throw Error('任务已停止');return row.call();}).then(row.resolve,row.reject).finally(()=>{active--;if(!row.manual)automatic--;pump();emit();});
  }
  emit();
 };
 const queue={status:()=>({active,queued:pending.length,limit:6}),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},run(call,{manual=false,job,isStopped}={}){
  return new Promise((resolve,reject)=>{pending.push({call,manual,resolve,reject,stopped:()=>Boolean(job?.cancelled||isStopped?.())});pump();});
 },notify:pump};queues.set(api,queue);return queue;
}
export const requestArtModel=(api,payload,options)=>getArtModelQueue(api).run(()=>api.aiChat(payload),options);
