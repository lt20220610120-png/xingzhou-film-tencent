import {bindingHash,bindingProblems,entryBindingSignature,compileEntryBinding} from './promptArtBinding.js';

export const promptSetId=snapshot=>'v-'+bindingHash((snapshot.entries||[]).map(({id,label,prompt,sceneId})=>[id,label,prompt,sceneId]));
const distributionStamp=(snapshot,entry)=>bindingHash([...(snapshot.voiceCards?.length?[snapshot.voiceCards.filter(c=>c.sceneIds.includes(entry.sceneId)).map(c=>[c.uid,c.reference.id])]:[]),entry.id,entry.prompt,entry.sceneId,snapshot.cards.filter(card=>card.sceneIds.includes(entry.sceneId)).map(card=>[card.uid,card.category,card.name,card.description,card.detailStatus])]);
// Each accepted decision carries its own semantic baseline. Saving another
// entry must not replace the only evidence for this entry's valid association.
const decisionIdentity=decision=>{const {signature,reuseEvidence,...value}=decision;return bindingHash(value);};
const associationSource=(snapshot,entry,decision)=>{
 const referenced=new Set((decision.needs||[]).map(n=>n.cardUid).filter(Boolean));
 const cards=snapshot.cards.filter(c=>referenced.has(c.uid)).map(c=>[c.uid,c.category,c.name,c.description,c.detailStatus,c.sceneIds.includes(entry.sceneId)]).sort((a,b)=>a[0].localeCompare(b[0]));
 const voices=(snapshot.voiceCards||[]).filter(c=>c.sceneIds.includes(entry.sceneId)).map(c=>[c.uid,c.name,c.reference.id]).sort((a,b)=>a[0].localeCompare(b[0]));
 return bindingHash([snapshot.projectId,snapshot.directorProjectId,entry.id,entry.prompt,entry.sceneId,cards,voices]);
};
const withEvidence=(snapshot,entry,decision)=>{
 if(!decision||decision.signature!==entryBindingSignature(snapshot,entry)||!decision.confirmed||bindingProblems(snapshot,entry,decision,{voiceEnabled:false}).length)return decision;
 return {...decision,reuseEvidence:{source:associationSource(snapshot,entry,decision),decision:decisionIdentity(decision)}};
};
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
 const snapshot={...current,entries:source.entries.map(entry=>({...entry,sceneReady:current.entries.find(row=>row.sceneId===entry.sceneId)?.sceneReady??current.cards.some(card=>card.sceneIds.includes(entry.sceneId))})),issues:source.issues||[],invalidEntries:source.invalidEntries,versionId:id};
 snapshot.signature=bindingHash([current.signature,id,snapshot.entries]);
 const decisions={...stored?.decisions};
 for(const entry of snapshot.entries){
  const decision=decisions[entry.id],oldEntry=stored?.snapshot.entries.find(row=>row.id===entry.id);
  // Image/publication changes need no model call. Reuse only a verified
  // baseline, while genuine source, selected-card or manual-choice changes fail.
  if(!decision||!oldEntry)continue;
  const evidence=withEvidence(stored.snapshot,oldEntry,decision)?.reuseEvidence;
  const reusable=evidence&&evidence.decision===decisionIdentity(decision)&&evidence.source===associationSource(snapshot,entry,decision);
  const unchanged=decision.signature===entryBindingSignature(stored.snapshot,oldEntry)&&distributionStamp(stored.snapshot,oldEntry)===distributionStamp(snapshot,entry);
  if(!reusable&&!unchanged)continue;
  const hydrated={...decision,signature:entryBindingSignature(snapshot,entry),needs:decision.needs.map(need=>{
   const card=snapshot.cards.find(row=>row.uid===need.cardUid);
   return {...need,imageId:need.imageId||((card?.images.length===1)?card.images[0].id:null)};
  })};
  // Missing/removed locked images remain errors; never substitute another image.
  decisions[entry.id]=withEvidence(snapshot,entry,hydrated);
 }
 return {snapshot,decisions,versionId:id};
}
export function saveBindingVersion(saved,snapshot,decisions){
 const versions=archive(saved),id=promptSetId(snapshot);
 decisions=Object.fromEntries(Object.entries(decisions).map(([key,value])=>{const entry=snapshot.entries.find(e=>e.id===key);return [key,entry?withEvidence(snapshot,entry,value):value];}));
 versions[id]={...versions[id],id,label:versions[id]?.label||`版本 ${Object.keys(versions).length+1}`,snapshot,decisions,createdAt:versions[id]?.createdAt||new Date().toISOString()};
 return {...saved,enabled:true,snapshot,decisions,versions,selectedVersionId:id};
}
export function promptExportImages(snapshot,decisions,{includeAudio=false}={}){
 const images=new Map();
 for(const entry of snapshot.entries){
  const compiled=compileEntryBinding(snapshot,entry,decisions[entry.id]);
  for(const ref of compiled.references){
   if(ref.kind==='video'||ref.kind==='audio'&&!includeAudio)continue;
   if(ref.kind==='audio'){
    const key='audio:'+ref.id,audio=images.get(key)||{...ref,assetName:ref.characterName||ref.name||'人物音色',episodes:[],sceneIds:[],promptIds:[]};
    audio.episodes=[...new Set([...audio.episodes,entry.episode])];audio.sceneIds=[...new Set([...audio.sceneIds,entry.sceneId])];audio.promptIds.push(entry.label);images.set(key,audio);continue;
   }
   const card=snapshot.cards.find(row=>row.assetId===ref.assetId),source=card?.images.find(row=>row.id===ref.imageId);
   const key=`${ref.assetId}:${ref.imageId}`,image=images.get(key)||{...source,projectId:snapshot.projectId,assetId:ref.assetId,assetName:ref.name,episodes:[],sceneIds:[],promptIds:[]};
   image.episodes=[...new Set([...image.episodes,entry.episode])];image.sceneIds=[...new Set([...image.sceneIds,entry.sceneId])];image.promptIds.push(entry.label);images.set(key,image);
  }
 }
 return [...images.values()];
}
export function sceneVoiceExports(snapshot){
 return (snapshot?.voiceCards||[]).filter(c=>c.sceneIds?.length).map(c=>({...c.reference,kind:'audio',assetName:c.name+'音色',episodes:[...new Set(c.sceneIds.map(id=>Number(id.split('-')[0])))],sceneIds:[...c.sceneIds]}));
}
