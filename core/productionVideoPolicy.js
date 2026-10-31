import {isFundingError} from './productionRecovery.js';
export const videoAttemptCount=value=>value===undefined?2:Number(value);
// Absence means legacy single-backup configuration; an explicit [] means none.
export function videoFallbackSteps(c){
 if(Array.isArray(c.videoFallbacks))return c.videoFallbacks;
 return c.videoFallbackEnabled?[{modelId:c.fallbackVideoModel,attempts:c.fallbackVideoAttempts}]:[];
}
export function videoPolicyIssues(c,check=()=>[]){
 const issues=[],steps=videoFallbackSteps(c);if(c.videoFallbacks!==undefined&&!Array.isArray(c.videoFallbacks))issues.push('备用模型列表无效');
 for(const value of [c.videoAttempts,...steps.map(s=>s?.attempts)])if(!Number.isInteger(videoAttemptCount(value))||videoAttemptCount(value)<1||videoAttemptCount(value)>8)issues.push('视频尝试次数请选择 1–8 次（含首次）');
 for(const [i,step] of steps.entries()){if(typeof step?.modelId!=='string'||!step.modelId)issues.push(`请选择备用 ${i+1} 的视频模型`);else issues.push(...check({...c,videoModel:step.modelId,videoFallbackEnabled:false,videoFallbacks:[]}).map(s=>`备用 ${i+1} 视频模型：`+s));}return issues;
}
export function nextVideoAttempt(c,history,models){
 if(history.some(j=>!['success','failed'].includes(j.status)))throw Error('原任务仍在生成、下载或提交未知，不能重新生成');
 const choices=[[c.videoModel,videoAttemptCount(c.videoAttempts)],...videoFallbackSteps(c).map(s=>[s.modelId,videoAttemptCount(s.attempts)])],limits=new Map();
 for(const [id,count]of choices){const m=models.find(m=>m.id===id);if(!m)throw Error('所选视频模型配置不存在');const key=JSON.stringify([m.profileId,m.model]),limit=(limits.get(key)||0)+count;limits.set(key,limit);const failures=new Set(history.filter(j=>j.status==='failed'&&!isFundingError(j.error)&&(j.profileId===m.profileId&&j.model===m.model||!j.profileId&&id===c.videoModel)).map(j=>j.id));if(failures.size<limit)return m;}
 return null;
}
