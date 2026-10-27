import {bindingHash,bindingProblems,sceneInventoryCards} from './promptArtBinding.js';
import {saveBindingVersion} from './promptBindingVersions.js';
import {sceneReadyForPromptDistribution} from './promptDistributionService.js';
import {editArtReview} from './artReview.js';

const inScope=(entry,scope)=>scope.sceneId?entry.sceneId===scope.sceneId:scope.episode?entry.episode===scope.episode:true;
export const promptHumanReviewSignature=(snapshot,entry,decision)=>bindingHash([entry.id,entry.prompt,entry.sceneId,sceneInventoryCards(snapshot,entry).map(c=>[c.uid,c.name,c.category,c.description,c.detailStatus]),decision?.needs?.map(({imageId,...need})=>need)]);
/**
 * Human resolution for a model-reported missing item.  A skipped reference is
 * deliberately persisted as an excluded, locked need so a later automatic
 * redistribution cannot turn it back into a blocking missing item.  The
 * The prompt association is considered complete after this explicit human
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
 const problems=[],pendingMissing=[];let approved=0,published=0;
 for(const invalid of snapshot.invalidEntries||[])if(scope.sceneId?invalid.sceneId===scope.sceneId||!invalid.sceneId&&invalid.episode===Number(scope.sceneId.split('-')[0]):scope.episode?invalid.episode===scope.episode:true)problems.push(invalid.reason);
 if(!Array.isArray(snapshot.invalidEntries)&&snapshot.issues?.length)problems.push(...snapshot.issues);
 if(!entries.length)problems.push('没有可核实的提示词');
 for(const entry of entries){
  const decision=decisions[entry.id],cards=sceneInventoryCards(snapshot,entry);
  if(!cards.length||ctx&&!sceneReadyForPromptDistribution(ctx.project,ctx.ledger,entry.sceneId))problems.push(`${entry.label}：场景清单尚未完成`);
  if(!decision||decision.origin==='rules'||!cards.every(c=>decision.needs.some(n=>n.cardUid===c.uid)))problems.push(`${entry.label}：模型分发尚未完成`);
  else {
   const unresolved=(decision.needs||[]).filter(need=>need.visibility==='visible'&&!need.cardUid);
   unresolved.forEach(need=>pendingMissing.push({entry,need}));
   problems.push(...bindingProblems(snapshot,entry,decision).map(p=>`${entry.label}：${p}`));
  }
  if(saved?.sceneDistributionAttempts?.[snapshot.versionId+':'+entry.id]?.status==='running')problems.push(`${entry.label}：模型正在分发`);
  if(reviews[entry.id]?.signature===promptHumanReviewSignature(snapshot,entry,decision)){approved++;if(reviews[entry.id].published)published++;}
 }
 return {entries,ready:entries.length>0&&problems.length===0,problems:[...new Set(problems)],pendingMissing,approved,published};
}

// Review is a deliberate human action; model completion alone never publishes.
export async function reviewPromptScope({service,store,scope={},actor,action='approve',versionId}){
 const initial=await service.read(versionId),batch=promptReviewState(initial,scope);
 if(!batch.ready)throw Error('提示词分发尚未完成，不能核实或发布：'+batch.problems.slice(0,4).join('；'));
 if(action==='publish'&&batch.approved!==batch.entries.length)throw Error('请先人工核实本范围全部提示词，再发布');
 if(batch.entries.some(e=>service.isBusy(e.id)))throw Error('本范围仍在模型分发，请完成后再核实');
 const signatures=new Map(batch.entries.map(e=>[e.id,promptHumanReviewSignature(initial.snapshot,e,initial.decisions[e.id])]));
 const check=state=>{
  const current=promptReviewState(state,scope);
  if(!current.ready||current.entries.length!==batch.entries.length||current.entries.some(e=>signatures.get(e.id)!==promptHumanReviewSignature(state.snapshot,e,state.decisions[e.id])))throw Error('核实期间提示词分发已变化，请重新检查');
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
