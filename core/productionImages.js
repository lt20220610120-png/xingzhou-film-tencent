import {planArtImageBatch,runArtImageBatch} from './artImageBatch.js';
import {requestAssetImage,readAssetImageRecovery,clearAssetImageRecovery} from './assetImageRecovery.js';
import {resolveAssetReference,characterAppearanceIssue} from './collabStore.js';
import {buildComposedImagePrompt} from './artImageComposition.js';
import {autoReferences} from './generationReferences.js';
import {assetHasImages} from './assetImages.js';
import {bindingHash} from './promptArtBinding.js';
import {imageFailureKind} from './productionFurnace.js';
import {isFundingError} from './productionRecovery.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export async function produceImages({ctx,api,project,assets,primary,fallback,work,delay=wait}){
 const {run}=ctx,c=run.config,p=project;run.imageItems||={};ctx.imageBudgets||=new Map();const budgets=ctx.imageBudgets,reset=new Set(),before=assets.filter(assetHasImages).length;
 const stamp=bindingHash([c.imageModel,c.fallbackImageModel,c.imageAttempts,c.imageRatio,c.composition,c.artStyle]);
 const plan=planArtImageBatch(assets,{readRecovery:id=>readAssetImageRecovery(p.id,id)});
 const result=await runArtImageBatch(plan,{concurrency:Number(c.imageConcurrency),isStopped:()=>run.status!=='running',onProgress:v=>{run.imageProgress=v;},generate:async asset=>{
  ctx.guard();const item=run.imageItems[asset.id]||{attempts:0};run.imageItems[asset.id]=item;
  if(['submitting','uncertain'].includes(item.status)&&!readAssetImageRecovery(p.id,asset.id))throw Error(`${asset.name} 上次提交结果不明，Agent 正在等待原任务凭据；未重复生图`);
  if(!reset.has(asset.id)&&(isFundingError(item.error)||item.configuration&&item.configuration!==stamp)){reset.add(asset.id);item.attempts=0;item.modelAttempts={};item.status='queued';item.error='';}item.configuration=stamp;
  item.modelAttempts||={[primary.id]:Math.min(item.attempts,Number(c.imageAttempts)),[fallback.id]:Math.max(0,item.attempts-Number(c.imageAttempts))};
  const ref=resolveAssetReference(asset,assets),issue=!ref&&characterAppearanceIssue(asset,assets);if(issue)throw Error(issue);
  const limit=Number(c.imageAttempts)*2;
  let prompt=item.promptOverride||buildComposedImagePrompt(asset,ref,c.artStyle,c.composition,p);
  const usable=[primary,fallback].filter(m=>!budgets.has(m.id)),exhausted=usable.length>0&&usable.every(m=>(item.modelAttempts[m.id]||0)>=Number(c.imageAttempts));
  if((item.attempts>=limit||exhausted)&&!readAssetImageRecovery(p.id,asset.id)){
   const repairKey=bindingHash([stamp,asset.name,prompt,item.error]);
   if(work&&(item.repairCount||0)<3&&item.lastRepairKey!==repairKey){ctx.guard();await ctx.log?.(`Agent 目标：修复「${asset.name}」生成失败的提示词，保持主体、年龄、画风与构图。`);item.lastRepairKey=repairKey;item.repairCount=(item.repairCount||0)+1;await ctx.checkpoint();
    const raw=await work('image-prompt',[{role:'system',content:'修复这张影视美术图片的生成描述。保留主体、年龄/物种、人物身份、服饰和用户画风构图；只能修正文法、矛盾、缺细节和格式，不通过删除真实敏感事实或改年龄规避内容限制。不要新增剧情。只返回JSON {"assetName":"原名称","prompt":"完整修订提示词","reason":"具体修复点"}。若原文无法在约束内改善则prompt返回原文并说明。'}, {role:'user',content:JSON.stringify({assetName:asset.name,category:asset.category,prompt,error:item.error,style:c.artStyle,composition:c.composition})}]);ctx.guard();const value=JSON.parse(String(raw).replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));
    if(value.assetName!==asset.name||typeof value.prompt!=='string'||!value.prompt.trim()||value.prompt.length>24000||!value.reason?.trim()||value.prompt===prompt)throw Error('Agent 未返回可验证的新提示词，保留原描述继续等待修复');
    item.promptOverride=value.prompt;item.promptRepair={reason:value.reason,at:Date.now(),originalHash:bindingHash(prompt)};item.attempts=0;item.modelAttempts={};prompt=value.prompt;await ctx.checkpoint();
   }else throw Error(item.error||`${asset.name} 正在等待新的修复策略`);
  }
  while(item.attempts<limit||readAssetImageRecovery(p.id,asset.id)){
   ctx.guard();const pending=readAssetImageRecovery(p.id,asset.id),models=[primary,fallback];
   let model=pending?(models.find(m=>m.id===item.activeModel)||models[item.attempts<=Number(c.imageAttempts)?0:1]):models.find(m=>!budgets.has(m.id)&&(item.modelAttempts[m.id]||0)<Number(c.imageAttempts));
   if(!model){if(models.every(m=>budgets.has(m.id)))throw Error(`生图主备渠道余额不足：${[...budgets.values()].join('；')}`);throw Error(item.error||'已完成主备渠道尝试，等待 Agent 修复提示词');}
   item.status='submitting';if(!pending){item.attempts++;item.modelAttempts[model.id]=(item.modelAttempts[model.id]||0)+1;item.activeModel=model.id;}await ctx.checkpoint();
   try{const generated=await requestAssetImage(api,p.id,asset.id,{...model,profileId:model.profileId,model:model.model,prompt,size:c.imageRatio,references:ref?autoReferences(`@${ref.name}`,[ref]):[]});ctx.guard();
    if(!generated?.filePath)throw Error('生图接口没有返回图片文件');const attached=await api.collabAttachGeneratedAssetImage({projectId:p.id,assetId:asset.id,episode:asset.first_episode||0,filePath:generated.filePath});ctx.guard();if(!attached?.url)throw Error('图片已生成但未保存到项目');
    clearAssetImageRecovery(p.id,asset.id);item.status='done';item.error='';assets=await api.collabListAssets({projectId:p.id});if(run.monitor?.art){run.monitor.art.summary.images=assets.filter(assetHasImages).length;run.monitor.art.summary.assets=assets.length;run.monitor.checkedAt=Date.now();}await ctx.log?.(`图片完成：${asset.name}`,'success');await ctx.checkpoint();return attached;
   }catch(error){ctx.guard();const pending=readAssetImageRecovery(p.id,asset.id);item.error=error.message;
    if(isFundingError(error)&&!pending){item.attempts--;item.modelAttempts[model.id]--;item.status='budget';budgets.set(model.id,String(error.message).replace(/\s*\(request id:[^)]*\)/ig,''));await ctx.log?.(`生图渠道余额不足，切换已配置备用渠道：${model.name||model.model}`,'warning');await ctx.checkpoint();continue;}
    const kind=imageFailureKind(error,pending);item.status=kind;await ctx.checkpoint();
    if(pending?.taskId){await delay(5000);continue;}
    if(['uncertain','configuration'].includes(kind))throw error;
    if(item.attempts>=limit)throw error;await delay(kind==='rate-limit'?5000:1500);
   }
  }throw Error(item.error||`${asset.name} 待 Agent 修复后接续`);
 }});
 run.imageErrors=result.results.filter(r=>r.status==='rejected').map(r=>({id:r.asset.id,name:r.asset.name,error:r.reason.message}));
 await ctx.log?.(`美术图片：复用 ${before} 张，新完成 ${result.results.filter(r=>r.status==='fulfilled').length} 项，待接续 ${run.imageErrors.length} 项。${run.imageErrors.length?'原因：'+[...new Set(run.imageErrors.map(i=>isFundingError(i.error)?'生图渠道余额不足':i.error))].slice(0,4).join('；'):''}`);await ctx.checkpoint();return {partial:run.imageErrors.length>0||result.remaining>0};
}
