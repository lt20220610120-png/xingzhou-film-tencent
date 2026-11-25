// Pure timing rules mirrored from core/promptDisplay.js; parity checked by recommendedDuration146 tests.
const {selectStoryboardTiming}=require('../shared/storyboard-timing.cjs');
const validDuration=value=>Number.isFinite(value)&&value>0&&value<=3600;
const estimateVersion='3.0.0';
const estimateVersions=new Set(['2.0.0',estimateVersion]);
const limitFor=value=>Number.isFinite(Number(value))&&Number(value)>0&&Number(value)<=15?15:30;
const singleLine=(value,max)=>typeof value==='string'&&value.length<=max&&Boolean(value.trim())&&!/[\r\n]/.test(value);
const breakdownFields=['speechSeconds','nonparallelActionSeconds','pauseBufferSeconds'];

function validatedDurationEstimate(value){
 if(!value||!estimateVersions.has(value.version)||![15,30].includes(value.maxDurationSeconds)||!['pending','needs-review','estimated'].includes(value.status))return null;
 const {version,status,maxDurationSeconds}=value;
 const base={version,status,maxDurationSeconds};
 if(status==='pending'||status==='needs-review'&&value.naturalSeconds===undefined){
  const {code,message}=value.error||{};
  return singleLine(code,64)&&singleLine(message,600)?{...base,error:{code,message}}:status==='needs-review'?base:null;
 }
 if(!Number.isInteger(value.naturalSeconds)||value.naturalSeconds<2||value.naturalSeconds>86400||!singleLine(value.reason,1200))return null;
 const {naturalSeconds,recommendedSeconds,needsResegment,capacityStatus,reason}=value;
 const cents=breakdownFields.map(key=>{
  const number=value.breakdown?.[key],rounded=Math.round(number*100);
  return Number.isFinite(number)&&number>=0&&number<=86400&&rounded/100===number?rounded:NaN;
 });
 const total=cents.reduce((sum,part)=>sum+part,0),natural=Math.ceil(total/100);
 const overload=natural>(maxDurationSeconds===15?18:35);
 if(naturalSeconds!==natural||cents[0]>0&&naturalSeconds<4||cents[2]<50
  ||needsResegment!==overload||recommendedSeconds!==(overload?natural:Math.min(natural,maxDurationSeconds))
  ||capacityStatus!==(overload?'超载需重分':natural>maxDurationSeconds?'略偏紧':'正常')
  ||overload&&!reason.includes('需重新划分片段并重新生成提示词'))return null;
 const breakdown=Object.fromEntries(breakdownFields.map(key=>[key,value.breakdown[key]]));
 return {...base,naturalSeconds,capacityStatus,recommendedSeconds,needsResegment,breakdown,reason};
}

function ownEstimate(value){
 if(!value||!Object.hasOwn(value,'durationEstimate'))return null;
 return validatedDurationEstimate(value.durationEstimate)||{version:estimateVersion,status:'pending',maxDurationSeconds:limitFor(value.durationEstimate?.maxDurationSeconds??value.maxDurationSeconds),error:{code:'INVALID_SAVED_ESTIMATE',message:'已保存的估时资料不完整，请重新估时。'}};
}

function recommendedPromptDuration(value){
 const estimate=ownEstimate(value);
 if(estimate)return estimate.status==='estimated'&&!estimate.needsResegment?estimate.recommendedSeconds:null;
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
function promptTimingMetadata(value){
 const estimate=ownEstimate(value),recommendedDurationSeconds=recommendedPromptDuration(value);
 if(recommendedDurationSeconds===null&&!estimate)return {};
 const timing=recommendedDurationSeconds===null?{}:{recommendedDurationSeconds};
 for(const key of ['maxDurationSeconds','estimatedSeconds','naturalEstimatedSeconds','editorialEstimatedSeconds','sceneEstimatedSeconds'])if(Number.isFinite(value?.[key])&&value[key]>=0&&value[key]<=86400)timing[key]=value[key];
 if(['estimated','needs-review'].includes(value?.durationStatus))timing.durationStatus=value.durationStatus;
 if(['auto','manual'].includes(value?.segmentationMode))timing.segmentationMode=value.segmentationMode;
 if(Number.isInteger(value?.timingRulesVersion)&&value.timingRulesVersion>0)timing.timingRulesVersion=value.timingRulesVersion;
 if(value?.durationCompression&&typeof value.durationCompression==='object'&&!Array.isArray(value.durationCompression))timing.durationCompression=structuredClone(value.durationCompression);
 if(estimate){
  timing.durationEstimate=estimate;
  timing.timingRulesVersion=2;
  timing.durationStatus=estimate.status;
  if(typeof value.durationSourceScript==='string'&&value.durationSourceScript.length<=250000)timing.durationSourceScript=value.durationSourceScript;
  if(typeof value.durationEstimatedAt==='string'&&value.durationEstimatedAt.length<=35&&Number.isFinite(Date.parse(value.durationEstimatedAt)))timing.durationEstimatedAt=value.durationEstimatedAt;
 }
 return timing;
}
function recommendedStoryboardTiming(binding,shot,episodeEntries){
 return selectStoryboardTiming(binding,shot,promptTimingMetadata,markStoryboardTimingStale,episodeEntries);
}

function markStoryboardTimingStale(value){
 const estimate=ownEstimate(value);
 if(estimate){
  if(estimate.status==='pending')return value;
  const stale={...value,durationEstimate:{...estimate,status:'needs-review'},durationStatus:'needs-review'};
  delete stale.recommendedDurationSeconds;
  return stale;
 }
 return recommendedPromptDuration(value)!==null?{...value,durationStatus:'needs-review'}:value;
}

module.exports={recommendedPromptDuration,promptTimingMetadata,recommendedStoryboardTiming,validatedDurationEstimate,markStoryboardTimingStale};
