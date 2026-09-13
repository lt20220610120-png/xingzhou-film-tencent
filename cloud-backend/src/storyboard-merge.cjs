const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function mergeDirectorEpisodes(current=[],incoming=[]) {
 const merged=incoming.map(ep=>{
  const old=current.find(e=>e.id===ep.id)||{};
  const prompts=(ep.prompts||[]).map(source=>{
   const previous=(old.prompts||[]).find(p=>p.id===source.id);
   if(!previous)return {...source,sourceContent:source.content||'',generationConfig:undefined,manual:false};
   const baseline=previous.sourceContent ?? previous.content;
   const edited=previous.content!==baseline;
   return {...source,content:edited?previous.content:source.content,sourceContent:source.content||'',generationConfig:previous.generationConfig,
    ...(edited&&source.content!==previous.content?{sourceConflict:source.content}:{}),manual:false};
  });
  // Preserve manually created shots, and retain removed source shots rather than deleting work/results.
  for(const previous of old.prompts||[])if(!prompts.some(p=>p.id===previous.id)){
    const kept={...previous,...(!previous.manual?{sourceRemoved:true}:{})};
    if(kept.manual&&prompts.some(p=>p.label===kept.label)){
      const scene=kept.label.split('-').slice(0,2).join('-');
      kept.label=scene+'-'+(1+Math.max(0,...prompts.filter(p=>p.label?.startsWith(scene+'-')).map(p=>Number(p.label.split('-')[2])||0)));
    }
    prompts.push(kept);
  }
  return {...old,...ep,prompts};
 });
 for(const ep of current)if(!merged.some(e=>e.id===ep.id))merged.push(ep);
 return merged;
}
function patchShot(episodes,payload) {
 const next=structuredClone(episodes||[]),ep=next.find(e=>e.id===payload.episodeId);
 if(!ep)throw Object.assign(new Error('分集已变更，请刷新后重试'),{status:409});
 ep.prompts=ep.prompts||[];
 if(payload.operation==='create'){
  if(ep.prompts.some(p=>p.id===payload.shotId))return next;
  if(!/^\d+-\d+$/.test(payload.scene||''))throw Object.assign(new Error('场景编号不合法'),{status:400});
  const max=Math.max(0,...ep.prompts.filter(p=>p.label?.startsWith(payload.scene+'-')).map(p=>Number(p.label.split('-')[2])||0));
  ep.prompts.push({id:payload.shotId,label:`${payload.scene}-${max+1}`,content:'',manual:true});
 }else{
  const shot=ep.prompts.find(p=>p.id===payload.shotId);if(!shot)throw Object.assign(new Error('分镜已变更'),{status:409});
  for(const key of ['content','generationConfig'])if(key in (payload.updates||{})){
   if(!equal(shot[key]??null,payload.base?.[key]??null)&&!equal(shot[key],payload.updates[key]))throw Object.assign(new Error('这条分镜已被其他协作者修改，草稿已保留；请刷新并核对云端内容后保存'),{status:409});
   shot[key]=payload.updates[key];
  }
  shot.edited_at=new Date().toISOString();
 }
 return next;
}
module.exports={mergeDirectorEpisodes,patchShot};
