const key = (projectId, assetId) => `xz-asset-image-recovery:${projectId}:${assetId}`;
const memory = new Map();
function remember(projectId, assetId, value) {
  const id = key(projectId, assetId); memory.set(id, value);
  try { localStorage.setItem(id, JSON.stringify(value)); } catch {}
}
export function readAssetImageRecovery(projectId, assetId) {
  const id = key(projectId, assetId);
  if (memory.has(id)) return memory.get(id);
  try { return JSON.parse(localStorage.getItem(id) || 'null'); } catch { return null; }
}
export function clearAssetImageRecovery(projectId, assetId) {
  memory.delete(key(projectId, assetId));
  try { localStorage.removeItem(key(projectId, assetId)); } catch {}
}
export function assetImageRecoverySummary(pending) {
  if(pending?.filePath)return '原图已取回，等待保存到项目。';
  if(pending?.taskId)return '已有生成任务，继续查询原任务不会重复提交。';
  const status=pending?.httpStatus?`（HTTP ${pending.httpStatus}）`:'';
  if(pending?.reason==='upstream'||pending?.reason==='expired')return `上游结果地址下载失败${status}，请重试或打开地址核对。`;
  if(pending?.reason==='invalid')return '返回内容不是有效图片，尚未确认生成了可显示的图片。';
  if(pending?.imageVerified)return '图片数据已验证，本地保存尚未完成。';
  if(pending?.reason==='network')return '原结果尚未取回，请检查网络或系统代理后重试。';
  return '已保留接口返回的结果，尚未取回有效图片。';
}
export async function requestAssetImage(api, projectId, assetId, payload) {
  const pending = readAssetImageRecovery(projectId, assetId);
  if (pending?.filePath) return pending;
  if (pending?.reason==='expired') throw new Error('服务商结果链接已不可用，请找回原图后上传，或明确放弃旧结果后重新生图。');
  const result = pending?.taskId ? await api.generationRefresh({id:pending.taskId,endpoint:payload.endpoint,apiKey:payload.apiKey}) : pending?.receiptId ? await api.mediaRetryImageDownload({receiptId:pending.receiptId}) : await api.mediaGenerateImage(payload);
  if(pending?.taskId&&result?.status==='failed'){clearAssetImageRecovery(projectId,assetId);throw Error(result.error||'原任务已确认失败，可再次点击生成新任务');}
  if(result?.pendingGeneration||(pending?.taskId&&result?.status!=='success')){const taskId=result.pendingGeneration?.id||pending.taskId;remember(projectId,assetId,{taskId,reason:result.pendingGeneration?.provider||pending?.reason||'generation'});throw Error(result.error||result.warning||'原任务尚未完成，刷新会继续查询原结果，不会重新生成');}
  if (result?.pendingDownload) {
    const {id,reason,httpStatus,upstreamCode,imageVerified}=result.pendingDownload;
    remember(projectId, assetId, {receiptId:id,reason:reason||'network',httpStatus,upstreamCode,imageVerified});
    throw new Error(result.error || '接口已返回结果，原图尚未取回；可重试下载，不会重新生图');
  }
  if (result?.filePath) remember(projectId, assetId, {filePath:result.filePath});
  return result;
}
