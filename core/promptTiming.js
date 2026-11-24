import {effectiveDirectorDurationLimit,normalizeDirectorDurationSelection} from './directorDurationPolicy.js';
import {recommendedPromptDuration} from './promptDisplay.js';
import {VIDEO_DURATION_ESTIMATOR_VERSION,normalizeVideoDurationLimit,pendingDurationEstimate,savedDurationEstimate,validatedDurationEstimate} from './videoDurationMetadata.js';

const validSeconds = (value) => Number.isInteger(value) && value >= 1;
const validTiming = (prompt) => validSeconds(prompt?.recommendedDurationSeconds)
  && normalizeDirectorDurationSelection(prompt.maxDurationSeconds, null) !== null
  && prompt.recommendedDurationSeconds <= effectiveDirectorDurationLimit(prompt.maxDurationSeconds)
  && ['estimated', 'needs-review'].includes(prompt.durationStatus);

export function markPromptTimingStale(prompt,{previous=prompt}={}) {
  const estimate=savedDurationEstimate(prompt);
  if(estimate){
    const {recommendedDurationSeconds,...saved}=prompt;
    return {...saved,durationStatus:'needs-review',durationEstimate:{...estimate,status:'needs-review'}};
  }
  if(prompt?.segmentationMode==='auto'&&validTiming(prompt))return {...prompt,durationStatus:'needs-review'};
  if(/^\d+-\d+-\d+$/.test(prompt?.label||'')&&recommendedPromptDuration(previous)!==null){
    return {...prompt,durationStatus:'needs-review',durationEstimate:{version:VIDEO_DURATION_ESTIMATOR_VERSION,status:'needs-review',maxDurationSeconds:normalizeVideoDurationLimit(prompt.maxDurationSeconds)}};
  }
  return prompt;
}

export function formatPromptTimingMetadata(prompt) {
  const estimate=savedDurationEstimate(prompt);
  // Bracketed numbering remains reserved for real prompt headings in exports.
  if(estimate)return `行舟影视精准估时：${JSON.stringify(estimate).replace(/[\[\]【】]/g,mark=>`\\u${mark.charCodeAt(0).toString(16).padStart(4,'0')}`)}`;
  if (prompt?.segmentationMode !== 'auto' || !validTiming(prompt)) return '';
  return `行舟影视时长：建议=${prompt.recommendedDurationSeconds}秒；上限=${prompt.maxDurationSeconds}秒；状态=${prompt.durationStatus === 'needs-review' ? '待复核' : '估算'}`;
}

// Only an application's first standalone row is structural. Identical prose later
// in a Skill output must remain prose, and malformed metadata must remain visible.
export function extractPromptTimingMetadata(value) {
  const text = String(value ?? '');
  const precise=text.match(/^(?:[ \t]*(?:\r\n|\n|\r))*行舟影视精准估时：([^\r\n]*)(?=\r\n|\n|\r|$)/);
  if(precise){
    let estimate;
    try{estimate=validatedDurationEstimate(JSON.parse(precise[1]));}catch{}
    if(!estimate)return {text,timing:{durationEstimate:pendingDurationEstimate(30,'INVALID_SAVED_ESTIMATE','导入的估时资料不完整，请重新估时。'),durationStatus:'pending',timingRulesVersion:2}};
    const timing={durationEstimate:estimate,timingRulesVersion:2,durationStatus:estimate.status,maxDurationSeconds:estimate.maxDurationSeconds};
    if(estimate.status==='estimated'&&!estimate.needsResegment)timing.recommendedDurationSeconds=estimate.recommendedSeconds;
    return {text:text.slice(0,precise[0].indexOf('行舟影视精准估时：'))+text.slice(precise[0].length).replace(/^(?:\r\n|\n|\r)/,''),timing};
  }
  const match = text.match(/^(?:[ \t]*(?:\r\n|\n|\r))*行舟影视时长：建议=(\d+)秒；上限=(\d+)秒；状态=(估算|待复核)(?=\r\n|\n|\r|$)/);
  if (!match) return { text };
  const timing = {
    segmentationMode: 'auto', recommendedDurationSeconds: Number(match[1]),
    maxDurationSeconds: Number(match[2]), durationStatus: match[3] === '待复核' ? 'needs-review' : 'estimated',
    timingRulesVersion: 1,
  };
  if (!validTiming(timing)) return { text };
  const rowStart = match[0].lastIndexOf('行舟影视时长：');
  const suffix = text.slice(match[0].length).replace(/^(?:\r\n|\n|\r)/, '');
  return { text: text.slice(0, rowStart) + suffix, timing };
}
