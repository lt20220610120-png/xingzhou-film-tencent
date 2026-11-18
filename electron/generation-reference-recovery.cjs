async function renewImageReferences(payload, collabService) {
  const original = payload.references || [];
  if (!original.length) return {...payload,references:original};
  const projectId = payload.projectId || payload.bindingProjectId;
  const local = projectId ? await collabService.resolveLocalReferences(projectId,original) : null;
  const media = !local && projectId && original.some(ref=>!ref.assetId&&(ref.mediaId||(!ref.url&&ref.objectKey)))
    ? await collabService.listMedia({projectId}) : [];
  const {numberedReferences}=await import('../core/generationReferences.js');
  const aliases=numberedReferences(local||original).map(ref=>ref.alias);
  const references = await Promise.all((local||original).map(async (ref,index) => {
    if (ref.assetId) {
      const ownerProject=ref.projectId||projectId;
      const imageId=ref.imageId||ref.mediaId||(ref.id===ref.assetId?'legacy':ref.id)||'legacy';
      const label=aliases[index]+(ref.name ? '「'+ref.name.replace(/^[【]|[】]$/g,'')+'」' : '');
      const follows=ref.followAdoptedImage ?? ref.autoAssetImage;
      let image;
      try {
        image=await collabService.resolveAssetImage({projectId:ownerProject,assetId:ref.assetId,imageId,
          ...(follows===true&&ownerProject===projectId?{followAdoptedImage:true}:{})});
      } catch(error) {
        if(error.code==='ASSET_IMAGE_UNAVAILABLE')throw Error(label+' 的图片已失效，请重新选择图片');
        throw Error(label+' 无法读取：'+error.message);
      }
      if(!image?.url&&!image?.filePath)throw Error(label+' 的图片地址不可用，请重新选择图片');
      const next={...ref,...image,id:ref.id,imageId:image.id||imageId};
      if(next.imageId!==imageId)next.filePath=image.filePath;
      return next;
    }
    if(local && (ref.localUnavailable || !ref.filePath)) throw Error('有参考素材尚未保存在本机，请重新选择素材');
    const found=media.find(row=>row.id===ref.mediaId||row.id===ref.id||row.objectKey&&row.objectKey===ref.objectKey);
    return found ? {...ref,url:found.url,filePath:found.filePath,mediaId:found.id} : ref;
  }));
  return {...payload,references};
}
module.exports={renewImageReferences};
