// Project-owned work survives view refreshes and navigation. Each card owns its
// request; stopping the queue never discards an audio receipt already returned.
const owners=new WeakMap();
export function createVoiceGenerationQueue(){
 let limit=3,active=0,state={items:{}},pending=[];const listeners=new Set();
 const emit=(key,patch)=>{state={items:{...state.items,[key]:{...state.items[key],...patch}}};for(const fn of listeners)fn();};
 const pump=()=>{while(active<limit&&pending.length){const task=pending.shift();active++;emit(task.key,{status:'running'});Promise.resolve().then(()=>task.run(task.job)).then(value=>{emit(task.key,{status:'complete',error:''});task.resolve(value);},error=>{emit(task.key,{status:'failed',error:error.message});task.reject(error);}).finally(()=>{active--;pump();});}};
 return {snapshot:()=>state,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},setLimit(value){if(!Number.isSafeInteger(Number(value))||Number(value)<1)throw Error('并发数必须是正整数');limit=Number(value);pump();},
  enqueue(key,run){if(['queued','running'].includes(state.items[key]?.status))return Promise.resolve(null);const job={cancelled:false};return new Promise((resolve,reject)=>{pending.push({key,run,job,resolve,reject});emit(key,{status:'queued',error:''});pump();});},
  stop(){for(const task of pending){emit(task.key,{status:'cancelled'});task.resolve(null);}pending=[];},
 };
}
export function getVoiceGenerationQueue(api,accountId,projectId){let scoped=owners.get(api);if(!scoped){scoped=new Map();owners.set(api,scoped);}const key=JSON.stringify([accountId,projectId]);if(!scoped.has(key))scoped.set(key,createVoiceGenerationQueue());return scoped.get(key);}
