import {taskPriority} from './taskPriority.js';
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
   if(index<0&&automatic<5){
    let best=-Infinity;
    for(let n=0;n<pending.length;n++)if(!pending[n].manual){const score=taskPriority(pending[n].priority,pending[n].queuedAt);if(score>best){best=score;index=n;}}
   }
   if(index<0)break;
   const row=pending.splice(index,1)[0];active++;if(!row.manual)automatic++;
   Promise.resolve().then(()=>{if(row.stopped())throw Error('任务已停止');return row.call();}).then(row.resolve,row.reject).finally(()=>{active--;if(!row.manual)automatic--;pump();emit();});
  }
  emit();
 };
 const queue={status:()=>({active,queued:pending.length,limit:6}),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},run(call,{manual=false,job,isStopped,priority=job?.priority||0}={}){
  return new Promise((resolve,reject)=>{pending.push({call,manual,resolve,reject,priority,queuedAt:Date.now(),stopped:()=>Boolean(job?.cancelled||isStopped?.())});pump();});
 },notify:pump};queues.set(api,queue);return queue;
}
export const requestArtModel=(api,payload,options={})=>getArtModelQueue(api).run(async()=>{
 options.onStart?.();let timer,finished=false;
 if(options.onProgress&&api.aiTaskStatus){let reading=false;timer=setInterval(async()=>{if(reading)return;reading=true;try{const status=await api.aiTaskStatus({taskId:payload.taskId});if(!finished&&status)options.onProgress(status);}catch{/* Progress is advisory; never fail or retry a request for it. */}finally{reading=false;}},1200);}
 try{return await api.aiChat(payload);}finally{finished=true;clearInterval(timer);}
},options);
