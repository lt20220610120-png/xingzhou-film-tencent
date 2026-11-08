import {bindingProblems,entryBindingSignature,sceneInventoryCards} from './promptArtBinding.js';

// Initial automation accepts partial real associations. An explicit, confirmed
// no-reference decision is also completed work, provided its source is current.
export function hasProductionAssociation(snapshot,entry,decision,{voiceEnabled=true}={}){
 const needs=decision?.needs;
 if(voiceEnabled&&snapshot.voiceCards?.some(c=>c.sceneIds.includes(entry.sceneId))&&(decision?.signature!==entryBindingSignature(snapshot,entry)||!Array.isArray(decision?.speakers)))return false;
 if(!Array.isArray(needs))return false;
 if(bindingProblems(snapshot,entry,decision,{voiceEnabled,requireConfirmed:false}).some(p=>p.includes('尚未关联')))return false;
 const cards=sceneInventoryCards(snapshot,entry);
 if(needs.some(n=>n.visibility==='visible'))return decision.signature===entryBindingSignature(snapshot,entry)&&!decision.issue&&needs.filter(n=>n.visibility==='visible').every(n=>cards.some(c=>c.uid===n.cardUid&&c.category===n.category));
 return decision.confirmed===true&&decision.signature===entryBindingSignature(snapshot,entry)&&!needs.some(n=>n.visibility==='visible')&&bindingProblems(snapshot,entry,decision,{voiceEnabled}).length===0;
}
