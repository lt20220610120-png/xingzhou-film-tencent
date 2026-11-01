import {bindingHash} from './promptArtBinding.js';
export function modelFallbackSteps(c,kind){
 const value=c[kind+'Fallbacks'];if(Array.isArray(value))return value;
 return kind==='image'&&c.fallbackImageModel?[{modelId:c.fallbackImageModel,attempts:c.imageAttempts,imageConcurrency:c.imageConcurrency,imageRatio:c.imageRatio}]:[];
}
export function modelPolicyRows(c,kind){return [{modelId:c[kind==='prompt'?'promptProfileId':'imageModel'],attempts:c[kind+'Attempts']??2,imageConcurrency:c.imageConcurrency,imageRatio:c.imageRatio,policyKey:'primary'},...modelFallbackSteps(c,kind).map((s,i)=>({...s,attempts:s.attempts??2,imageConcurrency:s.imageConcurrency??c.imageConcurrency,imageRatio:s.imageRatio??c.imageRatio,policyKey:'fallback:'+(s.id||i)}))];}
export function modelPolicyIssues(c,kind,models){
 const rows=modelPolicyRows(c,kind),name=kind==='prompt'?'提示词':'生图',issues=[];
 if(c[kind+'Fallbacks']!==undefined&&!Array.isArray(c[kind+'Fallbacks']))issues.push(name+'备用模型列表无效');
 for(const [i,s] of rows.entries()){
  if(!models.some(m=>m.id===s.modelId))issues.push(`请选择${name}${i?'备用 '+i:'主'}模型`);
  if(!Number.isInteger(Number(s.attempts))||s.attempts<1||s.attempts>8)issues.push(name+'尝试次数应在1–8次（含首次）之间');
  if(kind==='image'&&(!Number.isInteger(Number(s.imageConcurrency))||s.imageConcurrency<1||s.imageConcurrency>8))issues.push('生图数量应在1–8之间');
 }return issues;
}
export async function runPromptModelChain({ctx,profiles,remaining,generate}){
 const {run}=ctx,rows=modelPolicyRows(run.config,'prompt'),stamp=bindingHash([rows,run.config.promptSkillId,run.config.style,run.config.ratio,run.config.maxDuration]);
 if(run.promptModelPolicy?.stamp!==stamp)run.promptModelPolicy={stamp,attempts:{}};
 const ledger=run.promptModelPolicy;let lastError;
 for(const row of rows){
  if(!remaining().length)return;
  const model=profiles.find(m=>m.id===row.modelId);if(!model)throw Error('提示词主备模型已变化，请重新设置');
  while((ledger.attempts[row.policyKey]||0)<Number(row.attempts)){
   ctx.guard();if(!remaining().length)return;
   ledger.attempts[row.policyKey]=(ledger.attempts[row.policyKey]||0)+1;await ctx.checkpoint();
   await ctx.notice?.(`提示词生成：${model.name||model.id} · 第 ${ledger.attempts[row.policyKey]}/${row.attempts} 次 · 待补 ${remaining().length} 场`);
   try{await generate(model);ctx.guard();if(!remaining().length)return;lastError=Error('当前模型未补齐所有提示词');}
   catch(error){ctx.guard();lastError=error;}
   ledger.lastError=lastError.message;await ctx.checkpoint();
  }
 }
 throw Error('提示词主备模型尝试次数已用尽：'+(lastError?.message||ledger.lastError||'仍有未完成场景')+'；保留已完成提示词');
}
