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
const validDuration=value=>Number.isFinite(value)&&value>0&&value<=3600;
export function recommendedPromptDuration(value){
 if(validDuration(value?.recommendedDurationSeconds))return value.recommendedDurationSeconds;
 if(validDuration(value?.generationConfig?.recommendedDurationSeconds))return value.generationConfig.recommendedDurationSeconds;
 const texts=[value?.content,value?.prompt,value?.sourceContent].filter(text=>typeof text==='string'&&text.trim()).slice(0,1),found=new Set();
 for(const text of texts){
  for(const match of text.matchAll(/^[ \t]*(?:#{1,6}[ \t]*)?(?:行舟影视时长[：:]建议[=＝]|[【\[]?(?:建议(?:生成|视频)?时长|推荐(?:生成|视频)?时长|视频时长|生成时长|总时长|时长)[】\]]?[ \t]*[：:]?[ \t]*(?:\r?\n[ \t]*)?)(\d+(?:\.\d+)?)[ \t]*(?:秒|s)(?=[ \t]*(?:[】\]；;|｜]|\r?$))/gmi)){
   const seconds=Number(match[1]);if(validDuration(seconds))found.add(seconds);
  }
 }
 return found.size===1?[...found][0]:null;
}
export function promptTimingMetadata(value){
 const recommendedDurationSeconds=recommendedPromptDuration(value);if(recommendedDurationSeconds===null)return {};
 const timing={recommendedDurationSeconds};
 for(const key of ['maxDurationSeconds','estimatedSeconds','naturalEstimatedSeconds','editorialEstimatedSeconds','sceneEstimatedSeconds'])if(Number.isFinite(value?.[key])&&value[key]>=0&&value[key]<=86400)timing[key]=value[key];
 if(['estimated','needs-review'].includes(value?.durationStatus))timing.durationStatus=value.durationStatus;
 if(['auto','manual'].includes(value?.segmentationMode))timing.segmentationMode=value.segmentationMode;
 if(Number.isInteger(value?.timingRulesVersion)&&value.timingRulesVersion>0)timing.timingRulesVersion=value.timingRulesVersion;
 if(value?.durationCompression&&typeof value.durationCompression==='object'&&!Array.isArray(value.durationCompression))timing.durationCompression=structuredClone(value.durationCompression);
 return timing;
}
export function recommendedStoryboardTiming(binding,shot){
 const sourcePromptId=String(shot?.sourcePromptId||shot?.id||''),sourceContent=shot?.sourceContent??shot?.generationConfig?.bindingSourcePrompt??shot?.content??shot?.prompt;
 const direct=promptTimingMetadata(shot);if(direct.recommendedDurationSeconds)return {...direct,sourcePromptId,sourceContent};
 if(!sourcePromptId||typeof sourceContent!=='string'||!sourceContent.trim())return null;
 const snapshots=[binding?.currentSnapshot,binding?.snapshot,binding?.saved?.snapshot].filter(Boolean),entries=snapshots.flatMap(snapshot=>[...(snapshot.entries||[]),...(snapshot.promptEditions||[]).flatMap(edition=>edition.entries||[])]);
 const matching=entries.filter(entry=>String(entry.id)===sourcePromptId&&(entry.prompt??entry.content)===sourceContent),timings=matching.map(promptTimingMetadata).filter(timing=>timing.recommendedDurationSeconds);
 if(!timings.length||new Set(timings.map(timing=>timing.recommendedDurationSeconds)).size!==1)return null;
 return {...timings[0],sourcePromptId,sourceContent};
}
