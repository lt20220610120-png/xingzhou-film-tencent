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
test('storyboard preflight reads the adopted seat despite the presence of a previously selected image',async()=>{
 let adopted='new';
 const service=services(async payload=>{
  assert.deepEqual(payload,{projectId:'p',assetId:'asset',assetImageSlot:true});
  return {id:adopted,projectId:'p',assetId:'asset',url:`${adopted}.png`};
 });
 const input={projectId:'p',storyboardEdit:true,references:[{...ref,followAdoptedImage:false}]};
 assert.equal((await renewImageReferences(input,service)).references[0].url,'new.png');
 adopted='third';
 const result=await renewImageReferences(input,service);
 assert.equal(result.references[0].url,'third.png');
 assert.equal(result.references[0].id,ref.id);
});
test('empty storyboard seats skip upload and compact only the sent aliases, keeping originals for reuse',async()=>{
 const other={...ref,id:'second',assetId:'other',name:'第二张'};
 const audio={kind:'audio',id:'voice',url:'voice.wav'};
 const body='陈大山（参考@image1 @图片1），第二张（参考@图2），音色@audio1。';
 const input={projectId:'p',storyboardEdit:true,prompt:body,originalPrompt:body,references:[ref,other,audio]};
 const result=await renewImageReferences(input,services(async payload=>{
  if(payload.assetId==='asset')throw Object.assign(Error('空位'),{code:'ASSET_SLOT_EMPTY'});
  return {id:'adopted',url:'adopted.png'};
 }));
 assert.deepEqual(result.references.map(r=>r.id),[other.id,audio.id]);
 assert.equal(result.originalPrompt,body);
 assert.equal(result.prompt,'陈大山，第二张（参考@image1），音色@audio1。');
 assert.deepEqual(result.storyboardSourceReferences.map(r=>r.id),[ref.id,other.id,audio.id]);
 await assert.rejects(renewImageReferences(input,services(async()=>{throw Error('无权访问');})),/无权访问/);
});
