import {readRewriteOutline,validateRewriteOutline} from './rewriteOutline.js';

export const REWRITE_WORLD_RULE=`大世界模拟：创作一个新的阶段式故事大纲候选，而不是拆书。将选中对标书的大事件及小事件作为素材库，先按用户意图重新排列、组合或细微改变大事件，再重新组织、改写或补充组内小事件，让人物动机、知情状态、时间顺序和前后因果成立。比如先相爱后相遇，可设计网恋到现实奔现，不能只交换名称而沿用矛盾过程。优先遵守新作已经确认的设定与人物；对标世界、人名和规则只是素材，不能覆盖新作事实。起点大纲可以改变，不是固定约束；旧主线、集纲、正文和未采用版本不是固定约束。不分配集数，不展开逐集场景对白。每个大事件写阶段目标、起点终点和转折；每个小事件写核心行动和它服务目标及衔接下一事件的作用。每组及每个小事件的 source 必须注明具体素材书、对应原事件、进行了保留/重排/改写，补充事件注明新创作与理由。检查相邻大事件及小事件的衔接，指出未解决矛盾，不虚称已解决。仅输出一个独立版本的纯 JSON：{"title":"新故事版本名称","changeSummary":"与素材/起点相比的排列与改写说明","constraintsCheck":"设定、人设、时间、知情及因果的核对结果和待确认问题","groups":[{"id":"new-group-1","title":"大事件名称","goal":"共同目标、起点终点与转折","source":"素材来源及改动","events":[{"id":"new-event-1","title":"小事件名称","summary":"核心行动","purpose":"作用、因果与衔接","source":"素材来源或新创作理由"}]}]}。所有 id 唯一。未经人工采用，候选不会成为正式新作。`;

export function rewriteWorldInput(project,target={}, {strict=false}={}) {
 const books=[project.creator?.source,...(project.creator?.references||[])].filter(Boolean);
 const ids=[...new Set(target.sourceIds||[])];
 if(strict&&!ids.length)throw new Error('请选择至少一本已拆解大纲的对标素材。');
 const sources=ids.map(id=>{
  const book=books.find(b=>b.id===id);
  if(strict&&!book?.analysis?.macroOutline)throw new Error('选中的对标尚未拆解大纲或已移除，请先拆解后再模拟。');
  if(strict)validateRewriteOutline(book.analysis.macroOutline);
  return {id,name:book?.name||'',outline:book?.analysis?.macroOutline||null};
 });
 const constraints=Object.fromEntries(['settings','characters'].filter(key=>{
  const section=project.creator?.sections?.[key];return section?.accepted&&(!section.stale||section.locked)&&section.output?.trim();
 }).map(key=>[key,{output:project.creator.sections[key].output,locked:!!project.creator.sections[key].locked}]));
 const baseId=target.baseVersionId||'current';
 const version=(project.creator?.rewrite?.outlineVersions||[]).find(v=>v.id===baseId);
 if(strict&&!['current','sources'].includes(baseId)&&!version)throw new Error('作为起点的大纲版本已移除。');
 return {constraints,sources,baseId,baseOutline:baseId==='sources'?'':baseId==='current'?project.creator?.sections?.macroOutline?.output||'':version?.output||''};
}

export function prepareRewriteWorldProject(project,target) {
 const input=rewriteWorldInput(project,target,{strict:true});
 return {...project,episodes:[],creator:{...project.creator,source:null,chat:[],story:{events:[],characters:[]},
  references:input.sources.map(s=>({id:s.id,name:`事件素材库：${s.name}（来源ID ${s.id}）`,enabled:true,content:JSON.stringify(readRewriteOutline(s.outline))})),
  sections:{...Object.fromEntries(Object.entries(input.constraints).map(([key,value])=>[key,{...value,accepted:true,input:''}])),
   macroOutline:{accepted:false,input:'起点大纲可重新排列和改写，未采用候选不是故事事实。',output:input.baseOutline}},
 }};
}

export function readWorldCandidate(raw) {
 let value=typeof raw==='object'?raw:undefined;
 if(typeof raw==='string'){
  const text=raw.trim(),candidates=[text,...Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi),m=>m[1]),text.slice(text.indexOf('{'),text.lastIndexOf('}')+1)];
  for(const candidate of candidates){try{value=JSON.parse(candidate);break;}catch{}}
 }
 if(!value)throw new Error('模拟结果的结构无法识别，原始输出已留在任务历史，可以重新模拟。');
 const outline=validateRewriteOutline(value);
 if(typeof value.changeSummary!=='string'||!value.changeSummary.trim()||typeof value.constraintsCheck!=='string'||!value.constraintsCheck.trim()||outline.groups.some(g=>!g.source.trim()||g.events.some(e=>!e.source.trim())))throw new Error('模拟版本需要改动说明、约束检查，以及每个事件的来源或新创作理由。原始输出已留在任务历史。');
 return {outline,title:typeof value.title==='string'&&value.title.trim()?value.title:'模拟新故事',changeSummary:value.changeSummary,constraintsCheck:value.constraintsCheck};
}

export const REWRITE_WORLD_REFERENCE_RULE='每个新作小事件额外输出 references 数组，精确记录实际参考的原事件：[{"sourceId":"素材库来源ID","groupId":"原大事件真实id","eventId":"原小事件真实id"}]。可关联多个书中事件；只用提供的真实ID，不使用 A1 等显示编号。纯原创使用空数组。保留 source 中文说明来源与改动。后续主线只读取这些关联事件，不会附上未选事件。';
