export const referenceName = name => String(name || '').replace(/\.(?:png|jpe?g|webp|mp4|mov|webm|mp3|wav|m4a|aac|ogg)$/i,'').replace(/^[【\[]|[】\]]$/g, '');
export function numberedReferences(references) {
  const counts = {};
  return references.map(r => ({ ...r, alias: `@${r.kind}${counts[r.kind] = (counts[r.kind] || 0) + 1}` }));
}
export function bindReferencePrompt(prompt, references) {
  let result = String(prompt || '');
  const numbered = numberedReferences(references);
  const names = [...new Set(numbered.map(r => referenceName(r.name)).filter(Boolean))].sort((a,b) => b.length-a.length);
  for (const name of names) {
    const matches=numbered.filter(r=>referenceName(r.name)===name);
    if (matches.length !== 1) {
      if (result.includes(`@${name}`) || result.includes(`@【${name}】`)) throw new Error(`“${name}”有多张参考图，请选择一张或改用素材编号`);
      continue;
    }
    result=result.split(`@【${name}】`).join(matches[0].alias).split(`@[${name}]`).join(matches[0].alias);
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    result=result.replace(new RegExp(`@${escaped}(?![\\w\\u4e00-\\u9fff])`,'g'),matches[0].alias);
  }
  return result;
}
export function autoReferences(prompt, assets) {
  return assets.filter(a => {
    const name=referenceName(a.name);
    return name && (prompt.includes(`@${name}`)||prompt.includes(`@【${name}】`));
  }).flatMap(a => {
    const image=(a.images || []).find(i=>i.url) || (/^https?:/.test(a.image_url || '') ? {url:a.image_url} : null);
    return image ? [{id:image.id || a.id,imageId:image.id || 'legacy',projectId:a.project_id || a.projectId,assetId:a.id,name:a.name,kind:'image',url:image.url}] : [];
  });
}
export const mediaSource = item => item.filePath ? `xzmedia:///${encodeURIComponent(item.filePath)}` : item.url || '';

export function appendImportedReferences(existing, files, kind, caps = {}) {
  const capKey = {image:'maxImages',audio:'maxAudios',video:'maxVideos'}[kind];
  if (!capKey) throw new Error('不支持的参考素材类型');
  const limit = caps[capKey];
  const count = existing.filter(item => item.kind === kind).length + files.length;
  if (limit != null && count > limit) {
    const name = {image:'图片',audio:'音频',video:'视频'}[kind];
    throw new Error(`当前模型最多支持 ${limit} 个参考${name}，本次导入后共 ${count} 个。请减少选择数量或切换模型。`);
  }
  return [...existing, ...files.map(file => ({...file,id:crypto.randomUUID(),kind,name:file.name || file.filePath.split(/[\\/]/).pop()}))];
}
// Upgrade old stored picker references while preserving the exact selected image.
export function refreshAssetReferences(references, assets, projectId) {
  return references.map(ref => {
    if (!ref.assetId) return ref;
    const asset = assets.find(a=>a.id===ref.assetId);
    const imageId = ref.imageId || (ref.id===ref.assetId?'legacy':ref.id) || 'legacy';
    const image = asset?.images?.find(i=>i.id===imageId);
    return {...ref, projectId, imageId, url:image?.url || (imageId==='legacy' ? asset?.image_url : '') || ref.url};
  });
}
