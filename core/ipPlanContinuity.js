// Omitted branch evidence is bounded; selected source remains verbatim.
import {ipHash,isIPModelRefusal,parseIPJson} from './ipWorkspace.js';
import {validateSourceRanges,resolveSourceQuotes} from './ipSourceRanges.js';

const boundary=(text,i)=>i>0&&i<text.length&&/[\uD800-\uDBFF]/.test(text[i-1])&&/[\uDC00-\uDFFF]/.test(text[i])?i-1:i;
const validNotes=(source,reading,start,end)=>reading.filter(r=>r.sourceId===source.id&&Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end<=source.content.length&&r.end>r.start&&r.start<end&&r.end>start&&typeof r.note==='string'&&r.note.trim()&&!isIPModelRefusal(r.note)).sort((a,b)=>a.start-b.start||b.end-a.end);
const covered=(notes,start,end)=>{
 let cursor=start;
 for(const note of notes){if(note.start>cursor)return false;cursor=Math.max(cursor,note.end);if(cursor>=end)return true;}
 return cursor>=end;
};
const chunks=(source,start,end,limit)=>{
 const result=[];
 for(let cursor=start;cursor<end;){let stop=boundary(source.content,Math.min(end,cursor+limit));if(stop<=cursor)throw new Error('省略区间不能安全分块');result.push({start:cursor,end:stop});cursor=stop;}
 return result;
};

/** Keep current-window and prior-episode source verbatim; bound only omitted gaps. */
export function prepareIPPlanContinuityEvidence({source,previous=[],group,window,reading=[],rawGapLimit=12000,noteLimit=9000,edgeCharacters=800}){
 if(!Number.isInteger(rawGapLimit)||rawGapLimit<128||!Number.isInteger(noteLimit)||noteLimit<128||!Number.isInteger(edgeCharacters)||edgeCharacters<1)throw new Error('省略区间证据容量配置无效');
 const current=validateSourceRanges([{start:window.start,end:window.end}],source)[0];
 const prior=previous.at(-1),priorRange=prior?.sourceRanges?.length?validateSourceRanges(prior.sourceRanges,source).at(-1):null;
 const selected=group?validateSourceRanges(group.episodes.flatMap(e=>e.sourceRanges||[]),source):[current];
 if(selected.some(r=>r.start<current.start||r.end>current.end))throw new Error('因果审核候选原文超出当前窗口');
 if(priorRange&&priorRange.end>selected[0].start)throw new Error('因果审核候选倒退至前集原文');
 const gaps=[];let cursor=priorRange?.end??selected[0].start;
 for(const range of selected){if(range.start>cursor)gaps.push({start:cursor,end:range.start});cursor=range.end;}
 const gap=gaps.length?{start:gaps[0].start,end:gaps.at(-1).end}:null;
 const base={current,priorRange,priorText:priorRange?source.content.slice(priorRange.start,priorRange.end):'',currentText:source.content.slice(current.start,current.end),gap,gaps};
 const rawLabel=range=>`【省略原文[${range.start},${range.end})】\n${source.content.slice(range.start,range.end)}`;
 if(!gaps.length)return {...base,mode:'no-gap',gapText:'',noteRows:[],readingCoversGap:true};
 if(gaps.reduce((n,r)=>n+r.end-r.start,0)<=rawGapLimit)return {...base,mode:'raw-gap',gapText:gaps.map(rawLabel).join('\n'),noteRows:[],readingCoversGap:true};
 const noteRows=validNotes(source,reading,gap.start,gap.end).filter(r=>gaps.some(g=>r.start<g.end&&r.end>g.start)).map(({start,end,note})=>({start,end,note}));
 const edgeSize=Math.max(1,Math.floor(edgeCharacters/gaps.length));
 const edgeRanges=gaps.flatMap(g=>[{start:g.start,end:boundary(source.content,Math.min(g.end,g.start+edgeSize))},{start:boundary(source.content,Math.max(g.start,g.end-edgeSize)),end:g.end}]);
 return {...base,mode:'indexed-gap',gapText:edgeRanges.map(rawLabel).join('\n'),noteRows,readingCoversGap:gaps.every(g=>covered(noteRows,g.start,g.end)),notesFit:JSON.stringify(noteRows).length<=noteLimit,rawChecks:gaps.flatMap(g=>chunks(source,g.start,g.end,rawGapLimit))};
}

const factsValid=facts=>typeof facts==='string'&&!!facts.trim()&&!isIPModelRefusal(facts);
const evidenceValid=(evidence,notes,gaps)=>{
 if(!Array.isArray(evidence)||!evidence.length||!evidence.every(e=>typeof e.quote==='string'&&e.quote.replace(/\s/g,'').length>=4&&notes.some(r=>r.start===e.start&&r.end===e.end&&r.note.includes(e.quote))))return false;
 const cited=notes.filter(r=>evidence.some(e=>e.start===r.start&&e.end===r.end));
 return gaps.every(g=>covered(cited,g.start,g.end));
};
const unresolved=message=>Object.assign(new Error(message),{code:'IP_PLAN_GAP_UNRESOLVED'});
const resultJSON=raw=>{try{return parseIPJson(raw);}catch(error){throw unresolved(`省略区间核实没有有效结构：${error.message}`);}};

/**
 * Return omitted-gap facts, never a continuity pass. The final causal audit
 * still receives the exact candidate/prior episode/current window and decides.
 * invoke({stage,prompt,maxOutputTokens}) is supplied by ipAi, preserving normal
 * request envelopes, cancellation and diagnostics. No silent or bare-ok pass.
 */
export async function resolveIPPlanOmittedEvidence({source,evidence,goal='',invoke,diagnostics=[],onDraft=()=>{}}){
 if(evidence.mode!=='indexed-gap')return {mode:evidence.mode,content:evidence.gapText,verified:true};
 const scope=ipHash(JSON.stringify({schema:'ip-gap-facts-v2',sourceId:source.id,sourceHash:ipHash(source.content),goal,gaps:evidence.gaps}));
 const old=diagnostics.findLast(d=>d.type==='plan-gap-facts'&&d.key===scope&&d.sourceId===source.id&&d.complete===true&&factsValid(d.content));
 if(old)return {mode:'verified-gap-index',content:old.content,verified:true};
 if(evidence.readingCoversGap&&evidence.notesFit){
  const prompt=`只核对以下省略区间是否已有足够事实供后续审稿。不要重新规划，不判整批分集通过。需要明确哪些原著事件建立了当前主线必需的身份、关系、知情、治疗或地点转换，哪些是无关支线；不确定时要求回查，不猜前因。\n主线审核目的：${goal}\n全部省略区间：${JSON.stringify(evidence.gaps)}。\n有效阅读索引（覆盖每个省略区间全部字符）：${JSON.stringify(evidence.noteRows)}\n${evidence.gapText}\n返回JSON {"sufficient":true,"facts":"逐区间必要前因与省略依据，至多1200字","evidence":[{"start":0,"end":0,"quote":"逐字引用对应阅读索引原句"}]}；若任一区间索引不足则 {"sufficient":false,"facts":"具体区间和尚待核实的问题","evidence":[]}。必须核对全部省略区间，只有证据确实支持才说足够。`;
  const raw=await invoke({stage:'gap-index',prompt,maxOutputTokens:2048});
  await onDraft({type:'plan-gap-assessment',sourceId:source.id,content:raw});
  const result=resultJSON(raw);
  if(result.sufficient===true&&factsValid(result.facts)&&result.facts.length<=1800&&evidenceValid(result.evidence,evidence.noteRows,evidence.gaps)){
   const record={type:'plan-gap-facts',key:scope,sourceId:source.id,content:result.facts,complete:true,readingEvidence:result.evidence,gap:evidence.gap};await onDraft(record);
   return {mode:'verified-gap-index',content:result.facts,verified:true};
  }
  // Insufficient/unsupported notes do not become a successful checkpoint.
 }
 const pieces=[];
 for(const range of evidence.rawChecks){
  const key=ipHash(JSON.stringify({schema:'ip-gap-read-v1',sourceId:source.id,sourceHash:ipHash(source.content),goal,range}));
  const cached=diagnostics.findLast(d=>d.type==='plan-gap-read'&&d.key===key&&d.sourceId===source.id&&d.complete===true&&factsValid(d.content));
  if(cached){pieces.push({range,facts:cached.content});continue;}
  const prompt=`带着主线目的核实这一小块省略原文，识别决定后续行动的实际前因（身份、关系、知情、治疗、地点与时间变化）。指出无关支线，材料没有写的前因保持未决。不写正文、不重做整部规划，也不宣称分集审稿通过。\n审核目的：${goal}\n实际原文[${range.start},${range.end})：\n${source.content.slice(range.start,range.end)}\n返回JSON {"complete":true,"facts":"本块必要前因与无关支线，至多600字","sourceQuotes":[{"startQuote":"本块真实原句至少4字且唯一","endQuote":"本块真实结束原句至少4字且唯一"}]}。`;
  const raw=await invoke({stage:`gap-read-${range.start}-${range.end}`,prompt,maxOutputTokens:2048});
  await onDraft({type:'plan-gap-read-result',sourceId:source.id,content:raw,range});
  const result=resultJSON(raw);
  if(result.complete!==true||!factsValid(result.facts)||result.facts.length>1000)throw Object.assign(new Error('省略区间核实未返回完整且有界的事实，不能作为完成审核'),{code:'IP_PLAN_GAP_UNRESOLVED'});
  let sourceRanges;try{sourceRanges=resolveSourceQuotes(result.sourceQuotes,source,[range],{minQuoteLength:4});}catch(error){throw unresolved(`省略区间核实原句没有唯一真实来源：${error.message}`);}
  const record={type:'plan-gap-read',key,sourceId:source.id,content:result.facts,complete:true,range,sourceRanges,sourceQuotes:result.sourceQuotes};await onDraft(record);
  pieces.push({range,facts:result.facts});
 }
 let content=pieces.map(p=>`【已核实省略片段[${p.range.start},${p.range.end})】${p.facts}`).join('\n');
 let merge=0;
 while(content.length>9000){
  // Even a library containing thousands of skipped chapters is synthesized
  // through bounded evidence requests; no raw or fact tail is discarded.
  const before=content.length,groups=chunks({content},0,content.length,7000),next=[];
  for(const [index,range] of groups.entries()){
   const raw=await invoke({stage:`gap-merge-${merge}-${index}`,maxOutputTokens:3072,prompt:`只把下列全部已核实事实合并为不超过1800字的省略区间索引。保留主线必需前因和未决项，不添加新事实，不宣称分集通过。审核目的：${goal}\n${content.slice(range.start,range.end)}\n返回JSON {"facts":"所有必要前因、无关支线与未决项的紧凑索引"}。`});
   await onDraft({type:'plan-gap-merge-result',sourceId:source.id,content:raw});const result=resultJSON(raw);
   if(!factsValid(result.facts)||result.facts.length>2400)throw unresolved('省略区间核实事实未收敛，检查点保留但不能继续审核');
   next.push(result.facts);
  }
  content=next.join('\n');if(content.length>=before)throw unresolved('省略区间证据没有缩短，不能继续审核');merge++;
 }
 const record={type:'plan-gap-facts',key:scope,sourceId:source.id,content,complete:true,gap:evidence.gap,rawVerified:true};await onDraft(record);
 return {mode:'verified-gap-raw',content,verified:true};
}
