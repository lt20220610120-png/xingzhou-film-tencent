import {numberedReferences} from './generationReferences.js';
export function promptDisplayParts(value,references){
 const text=String(value||''),known=new Map(numberedReferences(references||[]).map(r=>[r.alias,r])),parts=[];let end=0;
 for(const match of text.matchAll(/@(image|audio|video)[1-9]\d*/g)){
  const start=match.index,finish=start+match[0].length;
  if(/[a-z\d._+\-]/i.test(text[start-1]||'')||/[a-z\d_]/i.test(text[finish]||'')||!known.has(match[0]))continue;
  if(start>end)parts.push({text:text.slice(end,start)});parts.push({text:match[0],reference:known.get(match[0])});end=finish;
 }
 if(end<text.length||!parts.length)parts.push({text:text.slice(end)});return parts;
}
export const recommendedPromptDuration=value=>Number.isInteger(value?.recommendedDurationSeconds)&&value.recommendedDurationSeconds>0&&value.recommendedDurationSeconds<=3600?value.recommendedDurationSeconds:null;
