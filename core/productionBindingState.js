import {bindingProblems,entryBindingSignature,sceneInventoryCards} from './promptArtBinding.js';

// Initial automation accepts partial real associations. An explicit, confirmed
// no-reference decision is also completed work, provided its source is current.
export function hasProductionAssociation(snapshot,entry,decision){
 const needs=decision?.needs;
 if(!Array.isArray(needs))return false;
 const cards=sceneInventoryCards(snapshot,entry);
 if(needs.some(n=>n.visibility==='visible'&&cards.some(c=>c.uid===n.cardUid&&c.category===n.category)))return true;
 return decision.confirmed===true&&decision.signature===entryBindingSignature(snapshot,entry)&&!needs.some(n=>n.visibility==='visible')&&bindingProblems(snapshot,entry,decision).length===0;
}
