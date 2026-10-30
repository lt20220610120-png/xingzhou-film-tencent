import {isFundingError} from './productionRecovery.js';
export const videoAttemptCount=value=>value===undefined?2:Number(value);
export function videoPolicyIssues(c,check=()=>[]){
 const issues=[];for(const value of [c.videoAttempts,...(c.videoFallbackEnabled?[c.fallbackVideoAttempts]:[])])if(!Number.isInteger(videoAttemptCount(value))||videoAttemptCount(value)<1||videoAttemptCount(value)>8)issues.push('视频尝试次数请选择 1–8 次（含首次）');
 if(c.videoFallbackEnabled){if(!c.fallbackVideoModel||c.fallbackVideoModel===c.videoModel)issues.push('请选择不同的备用视频模型');else issues.push(...check({...c,videoModel:c.fallbackVideoModel,videoFallbackEnabled:false}).map(s=>'备用视频模型：'+s));}return issues;
}
export function nextVideoAttempt(c,history,models){
 if(history.some(j=>!['success','failed'].includes(j.status)))throw Error('原任务仍在生成、下载或提交未知，不能重新生成');
 const choices=[[c.videoModel,videoAttemptCount(c.videoAttempts)],...(c.videoFallbackEnabled?[[c.fallbackVideoModel,videoAttemptCount(c.fallbackVideoAttempts)]]:[])];
 for(const [id,limit]of choices){const m=models.find(m=>m.id===id);if(!m)throw Error('所选视频模型配置不存在');const failures=new Set(history.filter(j=>j.status==='failed'&&!isFundingError(j.error)&&(j.profileId===m.profileId&&j.model===m.model||!j.profileId&&id===c.videoModel)).map(j=>j.id));if(failures.size<limit)return m;}
 return null;
}
