export function workflowPreflightIssues(settings={}){
 const issues=[];
 if(!settings.profileId||!settings.model)issues.push('请选择已配置的视频渠道与模型');
 if(!settings.aiProfileId)issues.push('请选择 AI 检查接口');
 if(settings.mode==='semi'&&!settings.humanConfirmed)issues.push('请确认人工核对结果');
 if(settings.preflightVersion===1){
  if(!Number.isFinite(Number(settings.duration))||Number(settings.duration)<1||Number(settings.duration)>3600)issues.push('视频时长应在 1–3600 秒之间');
  if(!['9:16','16:9','1:1'].includes(settings.ratio))issues.push('请选择画面比例');
  if(!String(settings.visualStyle||'').trim())issues.push('请选择视觉风格');
  if(settings.endStage!=='archive')issues.push('超分与剪辑执行器尚未接入，请选择运行到视频归档');
 }
 return issues;
}
