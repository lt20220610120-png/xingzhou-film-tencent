import {runArtImageBatch} from './artImageBatch.js';
import {subscribeBindingStorage} from './projectBindingCache.js';

const projects = new Map();
let directorySwitching = false;

export function assetImageActivity(projectId, accountId) {
 const key = JSON.stringify([accountId, projectId]);
 if (projects.has(key)) return projects.get(key);

 let snapshot = {ids:new Set(), batches:[]}, revoked = false, nextBatch = 0;
 const listeners = new Set(), pending = new Map(), batches = new Map();
 const idsRef = {current:new Set()};
 const publish = update => {
  snapshot = {...snapshot, ...update};
  for (const listener of listeners) listener();
 };
 const setIds = change => publish({ids:typeof change==='function'?change(snapshot.ids):change});
 const refreshBatches = () => publish({batches:[...batches.values()].map(batch=>batch.status)});
 const guard = () => {
  if (revoked) throw new Error('登录状态或资料目录已变化，已停止生图操作');
 };
 const reserve = id => {
  let resolve;
  idsRef.current.add(id);
  pending.set(id,new Promise(done=>{resolve=done;}));
  return result => {
   resolve(result);
   pending.delete(id);
   idsRef.current.delete(id);
  };
 };

 const activity = {
  snapshot:()=>snapshot, subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}, idsRef,setIds,guard,
  async runSingle(id, work) {
   if(revoked||directorySwitching||idsRef.current.has(id))return;
   const release=reserve(id);
   setIds(new Set(idsRef.current));
   let value;
   try{return value=await work(guard);}
   finally{
    release({status:value?'fulfilled':'rejected',value});
    setIds(new Set(idsRef.current));
   }
  },
  start(jobs,{label,concurrency,generate,onAttached}) {
   if(revoked||directorySwitching)return;
   const available=jobs.filter(({asset})=>!idsRef.current.has(asset.id));
   if(!available.length)return;
   const dependencies=new Map(available.flatMap(({dependency})=>pending.has(dependency)?[[dependency,pending.get(dependency)]]:[]));
   const claims=new Map(available.map(({asset})=>[asset.id,reserve(asset.id)]));
   const controller=new AbortController();
   const id=++nextBatch;
   const batch={controller,status:{id,label,total:available.length,completed:0,failed:0,failures:[],running:true,stopping:false,remaining:0}};
   for(const [oldId,old] of batches) {
    if(!old.status.running&&old.status.label===label)batches.delete(oldId);
   }
   const finished=[...batches.values()].filter(old=>!old.status.running);
   for(const old of finished.slice(0,Math.max(0,finished.length-7)))batches.delete(old.status.id);
   batches.set(id,batch);
   const update=patch=>{batch.status={...batch.status,...patch};refreshBatches();};
   const stop=()=>{controller.abort();update({stopping:true});};
   batch.stop=stop;
   const dispatchGuard=()=>{guard();if(controller.signal.aborted)throw new Error('已停止，未提交生图');};
   batch.work=runArtImageBatch(available,{
    concurrency,stopSignal:controller.signal,externalDependencies:dependencies,
    generate:(asset,referenceImage,referenceId)=>{dispatchGuard();return generate(asset,{referenceImage,referenceId,guard,dispatchGuard});},
    onProgress:progress=>update(progress),
    onResult:result=>{
     if(result.status==='fulfilled'&&!revoked)onAttached?.(result.asset,result.value);
     if(result.status==='rejected')update({failures:[...batch.status.failures,{name:result.asset.name,error:result.reason?.message||'图片处理失败'}]});
     claims.get(result.asset.id)(result);
     claims.delete(result.asset.id);
     setIds(new Set(idsRef.current));
    },
   }).then(outcome=>update({remaining:outcome.remaining}),error=>update({error:error.message})).finally(()=>{
    for(const release of claims.values())release({status:'rejected'});
    setIds(new Set(idsRef.current));update({running:false,stopping:false});
   });
   setIds(new Set(idsRef.current));refreshBatches();
   return batch.work;
  },
  stop(id){batches.get(id)?.stop();},
  pause(){
   const active=[...batches.values()].filter(batch=>batch.status.running);
   active.forEach(batch=>batch.stop());
   return Promise.allSettled(active.map(batch=>batch.work));
  },
  revoke(){revoked=true;void activity.pause();},
 };
 projects.set(key,activity);
 return activity;
}

export function beginAssetImageDirectorySwitch() {
 directorySwitching=true;
 return pauseAssetImageBatches();
}

export const pauseAssetImageBatches=()=>Promise.all([...projects.values()].map(activity=>activity.pause()));

export function finishAssetImageDirectorySwitch() {
 directorySwitching=false;
}

export function revokeAssetImageActivities() {
 for(const activity of projects.values())activity.revoke();
 projects.clear();
}

subscribeBindingStorage(revokeAssetImageActivities);
