import {withStorageWork} from './storageWork.js';
import {assetHasImages} from './assetImages.js';
import {assetSkipsReferenceImage} from './assetReferencePolicy.js';
import {assetReferencePeers,characterBaselineAsset,isCharacterWardrobeVariant,normalizeAssetReferenceChoice} from './collabStore.js';

export function requiresWardrobeBaselineImage(asset,assets) {
 return isCharacterWardrobeVariant(asset,assets)&&!assetSkipsReferenceImage(characterBaselineAsset(asset,assets));
}

export function planArtImageBatch(assets,{readReference=()=>null,readRecovery=()=>null,includeGenerated=false,categoryOrder=false}={}){
 const unique=[...new Map(assets.filter(a=>['character','scene','prop'].includes(a.category)).map(a=>[a.id,a])).values()];
 return unique.filter(a=>!assetSkipsReferenceImage(a)&&(includeGenerated||!assetHasImages(a))).sort((a,b)=>(categoryOrder?['character','scene','prop'].indexOf(a.category)-['character','scene','prop'].indexOf(b.category):0)||(a.first_episode||Infinity)-(b.first_episode||Infinity)).map(asset=>{
  const selected=normalizeAssetReferenceChoice(asset,unique,readReference(asset.id)),recovery=readRecovery(asset.id);
  const peers=assetReferencePeers(asset,unique);
  const base=selected?peers.find(a=>a.id===selected):asset.category==='character'?characterBaselineAsset(asset,unique):asset.category==='scene'?peers[0]:null;
  return {asset,...(categoryOrder?{categoryOrder:true}:{}),dependency:!recovery&&selected!==''&&base&&base.id!==asset.id&&!assetHasImages(base)&&!assetSkipsReferenceImage(base)?base.id:null};
 });
}

export function planAssetCategoryBatch(assets,{category,selectedIds,readReference,readRecovery}={}){
 const selected=selectedIds==null?null:new Set(selectedIds);
 return planArtImageBatch(assets,{readReference,readRecovery,includeGenerated:!!selected}).filter(({asset})=>
  asset.category===category&&!(Array.isArray(asset.sceneIds)&&!asset.sceneIds.length&&!asset.episodes?.length)&&(!selected||selected.has(asset.id)));
}

export function pendingCharacterBaselines(assets){
 const roots=new Map();
 for(const asset of assets.filter(a=>a.category==='character'&&!(Array.isArray(a.sceneIds)&&!a.sceneIds.length&&!a.episodes?.length))){
  const base=characterBaselineAsset(asset,assets);
  if(base&&!assetHasImages(base)&&!assetSkipsReferenceImage(base))roots.set(base.id,base);
 }
 return [...roots.keys()];
}

// Only the read/download layer retries. A failed generation is recorded once.
async function runArtImageBatchImpl(jobs,{concurrency=2,generate,isStopped=()=>false,stopSignal,onProgress=()=>{},onResult=()=>{},externalDependencies=new Map()}){
 if(concurrency!==Infinity&&(!Number.isInteger(concurrency)||concurrency<1))throw new Error('图片并发数量应为正整数或不限');
 const pending=new Map(jobs.map(job=>[job.asset.id,job])),running=new Map(),results=new Map();
 const externalResults=new Map(),waiting=new Map();
 let failed=0,wake;
 const notify=()=>wake?.();
 for(const [id,promise] of externalDependencies)waiting.set(id,promise.then(result=>{
  externalResults.set(id,result);waiting.delete(id);notify();
 }));
 const stopped=()=>isStopped()||stopSignal?.aborted;
 stopSignal?.addEventListener('abort',notify,{once:true});
 const record=(job,result)=>{
  const row={...result,asset:job.asset};
  results.set(job.asset.id,row);
  if(row.status==='rejected')failed++;
  onResult(row);
  onProgress({total:jobs.length,completed:results.size,failed});
 };
 try{
  const categoryOrder=jobs.some(job=>job.categoryOrder);
  while(pending.size&&!stopped()){
   const nextCompletion=new Promise(resolve=>{wake=resolve;});
   const category=categoryOrder?jobs.find(job=>pending.has(job.asset.id)||running.has(job.asset.id)).asset.category:null;
   const candidates=[...pending.values()].filter(job=>!category||job.asset.category===category);
   for(const job of candidates){
    if(running.size>=concurrency||stopped())break;
    const dependency=results.get(job.dependency)||externalResults.get(job.dependency);
    if(job.dependency&&!dependency)continue;
    const id=job.asset.id;
    pending.delete(id);
    running.set(id,Promise.resolve().then(async()=>{
     if(stopped()){pending.set(id,job);return;}
     try{
      if(dependency&&dependency.status!=='fulfilled')throw new Error('参考基准图片未完成，未提交该项生图');
      const value=await generate(job.asset,dependency?.value,job.dependency);
      if(!value)throw new Error('图片未保存，请检查结果后继续');
      record(job,{status:'fulfilled',value});
     }catch(reason){record(job,{status:'rejected',reason});}
    }).finally(()=>{running.delete(id);notify();}));
   }
   if(running.size||candidates.some(job=>waiting.has(job.dependency))){
    if(!stopped())await nextCompletion;
    continue;
   }
   for(const job of candidates){
    pending.delete(job.asset.id);
    record(job,{status:'rejected',reason:new Error('基准参考图尚未生成，请先完成基准图或选择「不引用参考」')});
   }
  }
  await Promise.all(running.values());
 }finally{stopSignal?.removeEventListener('abort',notify);}
 return {results:[...results.values()],remaining:jobs.length-results.size,stopped:Boolean(stopped())};
}

export const runArtImageBatch=(...args)=>withStorageWork(()=>runArtImageBatchImpl(...args));
