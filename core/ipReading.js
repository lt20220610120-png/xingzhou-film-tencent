export const normalizeReadConcurrency=value=>Math.max(1,Math.min(8,Math.trunc(Number(value)||1)));

export const readingBoundary=(text,index)=>{const before=text.charCodeAt(index-1),after=text.charCodeAt(index);return before>=0xd800&&before<=0xdbff&&after>=0xdc00&&after<=0xdfff?index-1:index;};
// Reading is for selecting a story, so adjacent chapters share a request. A
// declared context limit is respected; unknown providers use a bounded input.
export function purposeReadingLimit(profile={},fixedMessages=[],outputTokens=8192){
 const declared=Number(profile.contextWindowTokens||profile.contextWindow||profile.maxContextTokens);
 const overhead=fixedMessages.reduce((n,m)=>n+Math.ceil(new TextEncoder().encode(String(m.content||'')).length/3)+8,0);
 const available=declared>0?Math.floor((declared-overhead-outputTokens-4096)/1.34):48000;
 return Math.max(0,Math.min(96000,available));
}
export function purposeReadingJobs(source,records=[],limit=48000){
 limit=Math.max(2,Math.trunc(Number(limit)||48000));
 const saved=records.filter(r=>r.sourceId===source.id&&Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end<=source.content.length&&r.end>r.start&&readingBoundary(source.content,r.start)===r.start&&readingBoundary(source.content,r.end)===r.end&&typeof r.note==='string'&&r.note.trim()).sort((a,b)=>a.start-b.start||b.end-a.end);
 const reused=[],jobs=[];let start=0;
 while(start<source.content.length){
  const prior=saved.filter(r=>r.start<=start&&r.end>start).sort((a,b)=>b.end-a.end)[0];
  if(prior){if(!reused.includes(prior))reused.push(prior);start=prior.end;continue;}
  const nextSaved=saved.find(r=>r.start>start)?.start??source.content.length;
  const ceiling=readingBoundary(source.content,Math.min(source.content.length,start+limit,nextSaved));
  const chapterEnd=source.chapters.filter(c=>c.end>start&&c.end<=ceiling).at(-1)?.end;
  const end=chapterEnd||ceiling;
  if(end<=start)throw new Error('小说阅读区间无法前进，请核对来源字符边界');
  const chapters=source.chapters.filter(c=>c.start<end&&c.end>start);
  const chapter={id:chapters.length===1?chapters[0].id:undefined,title:chapters.length===1?chapters[0].title:`${chapters[0]?.title} — ${chapters.at(-1)?.title}`,chapters};
  jobs.push({chapter,start,end});start=end;
 }
 return {reused,jobs};
}

const chineseNumber=value=>{
 if(/^\d+$/.test(value))return Number(value);
 const digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
 const units={十:10,百:100,千:1000,万:10000};let number=0,total=0;
 for(const c of value){if(c in digits)number=digits[c];else if(c in units){total+=(number||1)*units[c];number=0;}else return null;}
 return total+number;
};
export function sourceOpeningPolicy(source){
 const first=source.chapters.find(c=>/第[零〇一二两三四五六七八九十百千万\d]+[章回节]|chapter\s+\d+/i.test(c.title));
 const match=first?.title.match(/第([零〇一二两三四五六七八九十百千万\d]+)[章回节]|chapter\s+(\d+)/i),number=match?chineseNumber(match[1]||match[2]):null;
 return number===1?'材料含小说第1章：优先从第1章的原著故事开场；若确需后移，须说明具体原因。终点可选任一原著已有阶段收束，不必到材料末章。':`材料${number?`从小说第${number}章附近开始，属于中途素材`:'未能确认包含小说第1章'}：在整个素材库中选择适合独立剧本的开头和真实阶段结局，可跳过前段、改从新地点/新目标/新冲突或新星球的故事起点开始，不受文件首尾限制。`;
}

export function fitEpisodeBudget(segments,minimum){
 const total=segments.reduce((n,s)=>n+s.episodes,0),safety=minimum*4;
 if(total<=safety)return segments;
 // This is only a suggested retry budget: the caller must reject the original
 // story selection and ask for suitable source bounds, not silently compress
 // the same full library into these smaller counts.
 const target=Math.max(minimum,segments.length),remaining=target-segments.length;
 const weights=segments.map(s=>(s.episodes/total)*remaining),counts=weights.map(w=>1+Math.floor(w));
 let left=target-counts.reduce((n,c)=>n+c,0);
 for(const {i} of weights.map((w,i)=>({i,remainder:w-Math.floor(w)})).sort((a,b)=>b.remainder-a.remainder))if(left-->0)counts[i]++;
 return segments.map((s,i)=>({...s,episodes:counts[i]}));
}

// Drain in-flight work before rejecting: successful records remain resumable,
// and a failed pool cannot keep sending requests after its task has ended.
export async function runReadingPool(jobs,read,{concurrency=1,isCancelled=()=>false}={}){
 let cursor=0,failure;
 const worker=async()=>{
  while(!failure&&!isCancelled()&&cursor<jobs.length){
   const job=jobs[cursor++];
   try{await read(job);}catch(error){failure ||= error;}
  }
 };
 await Promise.all(Array.from({length:Math.min(jobs.length,normalizeReadConcurrency(concurrency))},worker));
 if(failure)throw failure;
 if(isCancelled())throw Object.assign(new Error('任务已停止，已保存的阅读记录可继续使用'),{name:'AbortError'});
}
