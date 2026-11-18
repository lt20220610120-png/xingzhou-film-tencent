const test=require('node:test');
const assert=require('node:assert/strict');
const {renewImageReferences}=require('./generation-reference-recovery.cjs');
const ref={id:'asset:old',assetId:'asset',imageId:'old',projectId:'p',name:'【陈大山】',kind:'image',url:'old.png'};
const services=resolveAssetImage=>({resolveLocalReferences:async()=>null,resolveAssetImage});
test('preflight preserves alias slot and adopts a newly resolved image only for an opted-in reference',async()=>{
 const result=await renewImageReferences({projectId:'p',references:[{...ref,followAdoptedImage:true}]},services(async payload=>{
  assert.deepEqual(payload,{projectId:'p',assetId:'asset',imageId:'old',followAdoptedImage:true});
  return {id:'new',projectId:'p',assetId:'asset',url:'new.png'};
 }));
 assert.equal(result.references[0].id,'asset:old');
 assert.equal(result.references[0].imageId,'new');
 assert.equal(result.references[0].url,'new.png');
});
test('removed manual photo identifies its slot and retains real access errors',async()=>{
 const call=(code,message)=>renewImageReferences({projectId:'p',references:[{...ref,followAdoptedImage:false}]},services(async payload=>{
  assert.equal(payload.followAdoptedImage,undefined);
  throw Object.assign(Error(message),{code});
 }));
 await assert.rejects(call('ASSET_IMAGE_UNAVAILABLE','gone'),/@image1「陈大山」 的图片已失效/);
 await assert.rejects(call(undefined,'没有权限'),/@image1「陈大山」 无法读取：没有权限/);
});
