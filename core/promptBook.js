// Original block text stays untouched; only the bracketed numeric marker is structural.
export function parsePromptBook(text,name='整本提示词',id=crypto.randomUUID()) {
 const markers=[...String(text).matchAll(/【\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*】|\[\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*\]/g)];
 if(!markers.length)throw new Error('未找到【集数-场景-条目】编号，例如【1-1-1】。请检查文档格式。');
 const occurrences=new Map();
 const entries=markers.map((m,i)=>{
  const numbers=(m[1]===undefined?m.slice(4,7):m.slice(1,4)).map(Number);
  if(numbers.some(n=>!Number.isSafeInteger(n)||n<1))throw new Error('集数、场景和条目编号必须是正整数。');
  const base=numbers.join('-'),count=occurrences.get(base)||0;occurrences.set(base,count+1);
  return {id:`${base}:${count}`,episode:numbers[0],scene:numbers[1],number:numbers[2],label:base+(count?`（${count}）`:''),prompt:text.slice(m.index+m[0].length,markers[i+1]?.index??text.length)};
 });
 return {id,name,entries,preamble:text.slice(0,markers[0].index),drafts:{},episodeMedia:{},selectedEntryId:entries[0].id};
}

export function bookOutline(book){
 const episodes=new Map();
 for(const entry of book.entries){
  if(!episodes.has(entry.episode))episodes.set(entry.episode,new Map());
  const scenes=episodes.get(entry.episode);
  if(!scenes.has(entry.scene))scenes.set(entry.scene,[]);
  scenes.get(entry.scene).push(entry);
 }
 return [...episodes].sort((a,b)=>a[0]-b[0]).map(([number,scenes])=>({number,scenes:[...scenes].sort((a,b)=>a[0]-b[0]).map(([number,entries])=>({number,entries}))}));
}

export function entryValue(book,entry){
 const draft=book.drafts?.[entry.id]||{};
 const {excludedIds=[],overrides={},extraReferences=[],...settings}=draft;
 const shared=(book.episodeMedia?.[entry.episode]||[]).filter(r=>!excludedIds.includes(r.id)).map(r=>({...r,...overrides[r.id]}));
 return {prompt:entry.prompt,...book.settings,...settings,references:[...shared,...extraReferences]};
}

export function saveEntryValue(book,entryId,value,previousValue){
 const entry=book.entries.find(e=>e.id===entryId);if(!entry)return book;
 const shared=book.episodeMedia?.[entry.episode]||[],sharedIds=new Set(shared.map(r=>r.id));
 const {references=[],...settings}=value;
 const ids=new Set(references.map(r=>r.id));
 const previousIds=new Set((previousValue||entryValue(book,entry)).references.map(r=>r.id));
 const alreadyExcluded=new Set(book.drafts?.[entryId]?.excludedIds||[]);
 const overrides=Object.fromEntries(references.filter(r=>sharedIds.has(r.id)&&r.role).map(r=>[r.id,{role:r.role}]));
 const draft={...settings,excludedIds:shared.filter(r=>!ids.has(r.id)&&(previousIds.has(r.id)||alreadyExcluded.has(r.id))).map(r=>r.id),overrides,extraReferences:references.filter(r=>!sharedIds.has(r.id))};
 // Carry model/parameter preferences forward to untouched entries, never their text or media.
 const preferences=Object.fromEntries(['profileId','model','ratio','duration','resolution'].filter(k=>settings[k]!==undefined).map(k=>[k,settings[k]]));
 return {...book,settings:{...book.settings,...preferences},drafts:{...book.drafts,[entryId]:draft}};
}

export function mergeEpisodeMedia(book,incoming){
 const episodeMedia={...book.episodeMedia};
 for(const [episode,refs] of Object.entries(incoming)){
  const old=episodeMedia[episode]||[],ids=new Set(old.map(r=>r.id));
  episodeMedia[episode]=[...old,...refs.filter(r=>{if(ids.has(r.id))return false;ids.add(r.id);return true;})];
 }
 return {...book,episodeMedia};
}

export function referencePolicy(feituo,caps){
 return feituo?{maxImages:caps.maxImages??0,maxVideos:caps.maxVideos??0,maxAudios:caps.maxAudios??0}:{maxImages:1,maxVideos:0,maxAudios:0};
}
