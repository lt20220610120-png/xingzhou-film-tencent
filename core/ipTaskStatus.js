import { ipSettingsReviewReason } from './ipWorkspace.js';
/** Presentation of work remaining; confirmed manuscripts stay independent of task records. */
export function ipWorkStatus(project,activity={}) {
 const ip=project?.creator?.ip||{},nodes=project?.episodes||[];
 const missingEpisodes=nodes.filter(e=>e.type==='episode'&&!e.scriptText?.trim()).length;
 const missingSettings=!ip.completedImport&&!nodes.some(e=>e.type==='settings'&&e.scriptText?.trim());
 const reviewReason=!ip.completedImport&&ip.plan?ipSettingsReviewReason(project):'';
 const needsSettingsReview=!!reviewReason;
 const pending=!ip.completedImport&&(missingEpisodes>0||missingSettings||needsSettingsReview);
 const unconfirmed=nodes.some(e=>e.scriptText?.trim()&&(!e.finalConfirmed||e.stale));
 const base={pending,missingEpisodes,missingSettings,needsSettingsReview,buttonLabel:needsSettingsReview?'核对设定与小传':pending?(missingEpisodes?'补全设定与未完成集':'补全设定与小传'):'全部已生成',tone:needsSettingsReview?'review':'ready',message:needsSettingsReview?`${reviewReason}。核对后即可继续。`:pending?`待生成：${[missingSettings?'设定与小传':'',missingEpisodes?`${missingEpisodes} 集正文`:''].filter(Boolean).join('、')}`:unconfirmed?'设定与各集正文已生成，待核对并确认。':'全部正文已确认。'};
 if(activity.running)return {...base,tone:'running',buttonLabel:'正在生成…',message:activity.label||'正在处理，请等待…'};
 if(activity.status==='failed')return {...base,tone:'error',message:`任务未完成：${activity.label||'请重试；已生成内容已保留。'}`};
 if(activity.status==='cancelled')return {...base,tone:'paused',message:'任务已停止，已生成内容保留，可继续补全。'};
 if(!pending&&ip.firstDraft?.lengthWarning)return {...base,tone:'review',message:`全部分集首稿已生成，待核对。${ip.firstDraft.lengthWarning}`};
 if(!ip.plan&&!ip.completedImport)return {...base,tone:'waiting',message:'请先在分集规划中一键生成首版。'};
 return base;
}
