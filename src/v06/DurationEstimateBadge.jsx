import React from 'react';
import HoverInfo from './HoverInfo.jsx';
import {recommendedPromptDuration} from '../../core/promptDisplay.js';
import {normalizeVideoDurationLimit,savedDurationEstimate} from '../../core/videoDurationMetadata.js';
import './duration-estimate.css';

function estimateDetails(estimate) {
  const {speechSeconds,nonparallelActionSeconds,pauseBufferSeconds}=estimate.breakdown;
  return <div className="duration-estimate-detail">
    <b>自然演完 {estimate.naturalSeconds} 秒</b>
    <span>发声 {speechSeconds} 秒 ＋ 非并行动作 {nonparallelActionSeconds} 秒 ＋ 气口缓冲 {pauseBufferSeconds} 秒</span>
    <span>{estimate.reason}</span>
  </div>;
}

export function DurationEstimateBadge({value,onReestimate,disabled=false,busy=false,storyboard=false}) {
  const estimate=savedDurationEstimate(value);
  const stale=(estimate?.status??value?.durationStatus)==='needs-review';
  const pending=estimate?.status==='pending';
  const reestimate=label=>onReestimate&&<button type="button" className="ghost duration-estimate-action" onClick={onReestimate} disabled={disabled||busy}>{busy?'估时中…':label}</button>;
  if(pending||stale){
    const label=stale?'待复核':'待估时';
    const reason=stale?'提示词正文已修改，请重新核对时长。':estimate.error?.message;
    return <span className="duration-estimate-badges">
      <HoverInfo className="duration-estimate-tag duration-estimate-review" label={`${label}，查看原因`} content={reason}>{label}</HoverInfo>
      {reestimate(stale||storyboard?'重估时长':'补估')}
    </span>;
  }
  if(!estimate){
    const seconds=recommendedPromptDuration(value);
    if(seconds>normalizeVideoDurationLimit(value?.maxDurationSeconds))return <span className="duration-estimate-badges">
      <span className="duration-estimate-tag duration-estimate-historical">历史估时 {seconds} 秒</span>
      {onReestimate&&<button type="button" className="ghost duration-estimate-action" onClick={onReestimate} disabled={disabled||busy}>重估时长</button>}
    </span>;
    return seconds?<span className="prompt-duration">建议生成时长 {seconds} 秒</span>:null;
  }
  if(estimate.needsResegment){
    const label=`超载需重分 · 自然 ${estimate.naturalSeconds} 秒`;
    return <span className="duration-estimate-badges">
      <HoverInfo className="duration-estimate-tag duration-estimate-overload" label={`${label}，查看估时依据`} content={estimateDetails(estimate)}>{label}</HoverInfo>
      {storyboard&&reestimate('重估时长')}
    </span>;
  }
  const label=`建议生成时长 ${estimate.recommendedSeconds} 秒`;
  return <span className="duration-estimate-badges">
    <HoverInfo className="duration-estimate-tag duration-estimate-ready" label={`${label}，查看估时依据`} content={estimateDetails(estimate)}>{label}</HoverInfo>
    {estimate.capacityStatus==='略偏紧'&&<span className="duration-estimate-tag duration-estimate-tight">略紧 · 自然 {estimate.naturalSeconds} 秒</span>}
  </span>;
}

export default DurationEstimateBadge;
