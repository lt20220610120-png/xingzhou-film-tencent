import {numberedReferences} from './generationReferences.js';
import {bindingHash} from './promptArtBinding.js';
export const productionImageLimit=(caps={},references=[])=>Math.min(caps.maxImages??1,(caps.maxTotalRefs??256)-references.filter(r=>r.kind!=='image').length,(caps.maxVisualRefs??256)-references.filter(r=>r.kind==='video').length);
export function selectProductionReferences(input){
 const all=input.references||[],images=all.filter(r=>r.kind==='image'),limit=productionImageLimit(input.modelCapabilities,all),plan=input.workflowReferenceSelection,over=images.length>limit;
 let selected=images;
 if(over){
  if(!plan||!Array.isArray(plan.selectedReferenceIds)||!plan.reason?.trim()||new Set(plan.selectedReferenceIds).size!==plan.selectedReferenceIds.length||plan.selectedReferenceIds.length>limit||!plan.selectedReferenceIds.length||plan.selectedReferenceIds.some(id=>!images.some(r=>r.id===id)))throw Error('Agent 选图结果缺失、超限或不是本条实际图片');
  if(images.some(r=>!['character','scene','prop'].includes(r.category)))throw Error('参考图片缺少明确主体类别，不能按优先级选图');
  const ids=new Set(plan.selectedReferenceIds);selected=images.filter(r=>ids.has(r.id));const priority=images.filter(r=>r.category==='character'||r.category==='scene');
  if(priority.length<=limit&&priority.some(r=>!ids.has(r.id)))throw Error('人物和场景应全部优先保留，道具不能挤占其名额');
  if(priority.length>limit&&selected.some(r=>r.category==='prop'))throw Error('人物场景已经超限，应舍弃道具参考图');
 }
 const ids=new Set(selected.map(r=>r.id)),references=all.filter(r=>r.kind!=='image'||ids.has(r.id)),oldAliases=numberedReferences(all),newAliases=new Map(numberedReferences(references).map(r=>[r.id,r.alias])),mapping=new Map(oldAliases.map(r=>[r.alias,newAliases.get(r.id)||'']));
 let prompt=String(input.prompt||'').replace(/@(image|audio|video)\d+/g,a=>{if(!mapping.has(a))throw Error('提示词存在没有对应实际参考文件的 @ 引用');return mapping.get(a);}).replace(/[（(]参考\s*[）)]/g,'');
 const omitted=images.filter(r=>!ids.has(r.id));if(omitted.length)prompt+='\n【参考图选用说明】\n未附图对象仍按剧本和提示词文字呈现：'+omitted.map(r=>r.name).join('、')+'。';
 const aliases=numberedReferences(references),used=new Set(prompt.match(/@(image|audio|video)\d+/g)||[]);
 for(const r of aliases)if(!used.has(r.alias))throw Error(`${r.name||r.id} 没有在提示词中建立有效 ${r.alias} 引用`);
 const verification={verifiedAt:Date.now(),sourcePromptId:input.bindingSourcePromptId||input.promptEntryId,sourceSignature:input.bindingEntrySignature||'',selected:aliases.map(({alias,id,assetId,imageId,category,name,kind})=>({alias,referenceId:id,assetId,imageId,category,name,kind})),omitted:omitted.map(({id,assetId,imageId,category,name})=>({referenceId:id,assetId,imageId,category,name})),reason:plan?.reason||'本条关联图片全部在模型限额内，按原顺序发送'};
 return {...input,prompt,references,referenceVerification:verification,workflowReferenceSelectionRequired:false};
}
export async function planProductionReferenceSelection({ctx,input,entry,work}){
 if(!input.workflowReferenceSelectionRequired)return;
 const {run}=ctx;run.referencePlans||={};const key=bindingHash([input.prompt,input.references.map(r=>[r.id,r.assetId,r.imageId,r.category,r.name]),input.modelCapabilities]),memo=run.referencePlans[entry.id];
 if(memo?.key===key&&!memo.failed){input.workflowReferenceSelection=memo;return;}
 if(memo?.key===key&&memo.failed&&memo.nextAt>Date.now())throw Error('本条选图目标处于退避等待，将自动重新接续');
 const attempts=memo?.key===key?(memo.attempts||0)+1:1;run.referencePlans[entry.id]={key,failed:true,attempts,nextAt:Date.now()+Math.min(900000,15000*2**Math.min(attempts,6))};await ctx.checkpoint();
 try{ctx.guard();await ctx.log?.(`Agent 目标：${entry.label} 在固定模型限额内选图，优先人物和场景，道具权重最低。`);
  const raw=await work('reference-plan',[{role:'system',content:'视频模型已经由用户选定，不允许切换模型。按本条提示词实际出场选择参考图：人物和场景优先，道具权重最低。人物与场景总数在限额内时必须全部保留，道具仅使用剩余名额；人物场景已经超限时不选道具，并按当前镜头重要性挑选主要人物与主场景。不删除剧本道具文字，只舍弃相应参考图。只返回JSON {"selectedReferenceIds":["本条实际参考图id"],"reason":"逐项取舍依据"}。id唯一且不超过imageLimit。'}, {role:'user',content:JSON.stringify({label:entry.label,prompt:input.prompt,imageLimit:productionImageLimit(input.modelCapabilities,input.references),references:input.references.map(({id,name,category})=>({id,name,category}))})}]);
  ctx.guard();const plan=JSON.parse(String(raw).replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));selectProductionReferences({...input,workflowReferenceSelection:plan});run.referencePlans[entry.id]={...plan,key,attempts};input.workflowReferenceSelection=plan;await ctx.checkpoint();
 }catch(error){ctx.guard();run.referencePlans[entry.id].error=error.message;await ctx.checkpoint();throw error;}
}
