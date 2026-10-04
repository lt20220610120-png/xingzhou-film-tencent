// Ranges use verbatim UTF-16 offsets. Chapter labels describe a story cut;
// they never expand the cut to whole chapters.
export function validateSourceRanges(ranges, source) {
 if (!Array.isArray(ranges) || !ranges.length) throw new Error('原文片段为空');
 let last=-1;
 return ranges.map(r=>{
  const {start,end}=r;
  const split=i=>i>0&&i<source.content.length&&/[\uD800-\uDBFF]/.test(source.content[i-1])&&/[\uDC00-\uDFFF]/.test(source.content[i]);
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>source.content.length||end<=start||start<last||split(start)||split(end))throw new Error('原文片段位置无效，请重新核对');
  last=end;return {start,end};
 });
}
export const rangeChapters=(ranges,source)=>source.chapters.filter(c=>ranges.some(r=>c.start<r.end&&c.end>r.start));
export function episodeSourceRanges(episode,source,version) {
 if(!source)return [];
 if(episode.type==='settings')return [{start:0,end:source.content.length}];
 const item=version||episode;
 if(item.sourceRanges?.length)return validateSourceRanges(item.sourceRanges,source);
 const ids=item.chapterIds||episode.chapterIds||[],chapters=source.chapters.filter(c=>ids.includes(c.id));
 // Earlier releases stored explicit story cuts in the outline. Read those
 // only when they lie within the chapter context saved with that version.
 const cut=String(item.outline??episode.outline??'').match(/原[创]?文\s*[\[【（(]\s*(\d+)\s*[,，—–-]\s*(\d+)\s*[)）\]】]/);
 if(cut){const start=Number(cut[1]),end=Number(cut[2]);if(end>start&&chapters.some(c=>c.start<=start&&start<c.end)&&chapters.some(c=>c.start<end&&end<=c.end))return validateSourceRanges([{start,end}],source);}
 return chapters.map(c=>({start:c.start,end:c.end}));
}
export function sourceRangeLabel(episode,source,version) {
 if(!source)return '未关联原文';
 if(episode.type==='settings')return '全书原文';
 const ranges=episodeSourceRanges(episode,source,version),chapters=rangeChapters(ranges,source);
 const short=c=>c.title.match(/第[零〇一二两三四五六七八九十百千万\d]+[章回节]|chapter\s+\d+/i)?.[0]||c.title;
 if(!chapters.length)return '未关联原文';
 const first=chapters[0],last=chapters.at(-1),partial=ranges[0].start!==first.start||ranges.at(-1).end!==last.end;
 return `${short(first)}${first.id!==last.id?'至'+short(last):''}${partial?' · 故事片段':''}`;
}
export function resolveSourceQuotes(items,source,contextRanges) {
 if(!Array.isArray(items)||!items.length)throw new Error('缺少原文定位');
 return validateSourceRanges(items.map(item=>{
  const startQuote=String(item.startQuote||''),endQuote=String(item.endQuote||'');
  if(startQuote.length<6||endQuote.length<6)throw new Error('原文定位句过短');
  const hits=[];
  const merged=[];for(const r of contextRanges){const last=merged.at(-1);if(last&&last.end===r.start)last.end=r.end;else merged.push({...r});}
  for(const r of merged){let pos=source.content.indexOf(startQuote,r.start);while(pos>=0&&pos<r.end){const end=source.content.indexOf(endQuote,pos);if(end>=0&&end+endQuote.length<=r.end)hits.push({start:pos,end:end+endQuote.length});pos=source.content.indexOf(startQuote,pos+1);}}
  // A provider may flatten line breaks in a quoted paragraph. Match only
  // whitespace differences, with a reversible offset map; never fuzzy-match
  // words, punctuation, character names or numbers.
  if(!hits.length)for(const r of merged){
   const positions=[];let text='';for(let i=r.start;i<r.end;i++)if(!/\s/.test(source.content[i])){text+=source.content[i];positions.push(i);}
   const first=startQuote.replace(/\s/g,''),last=endQuote.replace(/\s/g,'');
   if(first.length<6||last.length<6)throw new Error('原文定位句过短');
   let pos=text.indexOf(first);while(pos>=0){const end=text.indexOf(last,pos);if(end>=0)hits.push({start:positions[pos],end:positions[end+last.length-1]+1});pos=text.indexOf(first,pos+1);}
  }
  if(hits.length!==1)throw new Error('原文定位句无法唯一对应');
  return hits[0];
 }),source);
}
