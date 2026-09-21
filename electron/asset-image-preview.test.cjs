const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAssetImagePreview}=require('./asset-image-preview.cjs');
const {createCosImageCache,COS_HOST}=require('./cos-image-cache.cjs');
const {readMediaBytes,configureMediaCache}=require('./media-network.cjs');
const url=`https://${COS_HOST}/projects/p/image/1-a.png?q-signature=a&q-key-time=1;9999999999`;
test('persistent preview cache survives reopening while checking permission before serving local bytes',async t=>{
 const {createLocalPreviewCache}=require('./local-preview-cache.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'xz-local-preview-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 let allowed=true,transfers=0,account='alice';
 const make=()=>createAssetImagePreview({readAccount:()=>account,previewCache:createLocalPreviewCache({directory}),resolveImage:async payload=>{
  if(!allowed)throw Error('权限已撤销');
  if(payload.preview){transfers++;return {url,previewDataUrl:'data:image/webp;base64,dGh1bWI='};}
  return {url};
 },readBytes:async()=>{throw Error('不应下载原图');}});
 assert.match((await make()({imageId:'i'})).url,/^xzmedia:/);
 assert.match((await make()({imageId:'i'})).url,/^xzmedia:/);assert.equal(transfers,1);
 allowed=false;await assert.rejects(make()({imageId:'i'}),/权限已撤销/);
 allowed=true;account='bob';await make()({imageId:'i'});assert.equal(transfers,2);
});
test('server preview avoids original egress but explicit full view loads original bytes',async()=>{
  let downloads=0;
  const preview=createAssetImagePreview({readAccount:()=> 'alice',resolveImage:async payload=>({url,...(payload.preview?{previewDataUrl:'data:image/webp;base64,dGh1bWI='}:{})}),readBytes:async()=>{downloads++;return {bytes:Buffer.from('original'),mime:'image/png'};}});
  const thumbnail=await preview({imageId:'image'});
  assert.equal(thumbnail.url,'data:image/webp;base64,dGh1bWI=');
  assert.equal(thumbnail.originalUrl,url);assert.equal(downloads,0);
  assert.equal((await preview({imageId:'image',original:true})).url,'data:image/png;base64,b3JpZ2luYWw=');
  assert.equal(downloads,1);
});
test('preview, export and reference reads share bytes while each preview still checks permission',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'xz-preview-'));
  t.after(()=>{configureMediaCache(null);fs.rmSync(directory,{recursive:true,force:true});});
  const cache=createCosImageCache({directory});configureMediaCache(cache,()=> 'alice');
  let downloads=0,checks=0,allowed=true;
  const options={fetchFn:async()=>{downloads++;return new Response('original',{headers:{'content-type':'image/png'}});}};
  const preview=createAssetImagePreview({readAccount:()=> 'alice',readBytes:address=>readMediaBytes(address,options),resolveImage:async()=>{
    checks++;if(!allowed)throw Error('无权访问');return {id:'image',url};
  }});
  const first=await preview({imageId:'image'});
  assert.match(first.url,/^xzmedia:\/\/\//);
  assert.equal(decodeURIComponent(first.url.slice('xzmedia:///'.length)),path.join(directory,path.basename(decodeURIComponent(first.url.slice('xzmedia:///'.length)))));
  await preview({imageId:'image'});
  assert.equal((await readMediaBytes(url.replace('signature=a','signature=b'),options)).bytes.toString(),'original');
  assert.equal(checks,2);assert.equal(downloads,1);
  allowed=false;await assert.rejects(preview({imageId:'image'}),/无权访问/);assert.equal(downloads,1);
});
test('logging out during authorization or download does not deliver cached image bytes',async()=>{
  for(const stage of ['authorize','download']) {
    let account='alice';
    const preview=createAssetImagePreview({readAccount:()=>account,resolveImage:async()=>{if(stage==='authorize')account='';return {url};},readBytes:async()=>{account='';return {bytes:Buffer.from('image'),mime:'image/png'};}});
    await assert.rejects(preview({}),/账号已切换/);
  }
});
test('cache write fallback returns original image bytes without another network read',async()=>{
  const preview=createAssetImagePreview({readAccount:()=> 'alice',resolveImage:async()=>({url}),readBytes:async()=>({bytes:Buffer.from('image'),mime:'image/png'})});
  assert.equal((await preview({})).url,'data:image/png;base64,aW1hZ2U=');
});
