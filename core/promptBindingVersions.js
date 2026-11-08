import {voiceAssociationIdentity} from './explicitDialogue.js';
import {bindingHash,bindingProblems,entryBindingSignature,compileEntryBinding} from './promptArtBinding.js';

export const promptSetId=snapshot=>'v-'+bindingHash((snapshot.entries||[]).map(({id,label,prompt,sceneId,profileId,profileHash})=>[id,label,prompt,sceneId,...(profileId?[profileId]:[]),...(profileHash?[profileHash]:[])]));
// Adding missing entries is an extension of an existing edition. Replacing an
// entry, deleting one, or introducing a different known model is a new edition.
const extendsEdition=(base,current)=>{
 if(!base?.entries?.length||base.projectId!==current.projectId||base.directorProjectId!==current.directorProjectId)return false;
 const entries=new Map(current.entries.map(e=>[e.id,e])),oldIds=new Set(base.entries.map(e=>e.id));
 if(!base.entries.every(old=>{const next=entries.get(old.id);return next&&old.label===next.label&&old.prompt===next.prompt&&old.sceneId===next.sceneId&&(!old.profileId||!next.profileId||old.profileId===next.profileId)&&(!old.profileHash||!next.profileHash||old.profileHash===next.profileHash);} ))return false;
 const profiles=new Set(base.entries.map(e=>e.profileId).filter(Boolean)),hashes=new Set(base.entries.map(e=>e.profileHash).filter(Boolean)),labels=new Set(base.entries.map(e=>e.label));
 return current.entries.filter(e=>!oldIds.has(e.id)).every(e=>!labels.has(e.label)&&(!profiles.size||!e.profileId||profiles.has(e.profileId))&&(!hashes.size||!e.profileHash||hashes.has(e.profileHash)));
};
const distributionStamp=(snapshot,entry)=>bindingHash([...(snapshot.voiceCards?.length?[snapshot.voiceCards.filter(c=>c.sceneIds.includes(entry.sceneId)).map(voiceAssociationIdentity)]:[]),entry.id,entry.prompt,entry.sceneId,snapshot.cards.filter(card=>card.sceneIds.includes(entry.sceneId)).map(card=>[card.uid,card.category,card.name,card.description,card.detailStatus])]);
// Each accepted decision carries its own semantic baseline. Saving another
// entry must not replace the only evidence for this entry's valid association.
const decisionIdentity=decision=>{const {signature,reuseEvidence,...value}=decision;return bindingHash(value);};
const associationSource=(snapshot,entry,decision)=>{
 const referenced=new Set((decision.needs||[]).map(n=>n.cardUid).filter(Boolean));
 const cards=snapshot.cards.filter(c=>referenced.has(c.uid)).map(c=>[c.uid,c.category,c.name,c.description,c.detailStatus,c.sceneIds.includes(entry.sceneId)]).sort((a,b)=>a[0].localeCompare(b[0]));
 const voices=(snapshot.voiceCards||[]).filter(c=>c.sceneIds.includes(entry.sceneId)).map(voiceAssociationIdentity).sort((a,b)=>a[0].localeCompare(b[0]));
 return bindingHash([snapshot.projectId,snapshot.directorProjectId,entry.id,entry.prompt,entry.sceneId,cards,voices]);
};
const withEvidence=(snapshot,entry,decision)=>{
 if(!decision||decision.signature!==entryBindingSignature(snapshot,entry)||!decision.confirmed||bindingProblems(snapshot,entry,decision,{voiceEnabled:false}).length)return decision;
 return {...decision,reuseEvidence:{source:associationSource(snapshot,entry,decision),decision:decisionIdentity(decision)}};
};
function archive(saved){
 const versions={...saved?.versions};
 if(saved?.snapshot?.entries?.length){const id=saved.snapshot.versionId||promptSetId(saved.snapshot);versions[id]={...versions[id],id,label:versions[id]?.label||`版本 ${Object.keys(versions).length+1}`,snapshot:saved.snapshot,decisions:saved.decisions||{},createdAt:versions[id]?.createdAt||saved.updatedAt||new Date().toISOString()};}
 return versions;
}
function versionGroups(versions,saved){
 const groups=[];
 for(const row of Object.values(versions)){
  let group=groups.find(g=>extendsEdition(g.snapshot,row.snapshot)||extendsEdition(row.snapshot,g.snapshot));
  if(!group){group={...row,members:[],decisions:{},decisionSources:{},reviews:{}};groups.push(group);}
  group.members.push(row);
  if(extendsEdition(group.snapshot,row.snapshot))group.snapshot=row.snapshot;
 }
 const topId=saved?.snapshot&&(saved.snapshot.versionId||promptSetId(saved.snapshot));
 for(const group of groups){
  if(group.members.some(row=>row.id===topId)&&extendsEdition(group.snapshot,versions[topId].snapshot))group.snapshot=versions[topId].snapshot;
  const rows=[...group.members,...(group.members.some(r=>r.id===topId)?[versions[topId]]:[])];
  for(const row of rows){Object.assign(group.reviews,row.reviews);for(const [id,value] of Object.entries(row.decisions||{})){group.decisions[id]=value;group.decisionSources[id]=row.snapshot;}}
 }
 return groups;
}
const editionRows=(current,versions,saved)=>versionGroups(versions,saved).filter(row=>extendsEdition(row.snapshot,current));
export function currentPromptVersionId(current,saved){return editionRows(current,archive(saved),saved)[0]?.id||promptSetId(current);}
export function bindingVersionOptions(snapshot,saved){
 const versions=archive(saved),groups=versionGroups(versions,saved),extensions=groups.filter(row=>extendsEdition(row.snapshot,snapshot)),id=extensions[0]?.id||promptSetId(snapshot);
 return [{id,label:versions[id]?.label||`版本 ${groups.length+1}`,count:snapshot.entries.length,current:true},...groups.filter(row=>row.id!==id).reverse().map(({id,label,snapshot})=>({id,label,count:snapshot.entries.length,current:false}))];
}
export function selectBindingVersion(current,saved,id){
 const versions=archive(saved),groups=versionGroups(versions,saved),extensions=groups.filter(row=>extendsEdition(row.snapshot,current)),currentId=extensions[0]?.id||promptSetId(current);
 const group=groups.find(row=>row.members.some(member=>member.id===id));
 id=id===undefined||id===promptSetId(current)||extensions.some(row=>row.id===group?.id)?currentId:group?.id||id;
 const stored=groups.find(row=>row.id===id);
 if(id!==currentId&&!stored)throw Error('提示词版本不存在，请刷新项目');
 const source=id===currentId?current:stored.snapshot;
 const snapshot={...current,entries:source.entries.map(entry=>({...entry,sceneReady:current.entries.find(row=>row.sceneId===entry.sceneId)?.sceneReady??current.cards.some(card=>card.sceneIds.includes(entry.sceneId))})),issues:source.issues||[],invalidEntries:source.invalidEntries,versionId:id};
 snapshot.signature=bindingHash([current.signature,id,snapshot.entries]);
 const decisions={},baselines=new Map();
 // Migrate previously forked supplement versions too. The newest explicit
 // choice wins; an older accepted association never overrides a manual draft.
 const rows=id===currentId?extensions:[stored];
 for(const row of rows)if(row)for(const [key,value] of Object.entries(row.decisions||{})){decisions[key]=value;baselines.set(key,row.decisionSources[key]||row.snapshot);}
 for(const entry of snapshot.entries){
  const decision=decisions[entry.id],baseline=baselines.get(entry.id),oldEntry=baseline?.entries.find(row=>row.id===entry.id);
  // Image/publication changes need no model call. Reuse only a verified
  // baseline, while genuine source, selected-card or manual-choice changes fail.
  if(!decision||!oldEntry)continue;
  const evidence=withEvidence(baseline,oldEntry,decision)?.reuseEvidence;
  const reusable=evidence&&evidence.decision===decisionIdentity(decision)&&evidence.source===associationSource(snapshot,entry,decision);
  const unchanged=decision.signature===entryBindingSignature(baseline,oldEntry)&&distributionStamp(baseline,oldEntry)===distributionStamp(snapshot,entry);
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
 const versions=archive(saved),id=snapshot.versionId||currentPromptVersionId(snapshot,saved);
 snapshot={...snapshot,versionId:id};
 decisions=Object.fromEntries(Object.entries(decisions).map(([key,value])=>{const entry=snapshot.entries.find(e=>e.id===key);return [key,entry?withEvidence(snapshot,entry,value):value];}));
 const reviews=Object.assign({},...editionRows(snapshot,versions,saved).map(row=>row.reviews||{}),versions[id]?.reviews||{});
 versions[id]={...versions[id],id,label:versions[id]?.label||`版本 ${versionGroups(versions,saved).length+1}`,snapshot,decisions,reviews,createdAt:versions[id]?.createdAt||new Date().toISOString()};
 return {...saved,enabled:true,snapshot,decisions,versions,selectedVersionId:id};
}
export function promptExportImages(snapshot,decisions,{includeAudio=false}={}){
 const images=new Map();
 for(const entry of snapshot.entries){
  const compiled=compileEntryBinding(snapshot,entry,decisions[entry.id],{voiceEnabled:includeAudio});
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
