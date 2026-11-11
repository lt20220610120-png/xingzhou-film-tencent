import {adoptedAssetImage} from './adoptedAssetImage.js';
export const referenceName = name => String(name || '').replace(/\.(?:png|jpe?g|webp|mp4|mov|webm|mp3|wav|m4a|aac|ogg|flac)$/i,'').replace(/^[【\[]|[】\]]$/g, '');
const referenceNames = item => [...new Set([item.name,item.displayName,...(item.nameAliases||[])].map(referenceName).filter(Boolean))];
// Older art drafts persisted collab_media storage kinds. Providers accept only
// image/audio/video, so an adopted asset image must cross that boundary as image.
export const normalizeGenerationReferences = references => (Array.isArray(references)?references:[]).map(ref =>
 ref&&ref.kind==='asset-image'&&(ref.assetId||ref.imageId)?{...ref,kind:'image'}:ref
);
export const isProjectGenerationReference=(ref,projectId)=>
 ['image','audio','video'].includes(ref.kind)&&
 (!ref.projectId||ref.projectId===projectId)&&(!ref.project_id||ref.project_id===projectId);
const referenceStorageKeys=ref=>[ref.objectKey,ref.object_path,ref.url,ref.filePath].filter(Boolean).map(value=>{
 try{return decodeURIComponent(/^https?:/.test(value)?new URL(value).pathname:String(value).split('?')[0]).replace(/^\//,'');}catch{return String(value).split('?')[0];}
});
export const canDeleteUploadedReference=(ref,{projectId,accountId,canEdit,protectedReferences=[]})=>Boolean(
 canEdit&&accountId&&ref.id&&(ref.projectId||ref.project_id)===projectId&&
 (ref.userId||ref.user_id)===accountId&&['image','audio','video'].includes(ref.kind)&&
 /^参考素材\s/.test(ref.note||'')&&!ref.assetId&&!ref.asset_id&&!ref.adoptedVoice&&!ref.published&&!String(ref.id).startsWith('voice:')&&
 !protectedReferences.some(item=>item.id===ref.id||String(item.id||'').endsWith(':'+ref.id)||referenceStorageKeys(item).some(key=>referenceStorageKeys(ref).includes(key))));
export function numberedReferences(references) {
  const counts = {};
  return references.map(r => ({ ...r, alias: `@${r.kind}${counts[r.kind] = (counts[r.kind] || 0) + 1}` }));
}
export function bindReferencePrompt(prompt, references) {
  let result = String(prompt || '');
  const numbered = numberedReferences(references);
  const names = [...new Set(numbered.flatMap(referenceNames))].sort((a,b) => b.length-a.length);
  for (const name of names) {
    const matches=numbered.filter(r=>referenceNames(r).includes(name));
    const aliases=matches.map(r=>r.alias).join(' ');
    result=result.split(`@【${name}】`).join(aliases).split(`@[${name}]`).join(aliases);
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    result=result.replace(new RegExp(`@${escaped}(?![\\w\\u4e00-\\u9fff])`,'g'),aliases);
  }
  return result;
}
export function autoReferences(prompt, assets) {
  return assets.filter(a => {
    return referenceNames(a).some(name=>prompt.includes(`@${name}`)||prompt.includes(`@【${name}】`));
  }).flatMap(a => {
    const image=adoptedAssetImage(a) || (/^https?:/.test(a.image_url || '') ? {url:a.image_url} : null);
    return image ? [{id:image.id || a.id,imageId:image.id || 'legacy',projectId:a.project_id || a.projectId,assetId:a.id,name:a.name,displayName:a.displayName,nameAliases:a.nameAliases,kind:'image',url:image.url}] : [];
  });
}
export const mediaSource = item => item.filePath ? `xzmedia://local/${encodeURIComponent(item.filePath)}` : (item.url || '').replace(/^xzmedia:\/\/\//, 'xzmedia://local/');

// The voice ledger stores adopted samples separately from uploaded project media.
// Reuse binding identities so selecting an adopted voice never creates a second alias.
export function projectAudioReferences(media,voiceCards,projectId) {
 const adopted=(voiceCards||[]).filter(card=>!card.pendingAudio).map(card=>({...card.reference,adoptedVoice:true}));
 const seen=new Set();
 return [...adopted,...media].filter(ref=>{
  if(ref.kind!=='audio'||!isProjectGenerationReference(ref,projectId)||!(ref.url||ref.filePath)||seen.has(ref.id))return false;
  seen.add(ref.id);return true;
 }).map(ref=>({...ref,name:ref.adoptedVoice?ref.name:ref.filename||ref.note||ref.name||'参考音频'}));
}

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
 return normalizeGenerationReferences(references).map(ref => {
    if (!ref.assetId) return ref;
    const asset = assets.find(a=>a.id===ref.assetId);
    const imageId = ref.imageId || (ref.id===ref.assetId?'legacy':ref.id) || 'legacy';
    const image = asset?.images?.find(i=>i.id===imageId);
    return {...ref, projectId, imageId, ...(asset?.displayName?{displayName:asset.displayName,nameAliases:asset.nameAliases}:{}), url:image?.url || (imageId==='legacy' ? asset?.image_url : '') || ref.url};
  });
}
