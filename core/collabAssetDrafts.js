// Keep unsaved edits separate from periodically refreshed cloud asset rows.
export function createAssetDraftStore(storage, accountId, {isCurrent=()=>true}={}) {
  const memory = new Map();
  const saving = new Map();
  const listeners=new Map();
  const keyFor = (projectId, assetId) => `xz-asset-draft:${accountId}:${projectId}:${assetId}`;
  const notify=key=>{for(const listener of listeners.get(key)||[])listener();};
  const subscribe=(projectId,assetId,listener)=>{const key=keyFor(projectId,assetId);if(!listeners.has(key))listeners.set(key,new Set());listeners.get(key).add(listener);return()=>{listeners.get(key)?.delete(listener);if(!listeners.get(key)?.size)listeners.delete(key);};};
  const read = (projectId, assetId) => {
    const key = keyFor(projectId, assetId);
    if (memory.has(key)) return memory.get(key);
    try { const value = JSON.parse(storage.getItem(key)); if (typeof value?.content === 'string') return value; } catch {}
    return null;
  };
  const write = (projectId, assetId, content) => {
    const value = { content, editedAt: Date.now(), pending: true };
    const key = keyFor(projectId, assetId);
    memory.set(key, value);
    try { storage.setItem(key, JSON.stringify(value)); } catch {}
    notify(key);
    return value;
  };
  const save = async (api, projectId, assetId, content) => {
    const key = keyFor(projectId, assetId);
    // Serialize writes so an older request cannot finish after a newer edit.
    const previous = saving.get(key) || Promise.resolve();
    const request = previous.catch(() => {}).then(async () => {
      const current = read(projectId, assetId);
      if (current?.content === content && current.pending === false) return current.result;
      if(!isCurrent())throw Error('账号或资料目录已变化，原草稿保留，未写入其他账号');
      const result = await api.collabUpdateAsset({ projectId, assetId, updates: { description: content } });
      if (read(projectId, assetId)?.content === content) {
        const saved = { content, pending: false, result };
        memory.set(key, saved);
        try { storage.setItem(key, JSON.stringify(saved)); } catch {}
        notify(key);
      }
      return result;
    });
    saving.set(key, request);
    try { return await request; } finally { if (saving.get(key) === request) saving.delete(key); }
  };
  const reconcile = (projectId, asset) => {
    const value = read(projectId, asset.id);
    if (value?.pending === false && (value.content === asset.description ||
      Date.parse(asset.updated_at) > Date.parse(value.result?.updated_at))) {
      const key = keyFor(projectId, asset.id);
      memory.delete(key);
      try { storage.removeItem(key); } catch {}
      notify(key);
    }
  };
  return { read, write, save, reconcile,subscribe,isCurrent,accountId };
}

export const readableCloudError = (error) => String(error?.message || error || '保存失败')
  .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
