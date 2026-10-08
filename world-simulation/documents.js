export function chunkDocument({id,name,content,visibility='author',knownBy=[],at=0},size=2048){
 if(typeof content!=='string'||content.length>12000000||!id||!name||!Number.isInteger(size)||size<128)throw new Error('原文内容或分块配置无效');
 const chunks=[];for(let start=0;start<content.length;start+=size)chunks.push({start,end:Math.min(content.length,start+size)});
 return {id,name,content,visibility,knownBy,at,chunks};
}
export function retrieveEvidence(world,query='',{actorId,maxChars=8000,time=Infinity}={}){
 const terms=[...new Set(String(query).split(/[\s，。；、,;]+/).filter(t=>t.length>1))].slice(0,20),scored=[];
 for(const d of world.documents||[]){if(d.at>time||actorId&&d.visibility!=='public'&&!d.knownBy?.includes(actorId))continue;
  for(const c of d.chunks||[]){const text=d.content.slice(c.start,c.end),score=terms.reduce((n,t)=>n+(text.includes(t)?1:0),0);if(score||!terms.length)scored.push({documentId:d.id,name:d.name,start:c.start,end:c.end,text,score});}
 }
 scored.sort((a,b)=>b.score-a.score);const result=[];let remaining=Math.min(16000,Math.max(0,maxChars));for(const c of scored){if(remaining<=0)break;const text=c.text.slice(0,remaining);result.push({...c,text,end:c.start+text.length});remaining-=text.length;}return result;
}
