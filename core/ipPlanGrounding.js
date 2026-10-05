import { rangeChapters, resolveSourceQuotes, validateSourceRanges } from './ipSourceRanges.js';

const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const mismatch=(where,message)=>fail('IP_PLAN_SOURCE_MISMATCH',`${where}${message}`);
const withoutSpace=value=>String(value||'').replace(/\s/g,'');
const mergedRanges=ranges=>{
 const merged=[];
 for(const r of [...ranges].sort((a,b)=>a.start-b.start||a.end-b.end)){
  const last=merged.at(-1);
  if(last&&last.end>=r.start)last.end=Math.max(last.end,r.end);else merged.push({...r});
 }
 return merged;
};
const intersection=(left,right)=>mergedRanges(left.flatMap(a=>right.flatMap(b=>{
 const start=Math.max(a.start,b.start),end=Math.min(a.end,b.end);return end>start?[{start,end}]:[];
})));
const sameRanges=(a,b)=>a.length===b.length&&a.every((r,i)=>r.start===b[i].start&&r.end===b[i].end);
const numberFromTitle=value=>{
 const match=String(value).match(/(?:第\s*([零〇一二两三四五六七八九十百千万\d]+)\s*[章回节]|chapter\s+(\d+))/i);
 if(!match)return null;
 const token=match[1]||match[2];if(/^\d+$/.test(token))return Number(token);
 const digit={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9},unit={十:10,百:100,千:1000};
 let total=0,section=0,n=0;
 for(const c of token){if(c in digit)n=digit[c];else if(c==='万'){section+=n;total+=(section||1)*10000;section=0;n=0;}else if(c in unit){section+=(n||1)*unit[c];n=0;}else return null;}
 return total+section+n;
};
const outlineChapterNumbers=outline=>{
 const refs=[];
 // Only explicit source labels or a chapter label beginning a line describe
 // this episode. A later "下一集第42章…" is a hand-off, not a source claim.
 const pattern=/(?:^|\n)\s*(?:[【\[(]?\s*)第\s*([零〇一二两三四五六七八九十百千万\d]+)\s*[章回节]|(?:原文|来源)\s*第\s*([零〇一二两三四五六七八九十百千万\d]+)\s*[章回节]/g;
 for(const m of String(outline||'').matchAll(pattern)){
  const before=String(outline).slice(Math.max(0,m.index-24),m.index);
  if(m[2]&&/(?:下一集|下一批|后续|接点|预告)[^。；;\n]*$/.test(before))continue;
  const n=numberFromTitle(`第${m[1]||m[2]}章`);if(n!==null)refs.push(n);
 }
 return [...new Set(refs)];
};
const occurrences=(quote,source,ranges)=>{
 const normalized=withoutSpace(quote);let count=0;
 for(const r of ranges){
  const text=withoutSpace(source.content.slice(r.start,r.end));
  for(let at=text.indexOf(normalized);at>=0;at=text.indexOf(normalized,at+1))if(++count>1)return count;
 }
 return count;
};
const narrativeText=outline=>String(outline||'').split(/[。；;\n]/).filter(part=>{
 const text=part.trim();
 // Repeated generic editing instructions are not repeated story action.
 return text&&!/^(?:必留(?:项)?|删减(?:项)?|省略|承接|接点|下一集|下一批|原句起止|起止原句|起句|止句|不得(?:虚构|擅自|改写|遗漏)|禁止|(?:忠实)?保留(?:原著(?:对白|对话|动作|细节)|人物口吻|完整因果))/.test(text);
}).join('。').replace(/(?:原文|来源)?第[零〇一二两三四五六七八九十百千万\d]+[章回节]/g,'').replace(/[\s\p{P}\p{S}]/gu,'');
const repeatedNarrative=(outline,other)=>{
 const a=[...narrativeText(outline)],b=[...narrativeText(other)],size=30;
 if(a.length<size||b.length<size)return '';
 const parts=new Set();for(let i=0;i<=a.length-size;i++)parts.add(a.slice(i,i+size).join(''));
 for(let i=0;i<=b.length-size;i++){const part=b.slice(i,i+size).join('');if(parts.has(part))return part;}
 return '';
};

/** Ground each story cut in verbatim novel anchors. Never widen a failed cut. */
export function groundIPPlanEpisodes(plan,source,{previous=[],allowedRanges,requireAnchors=true,expectedCount}={}){
 if(!source||typeof source.content!=='string'||!Array.isArray(source.chapters))mismatch('分集规划','没有有效小说来源。');
 if(!Array.isArray(plan?.episodes)||!plan.episodes.length)mismatch('分集规划','为空。');
 if(expectedCount!==undefined&&plan.episodes.length!==expectedCount)mismatch('本批规划',`需要恰好 ${expectedCount} 集，实际返回 ${plan.episodes.length} 集。`);
 let allowed;
 try{allowed=allowedRanges===undefined?[{start:0,end:source.content.length}]:validateSourceRanges(allowedRanges,source);}catch(error){mismatch('本批规划',`允许的原文范围无效：${error.message}`);}
 allowed=mergedRanges(allowed);
 const known=new Map(source.chapters.map(c=>[c.id,c])),earlier=[...previous];
 const episodes=plan.episodes.map((episode,index)=>{
  const where=`第 ${previous.length+index+1} 集`;
  if(!episode||!Array.isArray(episode.chapterIds)||!episode.chapterIds.length||episode.chapterIds.some(id=>!known.has(id)))mismatch(where,'的 chapterIds 缺失或不在当前小说中。');
  const declared=new Set(episode.chapterIds),chapters=source.chapters.filter(c=>declared.has(c.id));
  const context=intersection(chapters.map(({start,end})=>({start,end})),allowed);
  if(!context.length)mismatch(where,'声明的章节不在本批允许的原文范围内。');
  const numbers=new Set(chapters.map(c=>numberFromTitle(c.title)).filter(n=>n!==null));
  for(const n of outlineChapterNumbers(episode.outline))if(!numbers.has(n))mismatch(where,`细纲明确引用小说第 ${n} 章，但 chapterIds 对应 ${chapters.map(c=>c.title).join('、')}。请按小说实际章号核实来源，不能用目录序号代替。`);
  let quotes,ranges;
  if(Array.isArray(episode.sourceQuotes)&&episode.sourceQuotes.length){
   quotes=episode.sourceQuotes.map((item,part)=>{
    const startQuote=String(item?.startQuote||''),endQuote=String(item?.endQuote||'');
    if([...withoutSpace(startQuote)].length<4||[...withoutSpace(endQuote)].length<4)fail('IP_PLAN_MISSING_ANCHOR',`${where}片段 ${part+1} 的起止原句各须至少 4 个非空白字符，且须在声明章节与允许范围内唯一定位；短的完整原句可直接逐字引用，重复原句须补充真实上下文。`);
    for(const [name,quote] of [['起句',startQuote],['止句',endQuote]]){
     const count=occurrences(quote,source,context);
     if(count!==1)mismatch(where,`片段 ${part+1} 的${name}${count?'在允许的原文范围内重复，不能唯一定位':'不在声明章节与本批范围内'}：${quote}。请提供更长的真实原句，不能猜测或扩大来源。`);
    }
    return {startQuote,endQuote};
   });
   try{ranges=resolveSourceQuotes(quotes,source,context,{minQuoteLength:4});}catch(error){mismatch(where,`起止原句无法形成按原文顺序排列的唯一故事片段：${error.message}`);}
  }else{
   if(requireAnchors)fail('IP_PLAN_MISSING_ANCHOR',`${where}缺少 sourceQuotes 起止原句；每个片段必须逐字引用至少 4 个非空白字符并能唯一定位，不能凭 chapterIds 猜测整章范围。`);
   quotes=[];
   if(!Array.isArray(episode.sourceRanges)||!episode.sourceRanges.length)mismatch(where,'未提供可核实的原句或明确原文范围。');
   try{ranges=validateSourceRanges(episode.sourceRanges,source);}catch(error){mismatch(where,`原文范围无效：${error.message}`);}
  }
  if(ranges.some(r=>!context.some(c=>c.start<=r.start&&r.end<=c.end)))mismatch(where,'起止片段超出了声明章节与本批允许范围。');
  if(episode.sourceRanges!==undefined){
   let numeric;try{numeric=validateSourceRanges(episode.sourceRanges,source);}catch(error){mismatch(where,`数字原文范围无效：${error.message}`);}
   if(!sameRanges(numeric,ranges))mismatch(where,`数字 sourceRanges ${JSON.stringify(numeric)} 与原句定位 ${JSON.stringify(ranges)} 不一致。请删除估算偏移，保留真实起止原句。`);
  }
  for(const [otherIndex,other] of earlier.entries()){
   let otherRanges=[];
   if(other.sourceRanges?.length)try{otherRanges=validateSourceRanges(other.sourceRanges,source);}catch{mismatch(`前文第 ${otherIndex+1} 集`,'保存的原文范围无效，不能绕过来源核实继续规划。');}
   if(!otherRanges.length)fail('IP_PLAN_MISSING_ANCHOR',`前文第 ${otherIndex+1} 集没有已核实的 sourceRanges，无法检查本集是否重复或倒退。请先核实前文起止原句。`);
   if(otherRanges.some(a=>ranges.some(b=>a.start<b.end&&b.start<a.end)))fail('IP_PLAN_SOURCE_OVERLAP',`${where}原文范围 ${JSON.stringify(ranges)} 与第 ${otherIndex+1} 集 ${JSON.stringify(otherRanges)} 重复覆盖，不能把同一场面再次分集。请在真实接点之后切分。`);
   if(otherRanges.length&&ranges[0].start<otherRanges.at(-1).end)fail('IP_PLAN_SOURCE_OVERLAP',`${where}从原文 ${ranges[0].start} 开始，倒退至第 ${otherIndex+1} 集终点 ${otherRanges.at(-1).end} 之前。请按小说因果顺序推进；可省略无关支线。`);
   const duplicate=repeatedNarrative(episode.outline,other.outline);
   if(duplicate)fail('IP_PLAN_SOURCE_OVERLAP',`${where}与第 ${otherIndex+1} 集重复安排同一段场面：“${duplicate}”。请核实实际章内切点并去除重复，不要重复前一集细纲。`);
  }
  const result={...episode,chapterIds:rangeChapters(ranges,source).map(c=>c.id),outline:String(episode.outline||''),sourceQuotes:quotes,sourceRanges:ranges};
  earlier.push(result);return result;
 });
 return {...plan,episodes};
}
