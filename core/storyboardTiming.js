import {recommendedPromptDuration,recommendedStoryboardTiming} from './promptDisplay.js';
import {normalizeVideoDurationLimit,savedDurationEstimate} from './videoDurationMetadata.js';
import {sameStoryboardTimingText} from './storyboardTimingSource.js';
export {sameStoryboardTimingText} from './storyboardTimingSource.js';

const integerSeconds = value => Number.isInteger(value) && value > 0 && value <= 3600;
const supportedOptions = values => [...new Set((values || []).filter(integerSeconds))].sort((a,b)=>a-b);

export function savedStoryboardTiming(episode,shot,binding) {
 const timing=recommendedStoryboardTiming(binding,shot,episode?.prompts);
 return {...shot,...timing};
}
export const storyboardRecommendationLimit = timing => savedDurationEstimate(timing)?.maxDurationSeconds??normalizeVideoDurationLimit(timing?.maxDurationSeconds);

export function storyboardDurationPolicy(model, caps, resolution) {
 const durations=supportedOptions(model.durationByResolution?.[resolution] || model.durations);
 const range=model.durationRange || caps.durationRange;
 return {supportedDurations:durations.length?durations:null,
  ...(!durations.length&&integerSeconds(range?.min)&&integerSeconds(range?.max)&&range.min<=range.max?{durationRange:{min:range.min,max:range.max}}:{})};
}

export function storyboardDurationMode(value) {
 if(value.durationMode==='recommended')return 'recommended';
 if(value.durationMode==='uniform'||value.durationManuallyAdjusted===true)return 'uniform';
 return value.durationAlignment==='ceil'?'recommended':'legacy';
}

export function alignStoryboardDuration(recommended, {supportedDurations,durationRange}={}, maximum=3600) {
 if(!Number.isFinite(recommended)||recommended<=0||recommended>maximum)return null;
 const options=supportedOptions(supportedDurations);
 const seconds=options.length?options.find(value=>value>=recommended):Math.max(Math.ceil(recommended),durationRange?.min||1);
 return seconds!==undefined&&seconds<=Math.min(maximum,durationRange?.max||3600)?seconds:null;
}

export function storyboardEstimateIssue(timing) {
 const estimate=savedDurationEstimate(timing);
 if(!estimate)return timing?.durationStatus==='needs-review'?'原建议时长待复核，请先重估时长':'';
 if(estimate.status==='needs-review')return '建议时长待复核，请先重估时长';
 if(estimate.status!=='estimated')return `本条待估时${estimate.error?.message?' · '+estimate.error.message:''}`;
 if(estimate.needsResegment||estimate.capacityStatus==='超载需重分')return `超载需重分 · 自然 ${estimate.naturalSeconds} 秒`;
 return '';
}

export function storyboardTimingForDraft(timing, value, baseContent=timing?.content) {
 if(!timing)return {};
 const same=sameStoryboardTimingText(baseContent,timing.generationConfig,value.prompt,value);
 if(same||typeof baseContent!=='string')return timing;
 if(timing.durationEstimate)return {...timing,durationEstimate:{...timing.durationEstimate,status:'needs-review'}};
 if(recommendedPromptDuration(timing)!==null)return {...timing,durationStatus:'needs-review'};
 return timing;
}

export function storyboardDurationSelection({value,timing=value,policy={},fallback}) {
 const requested=Number(value.duration);
 const mode=storyboardDurationMode(value);
 if(mode==='uniform'){
  const label=value.durationManuallyAdjusted===true?'手调时长':'固定时长';
  const valid=integerSeconds(requested)&&alignStoryboardDuration(requested,policy)===requested;
  return {duration:Number.isFinite(requested)?requested:undefined,issue:valid?'':`${label}不符合当前模型支持的秒数，请调整秒数或更换模型`};
 }
 const issue=storyboardEstimateIssue(timing);
 const estimate=savedDurationEstimate(timing);
 if(mode==='legacy'){
  const maximum=estimate?.maxDurationSeconds??3600;
  return {duration:fallback,issue:issue||(fallback>maximum?`执行时长超过 ${maximum} 秒档上限，请调整设置`:'')};
 }
 const recommended=recommendedPromptDuration(timing)??(!timing?.durationEstimate?recommendedPromptDuration(value):null);
 const alignment=value.durationAlignment==='ceil'||Boolean(estimate);
 const duration=alignment?alignStoryboardDuration(recommended,policy,storyboardRecommendationLimit(timing))
  :requested===recommended&&fallback===recommended&&alignStoryboardDuration(recommended,policy)===recommended?recommended:null;
 const unavailable=!recommended?'本条缺少建议生成时长，请先核对导演提示词':`当前模型不支持建议时长 ${recommended} 秒，请更换模型或处理时长`;
 return {recommended,duration:duration??(requested>0?requested:fallback),aligned:duration!==null&&duration!==recommended,issue:issue||(duration===null?unavailable:'')};
}
