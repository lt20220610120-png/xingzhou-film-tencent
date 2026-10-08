import {storySourceOptions,referenceKey,referenceIdentity,resolveStoryReferences} from './rewriteReferences.js';
import {assertRewriteIdentityReady,conversionFingerprint,assertCanonicalRewriteProse} from './rewriteConversion.js';
import {rewriteIdentity} from './rewriteIdentity.js';
import {readRewriteOutline,validateRewriteOutline} from './rewriteOutline.js';
import {readRewriteMainline,outlineEventOptions,rewriteMainlineText} from './rewriteMainline.js';

export const REWRITE_STORY_RULE=`主线任务：把已经确认的新作大纲展开为完整故事稿，不分集，不输出集号、集纲或分场剧本。按新作 A1、A2 到结尾的顺序，写清事件的具体起因、经过、冲突、转折、结果，人物行动、心理与知情变化，必要时加入关键对白。每个小事件服务所属大事件，衔接前一事件并为后续事件铺垫。必须通读提供的全剧骨架、已有故事稿和已确认的新作设定人物，再展开指定事件，不能独立编出与后续冲突的单元故事。currentStories 中 needs-review 是依据已变化的旧稿，仅供改写参考，不是当前已定人物事实；future 是后续约束，不是本事件已经发生的事实。人物库中的真实关系不等于当前角色已经知情，不得提前泄露后续身份。演员使用 canonicalIdentity 里的稳定ID和新作名称/称谓；不合并同名角色。只参考明确绑定的对标事件及其具体经过，读懂原作与新作的改变；不把未选素材、对标人物名字、旧世界规则当作新作事实。纯原创事件可无参考。遵守已定事件顺序、作用与结果，补全合理的发生方式，遇到无法兼容的条件在 continuity 中列出待确认问题。不要只复述简短提纲。只输出指定 eventIds，每项使用真实事件 ID，纯 JSON：{"format":"story-v1","eventGroups":[{"id":"story-真实事件id","groupId":"真实大事件id","eventId":"真实小事件id","title":"小事件名称","participantIds":["本段实际参与的新作人物ID，必须包含大纲所定人物"],"story":"完整连贯的故事稿","continuity":"与前后事件的衔接、埋设与兑现、待确认问题"}]}。禁止 episodes 字段。`;

export {storySourceOptions,referenceKey,referenceIdentity,resolveStoryReferences} from './rewriteReferences.js';
export function rewriteStoryInput(project,target={}, {strict=false}={}) {
 const section=project.creator?.sections?.macroOutline;
 if(strict&&(!section?.accepted||section.stale&&!section.locked))throw new Error('请先确认采用新作大纲，再展开主线故事。');
 const outline=strict?validateRewriteOutline(section.output):readRewriteOutline(section?.output);
 const options=outlineEventOptions(outline),ids=target.eventIds||options.map(o=>o.eventId);
 if(strict&&(!ids.length||ids.some(id=>!options.some(o=>o.eventId===id))))throw new Error('要完善的小事件已变化，请重新选择。');
 const allSources=storySourceOptions(project),books=[project.creator?.source,...(project.creator?.references||[])].filter(Boolean);
 const chain=outline.groups.map(g=>({...g,events:g.events.map(e=>{
  const resolved=resolveStoryReferences(project,e);
  if(strict&&ids.includes(e.id)&&resolved.unresolved)throw new Error(`「${e.title}」的旧来源或引用已无法确认，请先核对参考事件，也可明确选择无参考。`);
  return {...e,references:resolved.references};
 })}));
 if(strict)assertRewriteIdentityReady(project,ids);
 const used=new Map();for(const g of chain)for(const e of g.events)for(const r of e.references){
  const source=allSources.find(o=>referenceKey(o)===referenceKey(r));if(!source)continue;
  const book=books.find(b=>b.id===r.sourceId);let mainline;try{mainline=readRewriteMainline(book.analysis?.outline);}catch{}
  const detail=mainline?.eventGroups.find(x=>x.eventId===r.eventId&&x.groupId===r.groupId);
  used.set(referenceKey(r),{...referenceIdentity(source),bookName:source.bookName,groupTitle:source.groupTitle,goal:source.goal,title:source.title,summary:source.summary,purpose:source.purpose,source:source.source,story:detail?.story||'',originalProgress:detail?.episodes||[]});
 }
 const constraints=Object.fromEntries(['settings','characters'].filter(k=>{const s=project.creator?.sections?.[k];return s?.accepted&&(!s.stale||s.locked);}).map(k=>[k,project.creator.sections[k].output]));
 const mainline=alignRewriteStory(project.creator?.sections?.outline?.output,outline);
 const identity=rewriteIdentity(project),sources=new Set([...used.values()].map(r=>r.sourceId)),canonicalIdentity={version:identity.version,revision:identity.revision,people:identity.people,relations:identity.relations,bindings:identity.bindings.filter(b=>sources.has(b.sourceId)),sourceActors:identity.sourceActors.filter(a=>sources.has(a.sourceId)).map(({evidence,...a})=>a)};
 return {constraints,...(project.creator.rewrite?.identity?{canonicalIdentity}:{}),chain,eventIds:ids,selectedReferences:[...used.values()],currentStories:mainline.eventGroups.filter(e=>e.story?.trim()).map(e=>({eventId:e.eventId,story:e.story,continuity:e.continuity||'',identityStatus:storyIdentityCurrent(project,e)?'current-draft':'needs-review',temporalScope:options.findIndex(o=>o.eventId===e.eventId)<Math.min(...ids.map(id=>options.findIndex(o=>o.eventId===id)))?'earlier':ids.includes(e.eventId)?'target':'future'})),legacyText:target.includeLegacy?rewriteMainlineText(mainline,outline):''};
}
export function prepareRewriteStoryProject(project,target) {
 const input=rewriteStoryInput(project,target,{strict:true});
 return {...project,episodes:[],creator:{...project.creator,source:null,references:[],chat:[],story:{events:[],characters:[]},sections:{outline:{input:`请依照完整资料展开指定事件。eventIds 是本次唯一输出范围。\n${JSON.stringify(input)}`,output:'',accepted:false}}}};
}
export function validateRewriteStory(raw,outline,eventIds) {
 const data=readRewriteMainline(raw),options=outlineEventOptions(outline),ids=new Set();
 if(!data.eventGroups.length)throw new Error('故事稿没有返回任何小事件，原始结果已留在历史。');
 for(const item of data.eventGroups){const option=options.find(o=>o.eventId===item.eventId);
  if(!option||ids.has(item.eventId)||eventIds&&!eventIds.includes(item.eventId))throw new Error('故事稿必须对应本次指定的大纲小事件，不能增加或重复其他事件。');
  if(!item.story?.trim()||item.episodes.length)throw new Error('主线需要完整故事稿，不包含逐集提纲；原始结果已留在历史。');
  item.groupId=option.groupId;item.title=option.title;ids.add(item.eventId);
 }
 if(eventIds&&eventIds.some(id=>!ids.has(id)))throw new Error('故事稿没有覆盖本次指定的全部小事件。');
 return {...data,format:'story-v1'};
}
export function mergeRewriteStory(previous,raw,outline,eventIds) {
 const prior=readRewriteMainline(previous),incoming=validateRewriteStory(raw,outline,eventIds),byId=new Map(incoming.eventGroups.map(e=>[e.eventId,e]));
 const eventGroups=prior.eventGroups.map(e=>byId.has(e.eventId)?{...e,...byId.get(e.eventId),legacyEpisodes:e.legacyEpisodes||e.episodes}:e);
 for(const item of incoming.eventGroups)if(!eventGroups.some(e=>e.eventId===item.eventId))eventGroups.push(item);
 return JSON.stringify(alignRewriteStory({...prior,format:'story-v1',eventGroups},outline));
}

// Keep removed events recoverable, but exclude them from the active story and downstream work.
export function alignRewriteStory(raw,outline) {
 const data=readRewriteMainline(raw),order=outlineEventOptions(outline).map(o=>o.eventId);
 const active=data.eventGroups.filter(e=>order.includes(e.eventId));
 const archived=[...(data.archivedEventGroups||[]),...data.eventGroups.filter(e=>!order.includes(e.eventId))];
 active.sort((a,b)=>order.indexOf(a.eventId)-order.indexOf(b.eventId));
 return {...data,eventGroups:active,...(archived.length?{archivedEventGroups:archived}:{})};
}

export function rewriteStoryContext(raw,outline) {
 const data=readRewriteMainline(raw);
 if(data.format!=='story-v1')return raw;
 return JSON.stringify({format:'story-v1',eventGroups:alignRewriteStory(data,outline).eventGroups.map(({id,groupId,eventId,title,story,continuity})=>({id,groupId,eventId,title,story,continuity}))});
}

export function stampStoryIdentity(project,data,eventIds){
 if(!project.creator.rewrite?.identity)return data;
 const identity=rewriteIdentity(project),outline=readRewriteOutline(project.creator.sections.macroOutline.output);
 return {...data,eventGroups:data.eventGroups.map(row=>{
  if(eventIds&&!eventIds.includes(row.eventId))return row;
  const g=outline.groups.find(g=>g.events.some(e=>e.id===row.eventId)),e=g?.events.find(e=>e.id===row.eventId);if(!e)throw new Error('故事人物校验的目标事件已移除。');
  const required=e.participantIds||[],ids=row.participantIds??(required.length?required:identity.people.map(p=>p.id));
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!identity.people.some(p=>p.id===id))||required.some(id=>!ids.includes(id)))throw new Error('故事参与者必须属于新作人物库，并保留事件已确定的人物。');
  return {...row,participantIds:[...ids],sourceActorRefs:e.sourceActorRefs||[],identityState:'story',identityRevision:identity.revision,identityFingerprint:conversionFingerprint(project,g,{...e,participantIds:ids})};
 })};
}
export function storyIdentityCurrent(project,row){
 if(!row?.story?.trim())return false;
 if(!project.creator.rewrite?.identity)return !project.creator.sections.outline?.stale;
 try{
  assertRewriteIdentityReady(project,[row.eventId]);assertCanonicalRewriteProse(project,row.story,[row.eventId]);
  const outline=readRewriteOutline(project.creator.sections.macroOutline.output),g=outline.groups.find(g=>g.events.some(e=>e.id===row.eventId)),e=g?.events.find(e=>e.id===row.eventId);
  return !!e&&row.identityState==='story'&&row.identityFingerprint===conversionFingerprint(project,g,{...e,participantIds:row.participantIds||e.participantIds||[]});
 }catch{return false;}
}
