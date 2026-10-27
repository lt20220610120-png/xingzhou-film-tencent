import {bindingHash,bindingProblems,sceneInventoryCards,saveDistribution,entryBindingSignature} from './promptArtBinding.js';
import {saveBindingVersion,promptSetId} from './promptBindingVersions.js';
import {sceneReadyForPromptDistribution} from './promptDistributionService.js';
import {editArtReview,isSceneVerified,reviewSceneSignature} from './artReview.js';

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
export async function reviewPromptScope({service,store,scope={},actor,action='approve',versionId,onProgress}){
 const initial=await service.read(versionId),all=promptReviewState(initial,scope),global=!scope.sceneId&&!scope.episode;
 let entries=all.entries;
 if(global&&!all.ready){
  // Publication is scene-atomic. Never publish a scene using only its valid subset.
  const readyScenes=new Set([...new Set(all.reviewableEntries.map(e=>e.sceneId))].filter(sceneId=>promptReviewState(initial,{sceneId}).ready));
  entries=all.reviewableEntries.filter(e=>readyScenes.has(e.sceneId));
  if(!entries.length)throw Error('提示词分发尚未完成，暂无可批量核实的提示词');
 }else if(!all.ready)throw Error('提示词分发尚未完成，不能核实或发布：'+all.problems.slice(0,4).join('；'));
 const reviews=initial.saved?.versions?.[initial.snapshot.versionId]?.reviews||{};
 const approved=entry=>reviews[entry.id]?.signature===promptHumanReviewSignature(initial.snapshot,entry,initial.decisions[entry.id]);
 if(action==='publish'){
  if(!global&&entries.some(e=>!approved(e)))throw Error('请先人工核实本范围全部提示词，再发布');
  const approvedScenes=new Set([...new Set(entries.map(e=>e.sceneId))].filter(id=>entries.filter(e=>e.sceneId===id).every(approved)));
  entries=entries.filter(e=>approvedScenes.has(e.sceneId));
  if(!entries.length)throw Error('请先人工核实本范围全部提示词，再发布');
 }
 if(entries.some(e=>service.isBusy(e.id)))throw Error('本范围仍在模型分发，请完成后再核实');
 const followedCurrent=initial.snapshot.versionId===promptSetId(initial.currentSnapshot);
 const signatures=new Map(entries.map(e=>[e.id,promptHumanReviewSignature(initial.snapshot,e,initial.decisions[e.id])]));
 const check=(state,targets=entries)=>{
  const expectedIds=new Set(targets.map(e=>e.id));
  for(const sceneId of new Set(targets.map(e=>e.sceneId))){
   if(followedCurrent){
    const live=state.currentSnapshot.entries.filter(e=>e.sceneId===sceneId),invalid=state.currentSnapshot.invalidEntries||[];
    if(live.length!==targets.filter(e=>e.sceneId===sceneId).length||live.some(e=>!expectedIds.has(e.id))||invalid.some(e=>e.sceneId===sceneId||!e.sceneId&&e.episode===Number(sceneId.split('-')[0])))throw Error('提示词来源已变化，请重新核实后发布');
   }
   const current=promptReviewState(state,{sceneId});
   if(!current.ready||current.entries.some(e=>!expectedIds.has(e.id))||current.entries.length!==targets.filter(e=>e.sceneId===sceneId).length)throw Error('核实期间提示词分发已变化，请重新检查');
  }
  const currentReviews=state.saved?.versions?.[state.snapshot.versionId]?.reviews||{};
  for(const expected of targets){
   const entry=state.snapshot.entries.find(e=>e.id===expected.id),currentEntry=state.currentSnapshot.entries.find(e=>e.id===expected.id);
   if(followedCurrent&&(!currentEntry||currentEntry.prompt!==expected.prompt||currentEntry.sceneId!==expected.sceneId||currentEntry.label!==expected.label))throw Error('提示词来源已变化，请重新核实后发布');
   if(!entry||service.isBusy(entry.id)||signatures.get(entry.id)!==promptHumanReviewSignature(state.snapshot,entry,state.decisions[entry.id])||action==='publish'&&currentReviews[entry.id]?.signature!==signatures.get(entry.id))throw Error('核实期间提示词分发已变化，请重新检查');
  }
 };
 const scenes=new Map();for(const entry of entries){const group=scenes.get(entry.episode)||{episode:entry.episode,ids:new Set(),entries:[]};group.ids.add(entry.sceneId);group.entries.push(entry);scenes.set(entry.episode,group);}
 const groups=[...scenes.values()],items=groups.map(g=>({episode:g.episode,count:g.entries.length,phase:'queued'}));
 let published=0,skipped=0,cloudDone=0;const failures=[];
 const report=()=>{try{onProgress?.({phase:action==='approve'?'approving':'publishing',total:entries.length,done:published,cloudDone,skipped,concurrency:4,items:items.map(i=>({...i})),active:items.filter(i=>!['queued','complete','failed'].includes(i.phase)).map(i=>({...i}))});}catch{}};
 report();
 if(action!=='publish'){
  await service.mutate(initial.snapshot.versionId,state=>{
   check(state);const data=saveBindingVersion(state.saved,state.snapshot,state.decisions),row=data.versions[state.snapshot.versionId],next={...row.reviews};
   for(const entry of entries)next[entry.id]={...next[entry.id],signature:signatures.get(entry.id),actor,at:Date.now(),published:next[entry.id]?.signature===signatures.get(entry.id)&&next[entry.id]?.published||false};
   row.reviews=next;return data;
  });
  await store.updateMany(groups.map(({episode:number,ids})=>({number,reduce:r=>{for(const id of ids)if(!isSceneVerified(r.scenes?.find(s=>s.id===id)))r=editArtReview(r,{type:'approve',sceneId:id},actor);return r;}})));
 }
 if(action==='approve')return {count:entries.length,published:0,failures};
 let cursor=0;
 const worker=async()=>{while(cursor<groups.length){
  const index=cursor++,group=groups[index],item=items[index];
  try{
   item.phase='checking';report();
   const state=await service.read(initial.snapshot.versionId);check(state,group.entries);
   const marks=state.saved?.versions?.[state.snapshot.versionId]?.reviews||{},record=store.snapshot?.().episodes?.[group.episode];
   const already=group.entries.every(e=>marks[e.id]?.published&&marks[e.id]?.signature===signatures.get(e.id))&&(!record||!record.pending&&[...group.ids].every(id=>record.published?.[id]?.signature===reviewSceneSignature(record.scenes.find(s=>s.id===id))));
   if(already){skipped+=group.entries.length;published+=group.entries.length;cloudDone+=group.entries.length;item.phase='complete';item.skipped=true;report();continue;}
   await store.publish(group.episode,[...group.ids],{onProgress:phase=>{item.phase=phase;report();}});
   cloudDone+=group.entries.length;item.phase='checkpoint';report();
   await service.mutate(initial.snapshot.versionId,current=>{
    check(current,group.entries);const data=saveBindingVersion(current.saved,current.snapshot,current.decisions),row=data.versions[current.snapshot.versionId];row.reviews={...row.reviews};
    for(const entry of group.entries)row.reviews[entry.id]={...row.reviews[entry.id],published:true,publishedAt:Date.now()};return data;
   });
   published+=group.entries.length;item.phase='complete';report();
  }catch(error){item.phase='failed';item.error=error.message;failures.push(`第 ${group.episode} 集：${error.message}`);report();}
 }};
 await Promise.all(Array.from({length:Math.min(4,groups.length)},worker));
 return {count:entries.length,published,skipped,failures};
}
