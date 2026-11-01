import {isFundingError} from './productionRecovery.js';
import {normalizeCapabilities} from './modelCapabilities.js';
import {resolveVideoModel} from './videoCatalog.js';
export const videoAttemptCount=value=>value===undefined?2:Number(value);
export const videoModelCapabilities=model=>model?normalizeCapabilities(resolveVideoModel(model,model.model)):{};
export const videoDurationChoices=(caps,resolution)=>{
 const allowed=caps.durationByResolution?.[resolution];
 return allowed?.length?(caps.durations?.length?allowed.filter(n=>caps.durations.includes(n)):allowed):caps.durations||[];
};
// Missing legacy values inherit only when supported. Explicit choices remain
// intact so preflight reports invalid settings instead of silently changing them.
export function videoParameterDefaults(c,caps={}){
 const choose=(value,options,fallback)=>options?.length?(options.includes(value)?value:options[0]):value??fallback;
 const videoResolution=choose(c.videoResolution,caps.resolutions,'480p');
 return {ratio:choose(c.ratio,caps.ratios,'9:16'),videoResolution,videoDuration:choose(Number(c.videoDuration??30),videoDurationChoices(caps,videoResolution),30),videoConcurrency:c.videoConcurrency??2};
}
export function videoFallbackConfig(c,step,caps={}){
 const defaults=videoParameterDefaults({...c,...(step.videoResolution!==undefined?{videoResolution:step.videoResolution}:{})},caps);
 return {...c,...defaults,...Object.fromEntries(['ratio','videoDuration','videoResolution','videoConcurrency'].filter(k=>step[k]!==undefined).map(k=>[k,step[k]])),videoModel:step.modelId,videoFallbackEnabled:false,videoFallbacks:[]};
}
// Absence means legacy single-backup configuration; an explicit [] means none.
export function videoFallbackSteps(c){
 if(Array.isArray(c.videoFallbacks))return c.videoFallbacks;
 return c.videoFallbackEnabled?[{modelId:c.fallbackVideoModel,attempts:c.fallbackVideoAttempts}]:[];
}
export function videoPolicyIssues(c,check=()=>[],capabilitiesFor=()=>({})){
 const issues=[],steps=videoFallbackSteps(c);if(c.videoFallbacks!==undefined&&!Array.isArray(c.videoFallbacks))issues.push('备用模型列表无效');
 for(const value of [c.videoAttempts,...steps.map(s=>s?.attempts)])if(!Number.isInteger(videoAttemptCount(value))||videoAttemptCount(value)<1||videoAttemptCount(value)>8)issues.push('视频尝试次数请选择 1–8 次（含首次）');
 for(const [i,step] of steps.entries()){
  if(typeof step?.modelId!=='string'||!step.modelId){issues.push(`请选择备用 ${i+1} 的视频模型`);continue;}
  const value=videoFallbackConfig(c,step,capabilitiesFor(step.modelId));
  if(!Number.isInteger(Number(value.videoConcurrency))||value.videoConcurrency<1||value.videoConcurrency>8)issues.push(`备用 ${i+1} 并发数量应在 1–8 之间`);
  if(!(Number(value.videoDuration)>0&&Number(value.videoDuration)<=3600))issues.push(`备用 ${i+1} 视频时长无效`);
  issues.push(...check(value).map(s=>`备用 ${i+1} 视频模型：`+s));
 }return issues;
}
export function videoAttemptChoices(c,models){
 const rows=[{modelId:c.videoModel,attempts:c.videoAttempts,key:'primary'},...videoFallbackSteps(c).map((s,i)=>({...s,key:'fallback:'+(s.id||i)}))];
 return rows.map((step,i)=>{const model=models.find(m=>m.id===step.modelId);if(!model)throw Error('所选视频模型配置不存在');return {...model,attempts:videoAttemptCount(step.attempts),videoPolicyKey:step.key,videoConfig:i?videoFallbackConfig(c,step,videoModelCapabilities(model)):c};});
}
export function nextVideoAttempt(c,history,models){
 if(history.some(j=>!['success','failed'].includes(j.status)))throw Error('原任务仍在生成、下载或提交未知，不能重新生成');
 const limits=new Map();
 for(const m of videoAttemptChoices(c,models)){const key=JSON.stringify([m.profileId,m.model]),limit=(limits.get(key)||0)+m.attempts;limits.set(key,limit);const failures=new Set(history.filter(j=>j.status==='failed'&&!isFundingError(j.error)&&(j.profileId===m.profileId&&j.model===m.model||!j.profileId&&m.id===c.videoModel)).map(j=>j.id));if(failures.size<limit)return m;}
 return null;
}
