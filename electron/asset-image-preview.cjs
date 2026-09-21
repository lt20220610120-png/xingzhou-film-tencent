const {cacheIdentity} = require('./cos-image-cache.cjs');
function createAssetImagePreview({resolveImage,readBytes,readAccount,previewCache}) {
  return async payload => {
    const account=readAccount();
    if(!account)throw new Error('请先登录账号');
    // Recheck project/image permission even when the bytes are already local.
    let image=await resolveImage({...payload,preview:!previewCache && payload.original!==true});
    if(readAccount()!==account)throw new Error('账号已切换，请重新打开图片');
    if(!image?.url)throw new Error('图片地址不可用');
    if(previewCache && payload.original!==true && cacheIdentity(image.url,account)) {
      const local=await previewCache.get(image.url,account);
      if(readAccount()!==account)throw new Error('账号已切换，请重新打开图片');
      if(local)return {...image,originalUrl:image.url,url:local};
      image=await resolveImage({...payload,preview:true});
      if(readAccount()!==account)throw new Error('账号已切换，请重新打开图片');
      if(!image?.url)throw new Error('图片地址不可用');
    }
    if(payload.original!==true && /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(image.previewDataUrl || '') && image.previewDataUrl.length<2*1024*1024) {
      const local=await previewCache?.put(image.url,account,image.previewDataUrl);
      if(readAccount()!==account)throw new Error('账号已切换，请重新打开图片');
      return {...image,originalUrl:image.url,url:local || image.previewDataUrl};
    }
    if(!cacheIdentity(image.url,account))return image;
    const result=await readBytes(image.url,{label:'图片加载'});
    if(readAccount()!==account)throw new Error('账号已切换，请重新打开图片');
    if(!/^image\/(png|jpeg|webp|gif)$/.test(result.mime))throw new Error('图片内容格式不正确');
    const url=result.filePath
      ? `xzmedia:///${encodeURIComponent(result.filePath)}`
      : `data:${result.mime};base64,${result.bytes.toString('base64')}`;
    return {...image,originalUrl:image.url,url};
  };
}
module.exports={createAssetImagePreview};
