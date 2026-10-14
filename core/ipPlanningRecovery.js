import {groundIPPlanEpisodes} from './ipPlanGrounding.js';
import {rangeChapters,validateSourceRanges} from './ipSourceRanges.js';
export const isIPPlanningRepairable=error=>['IP_PLAN_SOURCE_MISMATCH','IP_PLAN_MISSING_ANCHOR','IP_PLAN_SOURCE_OVERLAP','IP_PLAN_CONTINUITY_MISMATCH','IP_EMPTY_OUTLINE','IP_DUPLICATE_OUTLINE','IP_SOURCE_UNIT_PLAN_INVALID','IP_JSON_INVALID','IP_JSON_TRUNCATED','IP_PLAN_ENDING_MISMATCH'].includes(error?.validationCode||error?.code);
/** Immutable coordinates into the actual supplied window, never model offsets. */
export function ipSourceUnits(source,start,end){
 validateSourceRanges([{start,end}],source);const units=[];
 for(const line of source.content.slice(start,end).matchAll(/[^\r\n]+/g)){
  if(/^\s*(?:#{1,6}\s*)?(?:第[零〇一二两三四五六七八九十百千万\d]+[章回节]|chapter\s+\d+)[^\r\n]*$/i.test(line[0]))continue;
  const parts=line[0].length>1200?[...line[0].matchAll(/[^。！？!?]+(?:[。！？!?]+[”’"）)]*|$)/g)]:[{0:line[0],index:0}];
  for(const part of parts){const text=part[0],left=text.length-text.trimStart().length,right=text.trimEnd().length;if(right<=left||!text.replace(/[\s\p{P}\p{S}]/gu,''))continue;const a=start+line.index+part.index+left,b=start+line.index+part.index+right;units.push({id:`u${a}_${b}`,start:a,end:b,text:source.content.slice(a,b)});}
 }
 return units;
}
export function groundIPUnitPlan(plan,source,units,options={}){
 const table=new Map(units.map(u=>[u.id,u])),fail=message=>{throw Object.assign(new Error(message),{code:'IP_SOURCE_UNIT_PLAN_INVALID'});};
 if(!Array.isArray(plan?.episodes)||!plan.episodes.length)fail('原文编号规划没有返回分集');
 const mapped=plan.episodes.map(e=>{
  if(!Array.isArray(e.sourceUnitRanges)||!e.sourceUnitRanges.length)fail('本集缺少真实原文单元编号');
  const ranges=e.sourceUnitRanges.map(r=>{const a=table.get(r.startId),b=table.get(r.endId);if(!a||!b||b.end<=a.start)fail('原文编号不在当前可用窗口内或顺序不合法，请从提供的编号重新选择');return {start:a.start,end:b.end};});
  try{validateSourceRanges(ranges,source);}catch(error){fail(error.message);}
  if(ranges.map(r=>source.content.slice(r.start,r.end)).join('').replace(/\s/g,'').length<4)fail('原文单元不足以构成有效场面，请与相邻真实内容合并');
  return {...e,chapterIds:rangeChapters(ranges,source).map(c=>c.id),sourceQuotes:undefined,sourceRanges:ranges};
 });
 const grounded=groundIPPlanEpisodes({...plan,episodes:mapped},source,{...options,requireAnchors:false});
 return {...grounded,episodes:grounded.episodes.map(e=>({...e,sourceLocatorVersion:1,sourceQuotes:e.sourceUnitRanges.map(r=>({startQuote:[...table.get(r.startId).text].slice(0,96).join(''),endQuote:[...table.get(r.endId).text].slice(-96).join('')}))}))};
}
export function carryIPWindowQuota(windows,index,offset,unusedStart){
 const current=windows[index],next=windows[index+1];if(!next||offset>=current.episodes)return 0;
 const carried=current.episodes-offset;current.episodes=offset;next.episodes+=carried;next.start=Math.min(next.start,unusedStart);return carried;
}
/** Compact display catalog; all verbatim text and real endpoint IDs remain. */
export function ipSourceUnitCatalog(source,units,limit=160){
 if(units.length<=limit)return units.map(({id,text})=>({id,text}));
 const size=Math.ceil(units.length/limit),catalog=[];
 for(let i=0;i<units.length;i+=size){const a=units[i],b=units[Math.min(i+size-1,units.length-1)];catalog.push({id:a.id,lastId:b.id,text:source.content.slice(a.start,b.end)});}
 return catalog;
}
