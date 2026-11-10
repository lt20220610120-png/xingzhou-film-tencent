import {inlineVoiceAliases} from './inlineVoiceAliases.js';
import {numberedReferences} from './generationReferences.js';
import {compileEntryBinding,entryBindingSignature} from './promptArtBinding.js';
import {auditedBindingNeeds} from './scenePromptAssignments.js';
import {selectBindingVersion} from './promptBindingVersions.js';

export function assetPromptUsage(binding,asset){
 const sceneIds=asset.sceneIds||[],snapshot=binding?.snapshot;
 if(binding?.publishedStoryboards)return {promptMode:true,promptIds:binding.publishedStoryboards.filter(p=>(p.generationConfig?.bindingAssetIds||[]).includes(asset.id)||(p.generationConfig?.bindingAssets||[]).some(c=>c.assetId?c.assetId===asset.id:c.category===asset.category&&c.name===asset.name)||(p.generationConfig?.references||[]).some(r=>r.assetId===asset.id)).map(p=>p.label),sceneIds};
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
 // Published rows already contain the exact per-prompt reference assignment.
 // A changing director draft must never recompile a manual storyboard edit.
 if(shot.storyboardPublicationId||value.referenceBindingMode==='storyboard'){
  const result={...value,referenceBindingMode:'storyboard',bindingIssue:''};
  if(!shot.storyboardPublicationId||!canRefreshStoryboardBinding({dirty:true,value},shot)||!binding?.currentSnapshot)return result;
  try{
   const {snapshot,decisions}=selectBindingVersion(binding.currentSnapshot,binding.saved,value.bindingVersionId);
   const entry=snapshot.entries.find(e=>e.id===shot.sourcePromptId&&e.prompt===shot.sourceContent);
   if(!entry)return result;
   const compiled=compileEntryBinding(snapshot,entry,decisions[entry.id],{preview:true});
   return {...result,...compiled,referenceBindingMode:'storyboard',bindingIssue:'',bindingCompiledPrompt:compiled.prompt,bindingExpectedReferences:compiled.references.map(r=>r.id)};
  }catch{return result;}
 }
 const pending=issue=>({...value,references:[],referenceBindingMode:'pending',bindingIssue:issue});
 if(binding?.error)return pending('提示词素材关联读取失败，请刷新重试：'+binding.error);
 const sceneId=String(shot.label||'').split('-').slice(0,2).join('-');
 const manualScene=shot.manual&&!binding?.snapshot?.entries?.some(e=>e.id===(shot.sourcePromptId||shot.id));
 if(binding?.snapshot&&(manualScene||!binding.snapshot.entries?.some(e=>e.sceneId===sceneId))){
  const voices=(binding.snapshot.voiceCards||[]).filter(c=>c.sceneIds.includes(sceneId)&&!c.pendingAudio);
  if(!voices.length&&!value.sceneVoiceAssociation)return null;
  const references=[...(value.references||[]).filter(r=>!String(r.id).startsWith('voice:')),...voices.map(c=>c.reference)],aliases=new Map(numberedReferences(references).map(r=>[r.id,r.alias]));
  const base=value.prompt===value.sceneVoiceCompiledPrompt&&typeof value.sceneVoiceSourcePrompt==='string'?value.sceneVoiceSourcePrompt:String(value.prompt||'').split('\n【场景人物音色参考】')[0];
  const prompt=inlineVoiceAliases(base,voices.map(c=>({...c,alias:aliases.get(c.reference.id)})));
  return {...value,prompt,references,sceneVoiceAssociation:sceneId,sceneVoiceSourcePrompt:base,sceneVoiceCompiledPrompt:prompt};
 }
 if(!binding?.saved?.enabled||!binding.snapshot?.entries?.length)return null;
 const {snapshot,decisions}=binding,exact=snapshot.entries.filter(entry=>entry.id===(shot.sourcePromptId||shot.id));
 const rows=exact.length?exact:snapshot.entries.filter(entry=>entry.label===shot.label&&entry.prompt===shot.content);
 if(rows.length!==1)return pending('当前分镜的提示词版本未匹配，请返回清单核实检查本条关联');
 const entry=rows[0];
 if(entry.label!==shot.label||entry.prompt!==storyboardSourcePrompt(shot))return pending('提示词正文已变化，请返回清单核实重新分发');
 try{
  const compiled=compileEntryBinding(snapshot,entry,decisions?.[entry.id],{preview:true});
  const generated=value.prompt===value.bindingCompiledPrompt&&value.bindingSourcePrompt===entry.prompt;
  if(value.prompt!==entry.prompt&&value.prompt!==compiled.prompt&&!generated)return {...value,referenceBindingMode:'storyboard',bindingIssue:''};
  return {...value,...compiled,referenceBindingMode:compiled.pendingMedia.length?'pending':'confirmed',bindingIssue:compiled.pendingMedia.join('；'),bindingSourcePrompt:entry.prompt,bindingCompiledPrompt:compiled.prompt,bindingExpectedReferences:compiled.references.map(ref=>ref.id),bindingEntrySignature:entryBindingSignature(snapshot,entry),bindingProjectId:snapshot.projectId,bindingAccountId:accountId,bindingSourcePromptId:entry.id,bindingVersionId:snapshot.versionId||'',autoReferenceExclusions:[],autoReferenceSignature:null};
 }catch(error){return pending(error.message);}
}
export function canRefreshStoryboardBinding(draft,shot){
 if(!draft?.dirty)return true;
 const value=draft.value;
 if(shot.storyboardPublicationId)return value.prompt===value.bindingCompiledPrompt&&!value.autoReferenceExclusions?.length&&JSON.stringify((value.references||[]).map(r=>r.id))===JSON.stringify(value.bindingExpectedReferences);
 if(!value.bindingSourcePromptId)return value.prompt===shot.content;
 if(value.bindingSourcePromptId!==(shot.sourcePromptId||shot.id)||value.autoReferenceExclusions?.length)return false;
 if(value.prompt!==shot.content&&!(value.prompt===value.bindingCompiledPrompt&&value.bindingSourcePrompt===shot.content))return false;
 // A failed automatic load clears references; hand removal records exclusions.
 if(value.referenceBindingMode==='pending'&&(!(value.references||[]).length||value.prompt===value.bindingCompiledPrompt&&JSON.stringify((value.references||[]).map(r=>r.id))===JSON.stringify(value.bindingExpectedReferences)))return true;
 return value.referenceBindingMode==='confirmed'&&JSON.stringify((value.references||[]).map(r=>r.id))===JSON.stringify(value.bindingExpectedReferences);
}
export function storyboardSaveUpdates(value){
 const {prompt,...generationConfig}=value;
 if(value.referenceBindingMode==='confirmed'&&typeof value.bindingSourcePrompt!=='string')throw Error('缺少关联来源提示词，请重新载入本条素材');
 if(value.referenceBindingMode==='storyboard'||value.referenceBindingMode==='confirmed'&&prompt!==value.bindingCompiledPrompt)return {content:prompt,generationConfig:{...generationConfig,referenceBindingMode:'storyboard',bindingIssue:''}};
 const linkedPreview=value.referenceBindingMode==='pending'&&typeof value.bindingSourcePrompt==='string'&&prompt===value.bindingCompiledPrompt;
 return {content:value.referenceBindingMode==='confirmed'||linkedPreview?value.bindingSourcePrompt:prompt,generationConfig};
}

export function storyboardSourcePrompt(shot){const config=shot.generationConfig;return typeof config?.bindingSourcePrompt==='string'&&shot.content===config.bindingCompiledPrompt?config.bindingSourcePrompt:shot.content;}
