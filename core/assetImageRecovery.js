import {assetSkipsReferenceImage} from './assetReferencePolicy.js';

const key = (projectId, assetId, accountId) => `xz-asset-image-recovery:${accountId?encodeURIComponent(accountId)+':':''}${projectId}:${assetId}`;
const memory = new Map();
const preferenceReads = new WeakMap();
function remember(projectId, assetId, value, accountId) {
  const id = key(projectId, assetId,accountId); memory.set(id, value);
  try { localStorage.setItem(id, JSON.stringify(value)); } catch {}
}
export function readAssetImageRecovery(projectId, assetId,accountId) {
  const id = key(projectId, assetId,accountId);
  if (memory.has(id)) return memory.get(id);
  try { return JSON.parse(localStorage.getItem(id) || 'null'); } catch { return null; }
}
export function clearAssetImageRecovery(projectId, assetId,accountId) {
  const id=key(projectId,assetId,accountId);
  memory.delete(id);
  try { localStorage.removeItem(id); } catch {}
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
async function verifyBatchAssetPreference(api, projectId, assetId, accountId) {
  let projects = preferenceReads.get(api);
  if (!projects) { projects = new Map(); preferenceReads.set(api, projects); }
  const scope=JSON.stringify([accountId,projectId]);
  if (!projects.has(scope)) {
    const read = Promise.resolve().then(() => api.collabListAssets({projectId})).finally(() => projects.delete(scope));
    projects.set(scope, read);
  }
  const assets = await projects.get(scope).catch(() => null);
  const asset = Array.isArray(assets) && assets.find(row => row.id === assetId);
  if (!asset) throw Object.assign(new Error('无法核对资产最新的参考图状态，未提交生图。'), {code:'ASSET_REFERENCE_IMAGE_UNVERIFIED'});
  if (assetSkipsReferenceImage(asset)) throw Object.assign(new Error('已标记无需参考图，已跳过生图。'), {code:'ASSET_REFERENCE_IMAGE_EXEMPT'});
}

export async function requestAssetImage(api, projectId, assetId, payload, {recoveryOnly=false,respectReferencePreference=false,beforeDispatch,accountId}={}) {
  const pending = readAssetImageRecovery(projectId, assetId,accountId);
  // Recovery tools must never fall through to a paid generation, even if a
  // receipt was cleared after the list was planned.
  if(recoveryOnly&&!pending?.filePath&&!pending?.taskId&&!pending?.receiptId)throw new Error('没有待恢复的旧结果，已跳过；未提交新的生图请求。');
  if (pending?.filePath) return pending;
  if (pending?.reason==='expired') throw new Error('服务商结果链接已不可用，请找回原图后上传，或明确放弃旧结果后重新生图。');
  let result;
  if (pending?.taskId) result = await api.generationRefresh({id:pending.taskId,endpoint:payload.endpoint,apiKey:payload.apiKey});
  else if (pending?.receiptId) result = await api.mediaRetryImageDownload({receiptId:pending.receiptId,projectId,assetId});
  else {
    if(accountId&&readAssetImageRecovery(projectId,assetId))throw Error('此资产有旧版未确认的图片任务，请先核对生成历史，未提交新的生图请求。');
    if (respectReferencePreference) await verifyBatchAssetPreference(api,projectId,assetId,accountId);
    beforeDispatch?.();
    result = await api.mediaGenerateImage({...payload,projectId,assetId});
  }
  if(pending?.taskId&&result?.status==='failed'){clearAssetImageRecovery(projectId,assetId,accountId);throw Error(result.error||'原任务已确认失败，可再次点击生成新任务');}
  if(result?.pendingGeneration||(pending?.taskId&&result?.status!=='success')){const taskId=result.pendingGeneration?.id||pending.taskId;remember(projectId,assetId,{taskId,reason:result.pendingGeneration?.provider||pending?.reason||'generation'},accountId);throw Error(result.error||result.warning||'原任务尚未完成，刷新会继续查询原结果，不会重新生成');}
  if (result?.pendingDownload) {
    const {id,reason,httpStatus,upstreamCode,imageVerified}=result.pendingDownload;
    remember(projectId, assetId, {receiptId:id,reason:reason||'network',httpStatus,upstreamCode,imageVerified},accountId);
    throw new Error(result.error || '接口已返回结果，原图尚未取回；可重试下载，不会重新生图');
  }
  if (result?.filePath) remember(projectId, assetId, {filePath:result.filePath},accountId);
  return result;
}
