import {recommendedPromptDuration,recommendedStoryboardTiming} from './promptDisplay.js';
import {normalizeVideoDurationLimit,savedDurationEstimate} from './videoDurationMetadata.js';

const integerSeconds = value => Number.isInteger(value) && value > 0 && value <= 3600;
const supportedOptions = values => [...new Set((values || []).filter(integerSeconds))].sort((a,b)=>a-b);

export const savedStoryboardTiming = (episode,shot) => ({...shot,...recommendedStoryboardTiming({snapshot:{entries:episode?.prompts||[]}},shot)});
export const storyboardRecommendationLimit = timing => savedDurationEstimate(timing)?.maxDurationSeconds??normalizeVideoDurationLimit(timing?.maxDurationSeconds);

export function storyboardDurationPolicy(model, caps, resolution) {
 const durations=supportedOptions(model.durationByResolution?.[resolution] || model.durations);
 const range=model.durationRange || caps.durationRange;
 return {supportedDurations:durations.length?durations:null,
  ...(!durations.length&&integerSeconds(range?.min)&&integerSeconds(range?.max)&&range.min<=range.max?{durationRange:{min:range.min,max:range.max}}:{})};
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

// An image alias may change when the same compiler-backed text is rebound.
// Only this narrow projection is ignored, and both versions must prove the
// same source; ordinary edits still invalidate the estimate.
const imageAlias='@(?:image|图片|图)[1-9]\\d*(?![\\w]|\\.[A-Za-z0-9])';
const referenceGroup='[ \\t]*参考[ \\t]*(?:@|'+imageAlias+'(?:[ \\t]*'+imageAlias+')*)[ \\t]*';
const imageBindings=new RegExp('（'+referenceGroup+'）|\\('+referenceGroup+'\\)|(?<![\\w.+-])[ \\t]?(?:'+imageAlias+')+','g');
function sameTimedProjection(before,previous,after,next){
 if(before===after)return true;
 if(typeof before!=='string'||typeof after!=='string')return false;
 const source=next?.bindingSourcePrompt??previous?.bindingSourcePrompt;
 if(typeof source!=='string'||!source.trim())return false;
 if(before===previous?.bindingCompiledPrompt&&previous.bindingSourcePrompt!==source)return false;
 const matches=(body,binding)=>body===source||body===binding?.bindingCompiledPrompt&&source===binding.bindingSourcePrompt;
 if(!matches(before,previous)||!matches(after,next))return false;
 const shared=source.replace(imageBindings,'');
 return before.replace(imageBindings,'')===shared&&after.replace(imageBindings,'')===shared;
}

export function storyboardTimingForDraft(timing, value, baseContent=timing?.content) {
 if(!timing)return {};
 const same=sameTimedProjection(baseContent,timing.generationConfig,value.prompt,value);
 if(same||typeof baseContent!=='string')return timing;
 if(timing.durationEstimate)return {...timing,durationEstimate:{...timing.durationEstimate,status:'needs-review'}};
 if(recommendedPromptDuration(timing)!==null)return {...timing,durationStatus:'needs-review'};
 return timing;
}

export function storyboardDurationSelection({value,timing=value,policy={},fallback}) {
 const issue=storyboardEstimateIssue(timing);
 const maximum=timing?.durationEstimate?.maxDurationSeconds || 3600;
 const requested=Number(value.duration);
 if(value.durationMode!=='recommended'){
  const manual=value.durationManuallyAdjusted===true;
  const duration=manual&&requested>0?requested:fallback;
  const unsupported=manual&&alignStoryboardDuration(duration,policy)!==duration;
  return {duration,issue:issue||(duration>maximum?`执行时长超过 ${maximum} 秒档上限，请调整设置`:unsupported?'手调时长超出当前模型支持档位，请调整秒数或更换模型':'')};
 }
 const recommended=recommendedPromptDuration(timing)??(!timing?.durationEstimate?recommendedPromptDuration(value):null);
 const alignment=value.durationAlignment==='ceil'||Boolean(timing?.durationEstimate);
 const duration=alignment?alignStoryboardDuration(recommended,policy,storyboardRecommendationLimit(timing)):requested===recommended&&fallback===recommended?recommended:null;
 const unavailable=!recommended?'本条缺少建议生成时长，请先核对导演提示词':`当前模型不支持建议时长 ${recommended} 秒，请更换模型或处理时长`;
 return {recommended,duration:duration??(requested>0?requested:fallback),aligned:duration!==null&&duration!==recommended,issue:issue||(duration===null?unavailable:'')};
}
