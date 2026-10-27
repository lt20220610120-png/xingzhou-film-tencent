import {bindingHash,bindingProblems,sceneInventoryCards,saveDistribution,entryBindingSignature} from './promptArtBinding.js';
import {saveBindingVersion,promptSetId} from './promptBindingVersions.js';
import {sceneReadyForPromptDistribution} from './promptDistributionService.js';
import {editArtReview} from './artReview.js';

const inScope=(entry,scope)=>scope.sceneId?entry.sceneId===scope.sceneId:scope.episode?entry.episode===scope.episode:true;
export const promptHumanReviewSignature=(snapshot,entry,decision)=>bindingHash([entry.id,entry.prompt,entry.sceneId,sceneInventoryCards(snapshot,entry).map(c=>[c.uid,c.name,c.category,c.description,c.detailStatus]),decision?.needs?.map(({imageId,...need})=>need)]);
/**
 * Human resolution for a model-reported missing item.  A skipped reference is
 * deliberately persisted as an excluded, locked need so a later automatic
 * redistribution cannot turn it back into a blocking missing item.
 * Prompt association is considered complete after this explicit human
 * choice; the normal batch review action still records the audit checkpoint.
 */
export function skipPromptNeed(decision,needId,reason='人工确认：本条无需参考图，可使用文生'){
 if(!decision||!Array.isArray(decision.needs))throw Error('本条尚未完成模型分发');
 let changed=false;
 const needs=decision.needs.map(need=>{
  if(need.id!==needId||need.cardUid||need.visibility!=='visible')return need;
  changed=true;
  return {...need,visibility:'excluded',locked:true,skipReference:true,reason};
 });
 if(!changed)throw Error('该条目已处理或已关联卡片');
 return {...decision,needs,confirmed:true,origin:'human-skip-reference',issue:''};
}
export function promptReviewState(state,scope={}){
 const {snapshot,decisions,saved,ctx}=state,entries=snapshot.entries.filter(e=>inScope(e,scope)),reviews=saved?.versions?.[snapshot.versionId]?.reviews||{};
 const problems=[],pendingMissing=[],entryProblems=new Map();let approved=0,published=0;
 for(const invalid of snapshot.invalidEntries||[])if(scope.sceneId?invalid.sceneId===scope.sceneId||!invalid.sceneId&&invalid.episode===Number(scope.sceneId.split('-')[0]):scope.episode?invalid.episode===scope.episode:true)problems.push(invalid.reason);
 if(!Array.isArray(snapshot.invalidEntries)&&snapshot.issues?.length)problems.push(...snapshot.issues);
 if(!entries.length)problems.push('没有可核实的提示词');
 for(const entry of entries){
  const localProblems=[];
  const decision=decisions[entry.id],cards=sceneInventoryCards(snapshot,entry);
  if(!cards.length||ctx&&!sceneReadyForPromptDistribution(ctx.project,ctx.ledger,entry.sceneId))localProblems.push('场景清单尚未完成');
  if(!decision||decision.origin==='rules'||!cards.every(c=>decision.needs.some(n=>n.cardUid===c.uid)) )localProblems.push('模型分发尚未完成');
  else {
   const unresolved=decision.signature===entryBindingSignature(snapshot,entry)?(decision.needs||[]).filter(need=>need.visibility==='visible'&&!need.cardUid):[];
   unresolved.forEach(need=>pendingMissing.push({entry,need}));
   localProblems.push(...bindingProblems(snapshot,entry,decision));
  }
  if(saved?.sceneDistributionAttempts?.[snapshot.versionId+':'+entry.id]?.status==='running')localProblems.push('模型正在分发');
  const unique=[...new Set(localProblems)];if(unique.length)problems.push(...unique.map(p=>`${entry.label}：${p}`));entryProblems.set(entry.id,unique);
  if(reviews[entry.id]?.signature===promptHumanReviewSignature(snapshot,entry,decision)){approved++;if(reviews[entry.id].published)published++;}
 }
 const reviewableEntries=entries.filter(entry=>(entryProblems.get(entry.id)||[]).length===0);
 return {entries,reviewableEntries,ready:entries.length>0&&problems.length===0,problems:[...new Set(problems)],pendingMissing,approved,published};
}

// Resolve only the exact needs the person saw. One CAS write retains unrelated
// decisions, including results that finished in other episodes in the meantime.
export async function resolvePromptMissingReferences({service,targets,versionId}){
 if(!targets?.length)throw Error('请选择待处理项');
 const initial=await service.read(versionId),selectedVersion=initial.snapshot.versionId,followedCurrent=selectedVersion===promptSetId(initial.currentSnapshot);
 return service.mutate(selectedVersion,state=>{
  if(followedCurrent&&promptSetId(state.currentSnapshot)!==selectedVersion)throw Error('提示词来源版本已变化，请重新检查待处理项');
  const pending=promptReviewState(state,{}).pendingMissing,decisions={...state.decisions};
  for(const target of targets){
   const row=pending.find(({entry,need})=>entry.id===target.entryId&&need.id===target.needId);
   if(!row||target.signature!==promptHumanReviewSignature(state.snapshot,row.entry,state.decisions[row.entry.id]))throw Error('待处理项已变化，请重新检查');
   if(service.isBusy(row.entry.id)||state.saved?.sceneDistributionAttempts?.[selectedVersion+':'+row.entry.id]?.status==='running')throw Error('所选提示词正在分发，请完成后再确认');
   decisions[row.entry.id]=skipPromptNeed(decisions[row.entry.id],row.need.id);
  }
  for(const id of new Set(targets.map(t=>t.entryId)))decisions[id]=saveDistribution(state.snapshot,state.snapshot.entries.find(e=>e.id===id),decisions[id]);
  return saveBindingVersion(state.saved,state.snapshot,decisions);
 });
}

// Review is a deliberate human action; model completion alone never publishes.
export async function reviewPromptScope({service,store,scope={},actor,action='approve',versionId}){
 const initial=await service.read(versionId);let batch=promptReviewState(initial,scope),partialGlobal=!scope.sceneId&&!scope.episode&&!batch.ready;
 if(partialGlobal){if(!batch.reviewableEntries.length)throw Error('提示词分发尚未完成，暂无可批量核实的提示词');batch={...batch,entries:batch.reviewableEntries};}
 else if(!batch.ready)throw Error('提示词分发尚未完成，不能核实或发布：'+batch.problems.slice(0,4).join('；'));
 if(action==='publish'&&batch.approved!==batch.entries.length)throw Error('请先人工核实本范围全部提示词，再发布');
 if(batch.entries.some(e=>service.isBusy(e.id)))throw Error('本范围仍在模型分发，请完成后再核实');
 const signatures=new Map(batch.entries.map(e=>[e.id,promptHumanReviewSignature(initial.snapshot,e,initial.decisions[e.id])]));
 const check=state=>{
  let current=promptReviewState(state,scope);if(partialGlobal)current={...current,entries:current.reviewableEntries.filter(entry=>batch.entries.some(row=>row.id===entry.id))};
  if((!partialGlobal&&!current.ready)||current.entries.length!==batch.entries.length||batch.entries.some(expected=>{const entry=current.entries.find(row=>row.id===expected.id);return !entry||signatures.get(entry.id)!==promptHumanReviewSignature(state.snapshot,entry,state.decisions[entry.id]);}))throw Error('核实期间提示词分发已变化，请重新检查');
  return current;
 };
 await service.mutate(initial.snapshot.versionId,state=>{
  check(state);const data=saveBindingVersion(state.saved,state.snapshot,state.decisions),row=data.versions[state.snapshot.versionId],reviews={...row.reviews};
  for(const entry of batch.entries)reviews[entry.id]={...reviews[entry.id],signature:signatures.get(entry.id),actor,at:Date.now(),published:reviews[entry.id]?.signature===signatures.get(entry.id)&&reviews[entry.id]?.published||false};
  row.reviews=reviews;return data;
 });
 const scenes=new Map();for(const entry of batch.entries){const ids=scenes.get(entry.episode)||new Set();ids.add(entry.sceneId);scenes.set(entry.episode,ids);}
 await store.updateMany([...scenes].map(([number,ids])=>({number,reduce:r=>{for(const id of ids)r=editArtReview(r,{type:'approve',sceneId:id},actor);return r;}})));
 const failures=[];let published=0;
 if(action==='approve-publish'||action==='publish')for(const [number,ids] of scenes){
  try{
   check(await service.read(initial.snapshot.versionId));
   await store.publish(number,[...ids]);
   await service.mutate(initial.snapshot.versionId,state=>{
    check(state);const data=saveBindingVersion(state.saved,state.snapshot,state.decisions),row=data.versions[state.snapshot.versionId];
    row.reviews={...row.reviews};for(const entry of batch.entries.filter(e=>e.episode===number))row.reviews[entry.id]={...row.reviews[entry.id],published:true,publishedAt:Date.now()};return data;
   });published+=batch.entries.filter(e=>e.episode===number).length;
  }catch(error){failures.push(`第 ${number} 集：${error.message}`);}
 }
 return {count:batch.entries.length,published,failures};
}
