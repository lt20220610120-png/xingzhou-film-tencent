async function renewImageReferences(payload, collabService) {
  const {storyboardVisibleImageIds,...request}=payload;
  const projectId = payload.projectId || payload.bindingProjectId;
  const supplied = payload.references || [];
  const {assetImageSlot}=await import('../core/assetImageSlot.js');
  const original = payload.storyboardEdit ? supplied.map(ref=>assetImageSlot(ref,projectId)) : supplied;
  if (!original.length) return {...request,references:original};
  const local = projectId ? await collabService.resolveLocalReferences(projectId,original) : null;
  const media = !local && projectId && original.some(ref=>!ref.assetId&&(ref.mediaId||(!ref.url&&ref.objectKey)
    ||payload.storyboardEdit&&ref.kind==='audio'&&ref.filePath))
    ? await collabService.listMedia({projectId}) : [];
  const {findStoryboardAudioMedia}=await import('../core/storyboardAudioReferences.js');
  const {numberedReferences}=await import('../core/generationReferences.js');
  const adoptedImages=new Map();
  const resolved = await Promise.all((local||original).map(async ref => {
    const assetId=ref.assetId||ref.asset_id;
    if (assetId) {
      const ownerProject=ref.projectId||ref.project_id||projectId;
      const imageId=ref.imageId||ref.mediaId||(ref.id===assetId?'legacy':ref.id)||'legacy';
      if(payload.storyboardEdit && (ownerProject!==projectId||ref.project_id&&ref.project_id!==projectId))return {failure:'的资产卡不属于当前项目'};
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
        if(error.code==='ASSET_SLOT_EMPTY')return {failure:'的资产卡片暂无已采用图片，请到资产中采用一张图片'};
        if(error.code==='ASSET_IMAGE_UNAVAILABLE')return {failure:'的图片已失效，请重新选择图片'};
        return {failure:'无法读取：'+error.message};
      }
      if(!image?.url&&!image?.filePath)return {failure:'的图片地址不可用，请重新选择图片'};
      const next={...ref,...image,id:ref.id,imageId:image.id||imageId};
      // Project storage records asset images separately from generation inputs.
      if(next.kind==='asset-image')next.kind='image';
      if(slot||next.imageId!==imageId)next.filePath=image.filePath;
      return {reference:next};
    }
    if(local && (ref.localUnavailable || !ref.filePath)) throw Error('有参考素材尚未保存在本机，请重新选择素材');
    const found=ref.kind==='audio' && payload.storyboardEdit
      ? findStoryboardAudioMedia(ref,media,projectId)
      : media.find(row=>row.id===ref.mediaId||row.id===ref.id||row.objectKey&&row.objectKey===ref.objectKey);
    return {reference:found ? {...ref,url:found.url,filePath:found.filePath,mediaId:found.id} : ref};
  }));
  const active=resolved.filter(Boolean);
  const activeSources=original.filter((_,index)=>resolved[index]!==null);
  if(payload.storyboardEdit&&Array.isArray(storyboardVisibleImageIds)){
    const actual=activeSources.filter(ref=>ref.kind==='image').map(ref=>ref.id);
    if(actual.length!==storyboardVisibleImageIds.length||actual.some((id,index)=>id!==storyboardVisibleImageIds[index]))
      throw Error('分镜参考图片已变化，更新后请重新提交');
  }
  const failureIndex=active.findIndex(row=>row.failure);
  if(failureIndex>=0){
    const readyOrder=numberedReferences((local||original).filter((_,index)=>resolved[index]!==null));
    const ref=readyOrder[failureIndex];
    const name=typeof ref.name==='string'&&ref.name ? '「'+ref.name.replace(/^[【]|[】]$/g,'')+'」' : '';
    throw Error(ref.alias+name+' '+active[failureIndex].failure);
  }
  const references=active.map(row=>row.reference);
  if(active.length===resolved.length)return {...request,references};
  const {projectStoryboardImageAliases}=await import('../core/storyboardReferences.js');
  return {...request,references,storyboardSourceReferences:original,
    prompt:projectStoryboardImageAliases(payload.prompt,original,references).prompt};
}
module.exports={renewImageReferences};
