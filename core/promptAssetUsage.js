import {compileEntryBinding,entryBindingSignature} from './promptArtBinding.js';
import {auditedBindingNeeds} from './scenePromptAssignments.js';

export function assetPromptUsage(binding,asset){
 const sceneIds=asset.sceneIds||[],snapshot=binding?.snapshot;
 if(!snapshot?.entries?.length)return {promptMode:false,promptIds:[],sceneIds};
 const cards=snapshot.cards.filter(card=>card.assetId===asset.id||(card.name===asset.name&&card.category===asset.category)),promptIds=[];
 for(const entry of snapshot.entries){
  if(!cards.some(card=>card.sceneIds.includes(entry.sceneId)))continue;
  const needs=auditedBindingNeeds(snapshot,entry,binding.decisions?.[entry.id]);
  if(needs.some(need=>need.visibility!=='excluded'&&cards.some(card=>card.uid===need.cardUid))&&!promptIds.includes(entry.label))promptIds.push(entry.label);
 }
 return {promptMode:true,promptIds,sceneIds};
}

export function storyboardPromptValue(binding,shot,value,accountId){
 const pending=issue=>({...value,references:[],referenceBindingMode:'pending',bindingIssue:issue});
 if(binding?.error)return pending('提示词素材关联读取失败，请刷新重试：'+binding.error);
 if(!binding?.saved?.enabled||!binding.snapshot?.entries?.length)return null;
 const {snapshot,decisions}=binding,exact=snapshot.entries.filter(entry=>entry.id===(shot.sourcePromptId||shot.id));
 const rows=exact.length?exact:snapshot.entries.filter(entry=>entry.label===shot.label&&entry.prompt===shot.content);
 if(rows.length!==1)return pending('当前分镜的提示词版本未匹配，请返回清单核实检查本条关联');
 const entry=rows[0];
 if(entry.label!==shot.label||entry.prompt!==shot.content)return pending('提示词正文已变化，请返回清单核实重新分发');
 try{
  const compiled=compileEntryBinding(snapshot,entry,decisions?.[entry.id]);
  if(value.prompt!==entry.prompt&&value.prompt!==compiled.prompt)return {...pending('本地提示词已修改，草稿已保留，请核对提示词关联'),prompt:value.prompt};
  return {...value,...compiled,referenceBindingMode:'confirmed',bindingIssue:'',bindingSourcePrompt:entry.prompt,bindingCompiledPrompt:compiled.prompt,bindingExpectedReferences:compiled.references.map(ref=>ref.id),bindingEntrySignature:entryBindingSignature(snapshot,entry),bindingProjectId:snapshot.projectId,bindingAccountId:accountId,bindingSourcePromptId:entry.id,bindingVersionId:snapshot.versionId||'',autoReferenceExclusions:[],autoReferenceSignature:null};
 }catch(error){return pending(error.message);}
}
export function storyboardSaveUpdates(value){
 const {prompt,...generationConfig}=value;
 if(value.referenceBindingMode==='confirmed'&&typeof value.bindingSourcePrompt!=='string')throw Error('缺少关联来源提示词，请重新载入本条素材');
 if(value.referenceBindingMode==='confirmed'&&prompt!==value.bindingCompiledPrompt)return {content:prompt,generationConfig:{...generationConfig,referenceBindingMode:'pending',bindingIssue:'分镜提示词已修改，请返回清单核实重新分发'}};
 return {content:value.referenceBindingMode==='confirmed'?value.bindingSourcePrompt:prompt,generationConfig};
}
