import {reviewSceneSignature} from './artReview.js';
// A shared association carries the scene inventory needed to resolve card IDs.
// Published cloud reviews win over older shared inventories; real local edits
// remain local until deliberately saved/published.
export function mergeSharedReviewLedger(local,project,{protectDrafts=true}={}){
 const next=structuredClone(local||{episodes:{}});next.episodes||={};
 const binding=project.analysis_progress?._sharedPromptBinding;
 const shared=binding?.reviewLedger?.episodes||{};
 for(const n of new Set([...Object.keys(project.analysis_progress||{}),...Object.keys(shared)])){
  const published=project.analysis_progress?.[n]?.review;
  const candidate=published&&(!shared[n]||Number(published.version)>=Number(shared[n].version))?published:shared[n];
  if(!candidate)continue;
  const old=next.episodes[n];
  const publishedLocal=old?.scenes?.length&&old.scenes.every(s=>old.published?.[s.id]?.signature===reviewSceneSignature(s));
  if(protectDrafts&&old&&old.status!=='empty'&&(old.pending||!old._sharedBindingRevision&&!publishedLocal))continue;
  if(!old||old.status==='empty'||Number(candidate.version)>Number(old.version)||shared[n]===candidate&&Number(binding.revision)>Number(old._sharedBindingRevision||0)&&Number(candidate.version)>=Number(old.version||0)){
   next.episodes[n]={...structuredClone(candidate),pending:false,...(shared[n]===candidate?{_sharedBindingRevision:binding.revision}:{})};
  }
 }
 return next;
}
