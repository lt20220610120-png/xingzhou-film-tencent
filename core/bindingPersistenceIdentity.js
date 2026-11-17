import {bindingHash} from './promptArtBinding.js';
// PostgreSQL jsonb reorders object keys. Arrays retain their semantic order.
export const canonicalBindingValue=value=>Array.isArray(value)?value.map(canonicalBindingValue):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonicalBindingValue(value[k])])):value;
export function publishedAssociationMatches(snapshot,entry,decision){
 const published=snapshot.publishedAssociations?.[entry.id];
 if(!published||published.versionId!==snapshot.versionId||published.sourceHash!==bindingHash(entry.prompt)||!decision?.confirmed||decision.origin==='rules'||!/^\d+:\d+$/.test(decision.signature||''))return false;
 const needs=(decision.needs||[]).filter(n=>n.visibility==='visible');
 const cards=needs.map(n=>snapshot.cards.find(c=>c.uid===n.cardUid&&c.category===n.category&&c.sceneIds.includes(entry.sceneId)));
 if(!cards.length||cards.some(c=>!c))return false;
 const key=c=>JSON.stringify([c.category,c.name]);
 const actual=[...new Set(cards.map(key))].sort(),expected=[...new Set((published.assets||[]).map(key))].sort();
 return JSON.stringify(actual)===JSON.stringify(expected);
}
