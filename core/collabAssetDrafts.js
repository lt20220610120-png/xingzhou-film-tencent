// Keep unsaved edits separate from periodically refreshed cloud asset rows.
export function createAssetDraftStore(storage, accountId) {
  const memory = new Map();
  const saving = new Map();
  const keyFor = (projectId, assetId) => `xz-asset-draft:${accountId}:${projectId}:${assetId}`;
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
    return value;
  };
  const save = async (api, projectId, assetId, content) => {
    const key = keyFor(projectId, assetId);
    // Serialize writes so an older request cannot finish after a newer edit.
    const previous = saving.get(key) || Promise.resolve();
    const request = previous.catch(() => {}).then(async () => {
      const current = read(projectId, assetId);
      if (current?.content === content && current.pending === false) return current.result;
      const result = await api.collabUpdateAsset({ projectId, assetId, updates: { description: content } });
      if (read(projectId, assetId)?.content === content) {
        const saved = { content, pending: false, result };
        memory.set(key, saved);
        try { storage.setItem(key, JSON.stringify(saved)); } catch {}
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
    }
  };
  return { read, write, save, reconcile };
}

export const readableCloudError = (error) => String(error?.message || error || '保存失败')
  .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
