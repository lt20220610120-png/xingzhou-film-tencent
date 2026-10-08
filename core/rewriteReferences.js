import {readRewriteOutline} from './rewriteOutline.js';
import {readRewriteMainline,outlineEventOptions} from './rewriteMainline.js';

export function storySourceOptions(project) {
 return [project.creator?.source,...(project.creator?.references||[])].filter(Boolean).flatMap(book=>{
  let outline;try{outline=readRewriteOutline(book.analysis?.macroOutline);}catch{return [];}
  return outline.groups.flatMap((g,i)=>g.events.map((e,j)=>({sourceId:book.id,groupId:g.id,eventId:e.id,bookName:book.name,groupTitle:g.title,goal:g.goal,...e,id:undefined,code:`${outlineEventOptions(outline).find(o=>o.eventId===e.id)?.code||`${i+1}-${j+1}`}`})));
 });
}
export const referenceKey = r => JSON.stringify([r.sourceId,r.groupId,r.eventId]);
export const referenceIdentity = r => ({sourceId:r.sourceId,groupId:r.groupId,eventId:r.eventId});
export function resolveStoryReferences(project,event) {
 const options=storySourceOptions(project),overrides=project.creator?.rewrite?.eventReferences||{};
 const explicit=Object.hasOwn(overrides,event.id)?overrides[event.id]:event.references;
 if(Array.isArray(explicit))return {references:explicit,unresolved:explicit.some(r=>!options.some(o=>referenceKey(o)===referenceKey(r)))};
 // Older outlines have prose provenance only. Never guess from an A1 label or reused ID.
 const matches=options.filter(o=>(o.title===event.title&&o.summary===event.summary&&o.purpose===event.purpose)||!!event.source&&event.source.includes(o.bookName)&&event.source.includes(o.title));
 return {references:matches.length===1?[referenceIdentity(matches[0])]:[],unresolved:!!event.source&&!/^(?:原创|新创作)/.test(event.source)&&matches.length!==1};
}
