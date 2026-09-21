const test=require('node:test');
const assert=require('node:assert/strict');
const {assetImageLink}=require('../src/asset-image-links.cjs');
const {handleAction}=require('../src/collab.cjs');
const signer={host:'bucket.cos.test',signDownload:({objectKey})=>({url:`https://bucket.cos.test/${objectKey}?fresh`,expiresAt:9999999999999})};
test('thumbnail generation follows permission checks and preserves original link',async()=>{
  const repo={getProject:async()=>({id:'p'}),findMedia:async(id,uid)=>uid==='u'?{id,project_id:'p',asset_id:'a',object_path:'projects/p/image/a.png'}:null};
  let reads=0;
  const thumbnail=async()=>{reads++;return 'data:image/webp;base64,dGh1bWI=';};
  const payload={projectId:'p',assetId:'a',imageId:'i',preview:true};
  const result=await handleAction('asset-image-url',payload,{id:'u'},repo,signer,thumbnail);
  assert.equal(result.body.previewDataUrl,'data:image/webp;base64,dGh1bWI=');
  assert.equal(result.body.url,'https://bucket.cos.test/projects/p/image/a.png?fresh');
  assert.equal((await handleAction('asset-image-url',payload,{id:'outsider'},repo,signer,thumbnail)).status,404);
  assert.equal(reads,1);
  const oldClient=await handleAction('asset-image-url',{...payload,preview:false},{id:'u'},repo,signer,thumbnail);
  assert.equal(oldClient.body.previewDataUrl,undefined);assert.equal(reads,1);
});
test('expired COS URLs and object paths are re-signed, external legacy URLs are retained',()=>{
  assert.equal(assetImageLink('https://bucket.cos.test/projects/p/image/a.png?expired',signer).url,'https://bucket.cos.test/projects/p/image/a.png?fresh');
  assert.equal(assetImageLink('projects/p/image/a.png',signer).expiresAt,9999999999999);
  assert.equal(assetImageLink('https://external.test/a.png?original',signer).url,'https://external.test/a.png?original');
});
test('asset list collapses duplicate media identities and provides renewable metadata',async()=>{
  const repo={getProject:async()=>({id:'p'}),listAssets:async()=>[{id:'a',image_url:'projects/p/image/a.png'}],listAssetImages:async()=>[{id:'i',asset_id:'a',object_path:'projects/p/image/a.png'},{id:'i',asset_id:'a',object_path:'projects/p/image/a.png'}]};
  const result=await handleAction('assets-list',{projectId:'p'},{id:'u'},repo,signer);
  assert.equal(result.body[0].images.length,1);assert.equal(result.body[0].images[0].assetId,'a');assert.equal(result.body[0].images[0].expiresAt,9999999999999);
});
test('renewal authorizes the actual image and rejects other project/asset identifiers',async()=>{
  const repo={getProject:async()=>({id:'p'}),findMedia:async(id,uid)=>uid==='u'?{id,project_id:'p',asset_id:'a',object_path:'projects/p/image/a.png'}:null};
  assert.equal((await handleAction('asset-image-url',{projectId:'p',assetId:'a',imageId:'i'},{id:'u'},repo,signer)).body.url,'https://bucket.cos.test/projects/p/image/a.png?fresh');
  assert.equal((await handleAction('asset-image-url',{projectId:'p',assetId:'other',imageId:'i'},{id:'u'},repo,signer)).status,404);
  assert.equal((await handleAction('asset-image-url',{projectId:'p',assetId:'a',imageId:'i'},{id:'outsider'},repo,signer)).status,404);
});
