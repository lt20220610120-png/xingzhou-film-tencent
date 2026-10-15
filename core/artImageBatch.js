import {withStorageWork} from './storageWork.js';
import {assetHasImages} from './assetImages.js';
import {assetReferencePeers,characterBaselineAsset} from './collabStore.js';

export function planArtImageBatch(assets,{readReference=()=>null,readRecovery=()=>null,includeGenerated=false}={}){
 const unique=[...new Map(assets.filter(a=>['character','scene','prop'].includes(a.category)).map(a=>[a.id,a])).values()];
 return unique.filter(a=>includeGenerated||!assetHasImages(a)).sort((a,b)=>(a.first_episode||Infinity)-(b.first_episode||Infinity)).map(asset=>{
  const selected=readReference(asset.id),recovery=readRecovery(asset.id);
  const peers=assetReferencePeers(asset,unique);
  const base=selected?peers.find(a=>a.id===selected):asset.category==='character'?characterBaselineAsset(asset,unique):asset.category==='scene'?peers[0]:null;
  return {asset,dependency:!recovery&&selected!==''&&base&&base.id!==asset.id&&!assetHasImages(base)?base.id:null};
 });
}

export function planAssetCategoryBatch(assets,{category,selectedIds,readReference,readRecovery}={}){
 const selected=selectedIds==null?null:new Set(selectedIds);
 return planArtImageBatch(assets,{readReference,readRecovery,includeGenerated:!!selected}).filter(({asset})=>
  asset.category===category&&!(Array.isArray(asset.sceneIds)&&!asset.sceneIds.length&&!asset.episodes?.length)&&(!selected||selected.has(asset.id)));
}

// Only the read/download layer retries. A failed generation is recorded once.
async function runArtImageBatchImpl(jobs,{concurrency=2,generate,isStopped=()=>false,onProgress=()=>{}}){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>8)throw new Error('图片并发数量应为 1 至 8');
 const pending=[...jobs],results=new Map();
 const report=()=>onProgress({total:jobs.length,completed:results.size,failed:[...results.values()].filter(r=>r.status==='rejected').length});
 while(pending.length&&!isStopped()){
  const ready=pending.filter(j=>!j.dependency||results.has(j.dependency));
  if(!ready.length){for(const job of pending)results.set(job.asset.id,{status:'rejected',reason:new Error('请先生成或选择人物基准参考图；当前参考基准未完成'),asset:job.asset});pending.length=0;report();break;}
  ready.forEach(j=>pending.splice(pending.indexOf(j),1));
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(concurrency,ready.length)},async()=>{
   while(cursor<ready.length&&!isStopped()){
    const job=ready[cursor++];
    try{
     if(job.dependency&&results.get(job.dependency)?.status!=='fulfilled')throw new Error('参考基准图片未完成，本造型未调用生图接口');
     const value=await generate(job.asset);
     if(!value)throw new Error('图片未保存，请检查结果后继续');
     results.set(job.asset.id,{status:'fulfilled',value,asset:job.asset});
    }catch(reason){results.set(job.asset.id,{status:'rejected',reason,asset:job.asset});}
    report();
   }
  }));
 }
 return {results:[...results.values()],remaining:jobs.length-results.size,stopped:isStopped()};
}

export const runArtImageBatch=(...args)=>withStorageWork(()=>runArtImageBatchImpl(...args));
