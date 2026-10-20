import {assetHasImages} from './assetImages.js';
import {requestAssetImage,readAssetImageRecovery,clearAssetImageRecovery} from './assetImageRecovery.js';
import {runArtImageBatch} from './artImageBatch.js';

export function planAssetImageRecovery(projectId,assets,{isBusy=()=>false}={}){
 const targets=[],skipped=[],busy=[];
 for(const asset of new Map(assets.map(a=>[a.id,a])).values()){
  if(assetHasImages(asset))continue;
  const pending=readAssetImageRecovery(projectId,asset.id);
  if(!pending?.receiptId&&!pending?.taskId&&!pending?.filePath){skipped.push(asset);continue;}
  if(isBusy(asset.id)){busy.push(asset);continue;}
  targets.push(asset);
 }
 return {targets,skipped,busy};
}

export async function runAssetImageRecoveryBatch(api,projectId,assets,{attach,profile={},isBusy,concurrency=2,isStopped,onProgress}={}){
 const plan=planAssetImageRecovery(projectId,assets,{isBusy});
 const outcome=await runArtImageBatch(plan.targets.map(asset=>({asset})),{concurrency,isStopped,onProgress,generate:async asset=>{
  const result=await requestAssetImage(api,projectId,asset.id,{endpoint:profile.endpoint,apiKey:profile.apiKey},{recoveryOnly:true});
  if(!result?.filePath)throw new Error('原结果尚未取回有效图片，已保留恢复记录。');
  const saved=await attach(asset,result);
  if(!saved?.url)throw new Error('原图已取回，保存到项目尚未完成；可继续保存。');
  clearAssetImageRecovery(projectId,asset.id);
  return saved;
 }});
 return {...outcome,skipped:plan.skipped,busy:plan.busy};
}

// Confirmation belongs to the UI. This only releases existing recovery bindings;
// it neither deletes original images nor submits/cancels an upstream job.
export function abandonAssetImageRecoveries(projectId,assets,options={}){
 const plan=planAssetImageRecovery(projectId,assets,options);
 for(const asset of plan.targets)clearAssetImageRecovery(projectId,asset.id);
 return {cleared:plan.targets,skipped:plan.skipped,busy:plan.busy};
}
