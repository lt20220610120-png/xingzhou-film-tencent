// Fictional source fixtures for source-grounded planner tests. No model calls.
export function withGroundedScenes(content){
 let number=0;
 const line=()=>`素材场面${String(++number).padStart(6,'0')}甲依原著通知核实线索并逐步完成眼前任务。`;
 const chapters=String(content).split(/(?=^第[零〇一二两三四五六七八九十百千万\d]+章[^\n]*$)/m);
 return chapters.map(text=>{
  if(!text)return '';
  const parts=[];for(let i=0;i<text.length;i+=700)parts.push(text.slice(i,i+700)+'\n'+line()+'\n');
  for(let i=0;i<100;i++)parts.push(line()+'\n');
  return parts.join('');
 }).join('');
}
export function groundedEpisodes(source,count,{start=0,end=source.content.length,after=-1,label='真实来源场面'}={}){
 const rows=[...source.content.slice(start,end).matchAll(/素材场面\d{6}[^\n]+/g)].map(m=>({text:m[0],start:start+m.index,end:start+m.index+m[0].length})).filter(row=>row.start>=after);
 if(rows.length<count)throw new Error(`Fiction source has ${rows.length} unique scenes for ${count} cuts`);
 return rows.slice(0,count).map(row=>({chapterIds:source.chapters.filter(c=>c.start<row.end&&c.end>row.start).map(c=>c.id),outline:`${label} ${row.text.match(/\d{6}/)[0]}，角色依本段实际动作继续推进`,sourceQuotes:[{startQuote:row.text,endQuote:row.text}]}));
}
export function groundedGroup(source,request,label){
 const text=request.messages.at(-1).content,count=Number(text.match(/本次只规划 (\d+) 集/)[1]),window=text.match(/完整原文窗口\[(\d+),(\d+)\)/),previous=JSON.parse(text.match(/已安排前文接点：([^\n]+)/)[1]);
 return {episodes:groundedEpisodes(source,count,{start:Number(window[1]),end:Number(window[2]),after:previous.at(-1)?.sourceRanges?.at(-1)?.end??-1,label})};
}
export const continuityReply=()=>JSON.stringify({ok:true,issues:[]});
