import {bindingHash,entryBindingSignature,compileEntryBinding} from './promptArtBinding.js';

export const promptSetId=snapshot=>'v-'+bindingHash((snapshot.entries||[]).map(({id,label,prompt,sceneId})=>[id,label,prompt,sceneId]));
const distributionStamp=(snapshot,entry)=>bindingHash([entry.id,entry.prompt,entry.sceneId,snapshot.cards.filter(card=>card.sceneIds.includes(entry.sceneId)).map(card=>[card.uid,card.category,card.name,card.description,card.detailStatus])]);
function archive(saved){
 const versions={...saved?.versions};
 if(saved?.snapshot?.entries?.length){const id=promptSetId(saved.snapshot);versions[id]={...versions[id],id,label:versions[id]?.label||`版本 ${Object.keys(versions).length+1}`,snapshot:saved.snapshot,decisions:saved.decisions||{},createdAt:versions[id]?.createdAt||saved.updatedAt||new Date().toISOString()};}
 return versions;
}
export function bindingVersionOptions(snapshot,saved){
 const versions=archive(saved),id=promptSetId(snapshot);
 return [{id,label:versions[id]?.label||`版本 ${Object.keys(versions).length+1}`,current:true},...Object.values(versions).filter(row=>row.id!==id).reverse().map(({id,label})=>({id,label,current:false}))];
}
export function selectBindingVersion(current,saved,id=promptSetId(current)){
 const versions=archive(saved),stored=versions[id];
 if(id!==promptSetId(current)&&!stored)throw Error('提示词版本不存在，请刷新项目');
 const source=id===promptSetId(current)?current:stored.snapshot;
 const snapshot={...current,entries:source.entries.map(entry=>({...entry,sceneReady:current.entries.find(row=>row.sceneId===entry.sceneId)?.sceneReady??current.cards.some(card=>card.sceneIds.includes(entry.sceneId))})),issues:source.issues||[],versionId:id};
 snapshot.signature=bindingHash([current.signature,id,snapshot.entries]);
 const decisions={...stored?.decisions};
 for(const entry of snapshot.entries){
  const decision=decisions[entry.id],oldEntry=stored?.snapshot.entries.find(row=>row.id===entry.id);
  // Only hydrate images after a valid distribution. Text/card changes still require review.
  if(!decision||!oldEntry||decision.signature!==entryBindingSignature(stored.snapshot,oldEntry)||distributionStamp(stored.snapshot,oldEntry)!==distributionStamp(snapshot,entry))continue;
  decisions[entry.id]={...decision,signature:entryBindingSignature(snapshot,entry),needs:decision.needs.map(need=>{
   const card=snapshot.cards.find(row=>row.uid===need.cardUid);
   return {...need,imageId:need.imageId||((card?.images.length===1)?card.images[0].id:null)};
  })};
 }
 return {snapshot,decisions,versionId:id};
}
export function saveBindingVersion(saved,snapshot,decisions){
 const versions=archive(saved),id=promptSetId(snapshot);
 versions[id]={id,label:versions[id]?.label||`版本 ${Object.keys(versions).length+1}`,snapshot,decisions,createdAt:versions[id]?.createdAt||new Date().toISOString()};
 return {...saved,enabled:true,snapshot,decisions,versions,selectedVersionId:id};
}
export function promptExportImages(snapshot,decisions){
 const images=new Map();
 for(const entry of snapshot.entries){
  const compiled=compileEntryBinding(snapshot,entry,decisions[entry.id]);
  for(const ref of compiled.references){
   const card=snapshot.cards.find(row=>row.assetId===ref.assetId),source=card?.images.find(row=>row.id===ref.imageId);
   const key=`${ref.assetId}:${ref.imageId}`,image=images.get(key)||{...source,projectId:snapshot.projectId,assetId:ref.assetId,assetName:ref.name,episodes:[],sceneIds:[],promptIds:[]};
   image.episodes=[...new Set([...image.episodes,entry.episode])];image.sceneIds=[...new Set([...image.sceneIds,entry.sceneId])];image.promptIds.push(entry.label);images.set(key,image);
  }
 }
 return [...images.values()];
}
