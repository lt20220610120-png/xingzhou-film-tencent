import {currentEntryBinding,entryBindingSignature,saveDistribution,sceneInventoryCards} from './promptArtBinding.js';
import {assignSceneCard} from './scenePromptDistribution.js';

// Both scene-card editing and prompt auditing read the same versioned decisions.
// Never copy prompt links into the episode roster: a shared asset may be used
// in several scenes, each with an independently revised prompt batch.
export function cardPromptIds(snapshot,decisions,sceneId,cardUid){
 return snapshot.entries.filter(entry=>entry.sceneId===sceneId&&auditedBindingNeeds(snapshot,entry,decisions[entry.id]).some(need=>need.cardUid===cardUid&&need.visibility!=='excluded')).map(entry=>entry.id);
}
export function auditedBindingNeeds(snapshot,entry,saved){
 if(!saved)return [];
 const current=currentEntryBinding(snapshot,entry,saved);
 return saved.signature===entryBindingSignature(snapshot,entry)?current.needs:current.needs.filter(need=>need.locked);
}
export function assignCardToPrompts(snapshot,decisions,sceneId,cardUid,entryIds){
 const card=sceneInventoryCards(snapshot,sceneId).find(row=>row.uid===cardUid),entries=snapshot.entries.filter(entry=>entry.sceneId===sceneId);
 if(!card||!Array.isArray(entryIds)||entryIds.some(id=>!entries.some(entry=>entry.id===id)))throw Error('请选择本场资产及本场提示词');
 const next={...decisions};
 for(const entry of entries){
  const current=currentEntryBinding(snapshot,entry,next[entry.id]);
  const decision={...current,needs:auditedBindingNeeds(snapshot,entry,next[entry.id])};
  next[entry.id]=saveDistribution(snapshot,entry,assignSceneCard(snapshot,entry,decision,cardUid,entryIds.includes(entry.id)));
 }
 return next;
}
