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
export async function requestAssetImage(api, projectId, assetId, payload) {
  const pending = readAssetImageRecovery(projectId, assetId);
  if (pending?.filePath) return pending;
  const result = pending?.receiptId ? await api.mediaRetryImageDownload({receiptId:pending.receiptId}) : await api.mediaGenerateImage(payload);
  if (result?.pendingDownload) {
    remember(projectId, assetId, {receiptId:result.pendingDownload.id});
    throw new Error(result.error || '图片已生成，下载未完成；可重试下载，不会重新生图');
  }
  if (result?.filePath) remember(projectId, assetId, {filePath:result.filePath});
  return result;
}
