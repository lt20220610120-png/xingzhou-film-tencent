const {cacheIdentity} = require('./cos-image-cache.cjs');
function createAssetImagePreview({resolveImage,readBytes,readAccount}) {
  return async payload => {
    const account=readAccount();
    if(!account)throw new Error('请先登录账号');
    // Recheck project/image permission even when the bytes are already local.
    const image=await resolveImage(payload);
    if(readAccount()!==account)throw new Error('账号已切换，请重新打开图片');
    if(!image?.url)throw new Error('图片地址不可用');
    if(!cacheIdentity(image.url,account))return image;
    const result=await readBytes(image.url,{label:'图片加载'});
    if(readAccount()!==account)throw new Error('账号已切换，请重新打开图片');
    if(!/^image\/(png|jpeg|webp|gif)$/.test(result.mime))throw new Error('图片内容格式不正确');
    const url=result.filePath
      ? `xzmedia:///${encodeURIComponent(result.filePath)}`
      : `data:${result.mime};base64,${result.bytes.toString('base64')}`;
    return {...image,url};
  };
}
module.exports={createAssetImagePreview};
