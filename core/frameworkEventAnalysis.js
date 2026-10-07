// Models refer to existing cards by ID. Their authoritative content stays local.
const fail=message=>{throw Object.assign(new Error(message),{code:'FRAMEWORK_ANALYSIS_INVALID'});};
const prose=value=>typeof value==='string'?value:'';
const fields=['title','story','before','after','motive','foreshadow','actualTime'];
const emptyDraft=e=>!e.confirmed&&!e.locked&&!prose(e.story).trim()&&!prose(e.summary).trim();

export function analysisGroups(f,target){
 if(!f.settings.confirmed||f.settings.pending.length)fail('请先确认设定并处理待决设定，再分析小事件。');
 if(!f.mainline.orderConfirmed)fail('请先在主线确认大事件顺序，再分析小事件。');
 if(!f.groups.length||f.groups.some(g=>!g.confirmed))fail('请先确认所有大事件内容，再结合全剧分析小事件。');
 if(target.groupId&&!f.groups.some(g=>g.id===target.groupId))fail('目标大事件已删除。');
 const selected=f.groups.filter(g=>(!target.groupId||g.id===target.groupId)&&!g.locked);
 if(!selected.length)fail('目标大事件已固定，请先解除固定；其他固定大事件只作为上下文。');
 return selected;
}

export function validateEventAnalysis(f,target,result){
 const selected=analysisGroups(f,target),seenGroups=new Set();
 if(!Array.isArray(result.groups)||result.groups.length!==selected.length)fail('分析范围必须包含每个待分析大事件，不能遗漏或添加其他大事件。');
 const groups=result.groups.map(value=>{
  const g=selected.find(g=>g.id===value?.groupId);
  if(!g||seenGroups.has(g.id))fail('分析范围含有重复或不属于当前范围的大事件。');
  seenGroups.add(g.id);
  const retainedMiddleStory=g.middles.some(m=>m.events.some(e=>prose(e.story||e.summary).trim()));
  if(!Array.isArray(value.events)||!value.events.length&&!retainedMiddleStory)fail('每个大事件需要有顺畅完整的小事件序列。');
  const seenEvents=new Set(),references=[];
  const events=value.events.map((item,index)=>{
   if(!item||typeof item!=='object'||Array.isArray(item))fail('小事件结构无效。');
   if(item.eventId){
    const old=g.events.find(e=>e.id===item.eventId);
    if(!old)fail('已有小事件编号不属于当前大事件；中事件内的卡片保持原位，不需回传。');
    if(seenEvents.has(old.id))fail('已有小事件编号重复。');
    seenEvents.add(old.id);references.push(old.id);
    if(old.locked&&g.events.indexOf(old)!==index)fail('不能挤动固定小事件的位置。');
    const changed=fields.filter(key=>Object.hasOwn(item,key));
    if(changed.length&&!emptyDraft(old))fail('已有内容必须保留，不能覆盖或修改；请只返回 eventId。');
    if(changed.length&&(!prose(item.title).trim()||!prose(item.story).trim()))fail('补全空白草稿需要标题和完整故事。');
    return {eventId:old.id,...Object.fromEntries(changed.map(key=>[key,prose(item[key])]))};
   }
   if(item.id||item.locked||item.confirmed)fail('新小事件不能自带编号、固定或确认状态。');
   if(!prose(item.title).trim()||!prose(item.story).trim())fail('新小事件需要简短标题和具体完整故事。');
   return Object.fromEntries(fields.filter(key=>Object.hasOwn(item,key)).map(key=>[key,prose(item[key])]));
  });
  if(JSON.stringify(references)!==JSON.stringify(g.events.map(e=>e.id)))fail('必须按原顺序保留全部已有小事件，不能删除或重排已有内容。');
  return {groupId:g.id,events};
 });
 // Canonical order comes from the confirmed macro sequence, never model array order.
 return {reasoning:prose(result.reasoning),groups:selected.map(g=>groups.find(v=>v.groupId===g.id))};
}
