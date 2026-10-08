import {readRewriteOutline} from './rewriteOutline.js';
import {identityMetadata} from './rewriteIdentityMetadata.js';

export function outlineGroupCode(index) {
 let code='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))code=String.fromCharCode(65+(n-1)%26)+code;
 return code;
}
export function outlineEventOptions(outline) {
 const data=readRewriteOutline(outline);
 return data.groups.flatMap((group,i)=>group.events.map((event,j)=>({groupId:group.id,eventId:event.id,code:`${outlineGroupCode(i)}${j+1}`,title:event.title,groupTitle:group.title})));
}
// Existing prose stays intact until the user explicitly reorganizes it.
export function readRewriteMainline(raw) {
 if(!raw)return {eventGroups:[],legacyText:''};
 let data=raw;
 if(typeof data==='string') {
  try{data=JSON.parse(data.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}
  catch{if(/^\s*(?:\{|```json)/i.test(raw))throw new Error('主线 JSON 未能识别，原始内容仍然保留，请修正后再采用。');return {eventGroups:[],legacyText:raw};}
 }
 data=data.outline||data;
 if(typeof data==='string')return readRewriteMainline(data);
 if(!Array.isArray(data.eventGroups))throw new Error('主线结构需要按大纲小事件归组。原始结果保留在任务历史。');
 return {format:data.format,legacyText:typeof data.legacyText==='string'?data.legacyText:'',...(data.archivedEventGroups?.length?{archivedEventGroups:readRewriteMainline({eventGroups:data.archivedEventGroups}).eventGroups}:{}),eventGroups:data.eventGroups.map((group,i)=>({
  id:group.id||`mainline-${i+1}`,groupId:group.groupId||'',eventId:group.eventId||'',title:group.title||'',
  ...identityMetadata(group),
  ...(typeof group.story==='string'?{story:group.story,continuity:typeof group.continuity==='string'?group.continuity:''}:{}),
  ...(Array.isArray(group.legacyEpisodes)?{legacyEpisodes:group.legacyEpisodes}:{}),
  episodes:(group.episodes||[]).map(ep=>({number:ep.number,title:ep.title||`第${ep.number}集`,outline:ep.outline||'',source:ep.source||''})),
 }))};
}
export function validateRewriteMainline(raw,outline) {
 const data=readRewriteMainline(raw);
 if(!data.eventGroups.length)throw new Error('主线需要小事件分组及对应的逐集提纲。');
 const options=outlineEventOptions(outline),ids=new Set(),events=new Set(),numbers=new Set();
 for(const group of data.eventGroups) {
  const option=options.find(o=>o.eventId===group.eventId);
  if(ids.has(group.id)||events.has(group.eventId)||!option)throw new Error('主线分组必须对应大纲中唯一的小事件，不能只用 A1 标签猜测关联。');
  group.groupId=option.groupId;
  ids.add(group.id);events.add(group.eventId);
  if(!group.episodes.length)throw new Error('每个主线小事件组至少需要一集提纲。');
  for(const ep of group.episodes) {
   if(!Number.isInteger(ep.number)||ep.number<1||typeof ep.outline!=='string'||!ep.outline.trim()||numbers.has(ep.number))throw new Error('逐集提纲需要有效集号、完整内容；每集只能归入一个小事件组。');
   numbers.add(ep.number);
  }
 }
 return data;
}
export function rewriteMainlineText(raw,outline) {
 const data=readRewriteMainline(raw);let options=[];try{options=outlineEventOptions(outline);}catch{}
 return [data.legacyText,...data.eventGroups.map(group=>{
  const option=options.find(o=>o.eventId===group.eventId);
  return [`【${option?.code||'待关联'}：${option?.title||group.title}】`,group.story||'',group.continuity?`衔接核对：${group.continuity}`:'',...group.episodes.map(ep=>`【${ep.title||`第${ep.number}集`}】\n${ep.outline}${ep.source?`\n来源：${ep.source}`:''}`)].filter(Boolean).join('\n\n');
 })].filter(Boolean).join('\n\n');
}
export const REWRITE_MAINLINE_RULE='主线是按大纲小事件归组的集纲。使用当前大纲真实 groupId 和 eventId，A/B/C 是大事件顺序标签，A1/A2/B1 是对应小事件顺序标签；不能凭标签另造编号。每个小事件组包含它对应的第1集、第2集等逐集提纲，例如 A1 由第1—3集组成。这里只规划本集发生什么、人物行动、因果、转折与衔接，不展开正文对白。输出纯 JSON：{"eventGroups":[{"id":"line-1","groupId":"大纲组的真实id","eventId":"大纲小事件的真实id","title":"小事件名称","episodes":[{"number":1,"title":"第1集","outline":"这一集的具体提纲","source":"拆解时的原文依据"}]}]}。每集只归入一个小事件，保持集号与实际时间顺序；不凭空添加原稿没有的情节或结局。已有大纲缺失时先提示需要拆解或确认大纲，不凭空归组。';
