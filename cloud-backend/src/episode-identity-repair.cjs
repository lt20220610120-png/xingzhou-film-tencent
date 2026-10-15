const {episodeNumber,unitHeaders}=require('./collab-episodes.cjs');
const invalid=message=>Object.assign(new Error(message),{status:400,code:'EPISODE_IDENTITY_INVALID'});
const conflict=message=>Object.assign(new Error(message),{status:409,code:'EPISODE_IDENTITY_CONFLICT'});
const setting=episode=>episode?.kind==='setting'||episode?.title==='设定和小传';
function archiveEpisode(episode){
 const {episodeIdentityHistory,...snapshot}=episode;
 return structuredClone(snapshot);
}
function flattenHistory(entries){
 const flattened=[],seen=new Set(),visited=new WeakSet();
 const visit=entry=>{
  if(entry&&typeof entry==='object'){
   if(visited.has(entry))return;visited.add(entry);
   for(const nested of Array.isArray(entry.episode?.episodeIdentityHistory)?entry.episode.episodeIdentityHistory:[])visit(nested);
  }
  const snapshot=entry?.episode&&typeof entry.episode==='object'?{...entry,episode:archiveEpisode(entry.episode)}:structuredClone(entry);
  // JSONB can reorder object keys; compare canonical content when consolidating
  // the same historical entry copied into multiple older nested snapshots.
  const key=JSON.stringify(snapshot,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)
   ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
  if(!seen.has(key)){seen.add(key);flattened.push(snapshot);}
 };
 for(const entry of entries)visit(entry);
 return flattened;
}
const history=episode=>flattenHistory(Array.isArray(episode?.episodeIdentityHistory)?episode.episodeIdentityHistory:[]);

// Preserve live shot identities without replacing the chosen manuscript. The
// complete archived row also retains differing versions of a shared shot ID.
function preserveWork(target,removed){
 const deleted=new Set([...(target.deletedPromptIds||[]),...(removed.deletedPromptIds||[])]);
 const live=prompt=>!deleted.has(prompt.id)&&!(prompt.manual!==true&&deleted.has('source-label:'+prompt.label));
 target.prompts=(target.prompts||[]).filter(live);
 const ids=new Set(target.prompts.map(p=>p.id));
 for(const prompt of removed.prompts||[])if(live(prompt)&&(!prompt.id||!ids.has(prompt.id))){target.prompts.push(prompt);ids.add(prompt.id);}
 target.shotCounters={...target.shotCounters};
 for(const [scene,count] of Object.entries(removed.shotCounters||{}))target.shotCounters[scene]=Math.max(Number(target.shotCounters[scene])||0,Number(count)||0);
 target.deletedPromptIds=[...deleted];
}

function applyEpisodeIdentityChange(episodes,payload={}){
 if(!Array.isArray(episodes)||episodes.some(ep=>!ep||typeof ep!=='object'||Array.isArray(ep)))throw invalid('分集列表无效，请刷新后重试');
 const {operation,index}=payload;
 if(!['select-primary','edit','remove'].includes(operation)||!Number.isInteger(index)||index<0||index>=episodes.length)throw invalid('请选择有效分集和修正操作');
 const next=episodes.map(ep=>({...archiveEpisode(ep),...(Object.hasOwn(ep,'episodeIdentityHistory')?{episodeIdentityHistory:history(ep)}:{})}));
 const selected=next[index],at=new Date().toISOString();
 if(setting(selected)&&operation!=='remove')throw invalid('请选择需要修正编号的正文分集');
 if(operation==='edit'){
  if(!['title','content','episodeNumber'].some(key=>Object.hasOwn(payload,key)))throw invalid('请输入需要修改的分集内容');
  for(const key of ['title','content'])if(Object.hasOwn(payload,key)){
   if(typeof payload[key]!=='string'||!payload[key].trim()||payload[key].length>(key==='title'?200:500000))throw invalid('请输入有效的本集标题和剧本内容');
   selected[key]=payload[key];
  }
  if(Object.hasOwn(payload,'episodeNumber')){
   if(!Number.isInteger(payload.episodeNumber)||payload.episodeNumber<1||payload.episodeNumber>10000)throw invalid('集数必须是 1—10000 的整数');
   selected.episodeNumber=payload.episodeNumber;
   for(const key of ['number','episode','episode_number'])if(Object.hasOwn(selected,key))selected[key]=payload.episodeNumber;
  }
  const number=episodeNumber(selected);
  if(!number)throw invalid('标题、正文场次和集数相互矛盾，请核对后一起修正');
  const previousNumber=episodeNumber(episodes[index]);
  if(number!==previousNumber&&next.some((ep,i)=>i!==index&&!setting(ep)&&episodeNumber(ep)===number))throw conflict(`第${number}集已存在，请核对编号`);
  selected.episodeIdentityHistory=flattenHistory([...history(selected),{at,reason:operation,episode:archiveEpisode(episodes[index])}]);
  selected.collabOnly=true;return next;
 }
 if(operation==='select-primary'){
  const number=episodeNumber(selected);
  if(!number)throw invalid('所选主稿的编号相互矛盾，请先修改核对');
  const removed=next.filter((ep,i)=>i!==index&&!setting(ep)&&episodeNumber(ep)===number);
  if(!removed.length)throw conflict('所选分集没有同编号的其他记录');
  // Merged tombstones can remove a stale shot belonging only to the chosen
  // draft. Archive its complete business data before changing any live work.
  selected.episodeIdentityHistory=[...history(selected),{at,reason:'primary-before-merge',episode:archiveEpisode(selected)}];
  for(const ep of removed){preserveWork(selected,ep);selected.episodeIdentityHistory.push(...history(ep),{at,reason:operation,episode:archiveEpisode(ep)});}
  selected.episodeIdentityHistory=flattenHistory(selected.episodeIdentityHistory);
  selected.collabOnly=true;
  const group=new Set(removed);return next.filter(ep=>!group.has(ep));
 }
 if(next.length===1)throw conflict('最后一条记录需要保留作为原稿历史载体');
 next.splice(index,1);
 // Prefer the surviving version of this episode, otherwise the next adjacent
 // manuscript. This selects a storage carrier only, never a primary draft.
 const number=episodeNumber(selected),carrier=next.find(ep=>number&&episodeNumber(ep)===number)||next[Math.min(index,next.length-1)];
 carrier.episodeIdentityHistory=flattenHistory([...history(carrier),...history(selected),{at,reason:operation,episode:archiveEpisode(selected)}]);
 carrier.collabOnly=true;return next;
}

function composeEpisodeIdentityScript(episodes){
 return episodes.map(ep=>{
  const content=String(ep.content||''),title=String(ep.title||''),number=episodeNumber(ep);
  if(setting(ep))return content;
  if(unitHeaders(content.split(/\r?\n/)[0]).length)return content;
  return [number&&episodeNumber({title})!==number?`第${number}集${title?' '+title:''}`:title,content].filter(Boolean).join('\n');
 }).filter(Boolean).join('\n\n');
}
function filterRemovedDirectorEpisodes(current,incoming){
 const removed=current.flatMap(ep=>history(ep)).filter(h=>['remove','edit','select-primary'].includes(h?.reason)&&h.episode).map(h=>h.episode);
 return incoming.filter(ep=>!removed.some(old=>old.id&&ep?.id?old.id===ep.id
   :old.title===ep?.title&&old.content===ep?.content&&episodeNumber(old)===episodeNumber(ep)));
}
module.exports={archiveEpisode,applyEpisodeIdentityChange,composeEpisodeIdentityScript,filterRemovedDirectorEpisodes};
