async function renewImageReferences(payload, collabService) {
  const projectId = payload.projectId || payload.bindingProjectId;
  const supplied = payload.references || [];
  const {assetImageSlot}=await import('../core/assetImageSlot.js');
  const original = payload.storyboardEdit ? supplied.map(ref=>assetImageSlot(ref,projectId)) : supplied;
  if (!original.length) return {...payload,references:original};
  const local = projectId ? await collabService.resolveLocalReferences(projectId,original) : null;
  const media = !local && projectId && original.some(ref=>!ref.assetId&&(ref.mediaId||(!ref.url&&ref.objectKey)
    ||payload.storyboardEdit&&ref.kind==='audio'&&ref.filePath))
    ? await collabService.listMedia({projectId}) : [];
  const {findStoryboardAudioMedia}=await import('../core/storyboardAudioReferences.js');
  const {numberedReferences}=await import('../core/generationReferences.js');
  const ordered=numberedReferences(local||original);
  const adoptedImages=new Map();
  const resolved = await Promise.all((local||original).map(async (ref,index) => {
    const assetId=ref.assetId||ref.asset_id;
    if (assetId) {
      const ownerProject=ref.projectId||ref.project_id||projectId;
      const imageId=ref.imageId||ref.mediaId||(ref.id===assetId?'legacy':ref.id)||'legacy';
      const label=ordered[index].alias+(ref.name ? '「'+ref.name.replace(/^[【]|[】]$/g,'')+'」' : '');
      if(payload.storyboardEdit && (ownerProject!==projectId||ref.project_id&&ref.project_id!==projectId))throw Error(label+' 的资产卡不属于当前项目');
      const slot=ref.assetImageSlot===true&&ownerProject===projectId;
      const follows=ref.followAdoptedImage ?? ref.autoAssetImage;
      let image;
      try {
        if(slot){
          if(!adoptedImages.has(assetId))adoptedImages.set(assetId,collabService.resolveAssetImage({projectId,assetId,assetImageSlot:true}));
          image=await adoptedImages.get(assetId);
        }else image=await collabService.resolveAssetImage({projectId:ownerProject,assetId,imageId,
          ...(follows===true&&ownerProject===projectId?{followAdoptedImage:true}:{})});
      } catch(error) {
        if(error.code==='ASSET_SLOT_EMPTY'&&slot&&payload.storyboardEdit)return null;
        if(error.code==='ASSET_SLOT_EMPTY')throw Error(label+' 的资产卡片暂无已采用图片，请到资产中采用一张图片');
        if(error.code==='ASSET_IMAGE_UNAVAILABLE')throw Error(label+' 的图片已失效，请重新选择图片');
        throw Error(label+' 无法读取：'+error.message);
      }
      if(!image?.url&&!image?.filePath)throw Error(label+' 的图片地址不可用，请重新选择图片');
      const next={...ref,...image,id:ref.id,imageId:image.id||imageId};
      // Project storage records asset images separately from generation inputs.
      if(next.kind==='asset-image')next.kind='image';
      if(slot||next.imageId!==imageId)next.filePath=image.filePath;
      return next;
    }
    if(local && (ref.localUnavailable || !ref.filePath)) throw Error('有参考素材尚未保存在本机，请重新选择素材');
    const found=ref.kind==='audio' && payload.storyboardEdit
      ? findStoryboardAudioMedia(ref,media,projectId)
      : media.find(row=>row.id===ref.mediaId||row.id===ref.id||row.objectKey&&row.objectKey===ref.objectKey);
    return found ? {...ref,url:found.url,filePath:found.filePath,mediaId:found.id} : ref;
  }));
  if(!resolved.includes(null))return {...payload,references:resolved};
  const {generationReferenceKey,remapGenerationAliases}=await import('../core/automaticReferences.js');
  const references=resolved.filter(Boolean);
  const aliases=refs=>refs.filter(ref=>ref.kind==='image').map(ref=>({key:generationReferenceKey(ref),alias:ref.alias}));
  const prompt=String(payload.prompt||'').replace(/@(?:图片|图)(\d+)/g,'@image$1');
  return {...payload,references,storyboardSourceReferences:original,
    prompt:remapGenerationAliases(prompt,aliases(ordered),aliases(numberedReferences(references)))};
}
module.exports={renewImageReferences};
