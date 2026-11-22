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
test('legacy signed adoption resolves the same authorized image as its object key', async () => {
  const objectKey = 'projects/p/image/old.png';
  const repository = {
    getProject: async (projectId, userId) => userId === 'member' ? { id: projectId } : null,
    listAssets: async () => [
      { id: 'adopted', image_url: `https://bucket.cos.test/${objectKey}?expired` },
      { id: 'empty', image_url: '' },
      { id: 'external', image_url: `https://other.test/${objectKey}?original` },
      { id: 'external-variant', image_url: 'https://external.test/image?name=adopted' },
    ],
    listAssetImages: async () => [
      { id: 'old', asset_id: 'adopted', object_path: objectKey },
      { id: 'new', asset_id: 'adopted', object_path: 'projects/p/image/new.png' },
      { id: 'empty-other', asset_id: 'empty', object_path: objectKey },
      { id: 'external-other', asset_id: 'external', object_path: objectKey },
      { id: 'external-variant-other', asset_id: 'external-variant', url: 'https://external.test/image?name=other' },
    ],
  };
  const payload = { projectId: 'p' };
  const response = await handleAction('assets-list', payload, { id: 'member' }, repository, signer);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.map(asset => asset.adoptedImageId), ['old', null, null, null]);
  const { adoptedAssetImage } = await import('../../core/adoptedAssetImage.js');
  assert.equal(adoptedAssetImage(response.body[0], { exact: true }).id, 'old');
  assert.equal(adoptedAssetImage(response.body[1], { exact: true }), null);
  assert.equal((await handleAction('assets-list', payload, { id: 'outsider' }, repository, signer)).status, 403);
});
test('renewal authorizes the actual image and rejects other project/asset identifiers',async()=>{
  const repo={getProject:async()=>({id:'p'}),findMedia:async(id,uid)=>uid==='u'?{id,project_id:'p',asset_id:'a',object_path:'projects/p/image/a.png'}:null};
  assert.equal((await handleAction('asset-image-url',{projectId:'p',assetId:'a',imageId:'i'},{id:'u'},repo,signer)).body.url,'https://bucket.cos.test/projects/p/image/a.png?fresh');
  assert.equal((await handleAction('asset-image-url',{projectId:'p',assetId:'other',imageId:'i'},{id:'u'},repo,signer)).status,404);
  assert.equal((await handleAction('asset-image-url',{projectId:'p',assetId:'a',imageId:'i'},{id:'outsider'},repo,signer)).status,404);
});
test('removed photo can only follow the current adopted image of its authorized asset', async()=>{
  const repo={
    getProject:async(p,u)=>p==='p'&&u==='u'?{id:'p'}:null,
    findMedia:async id=>id==='other'?{id,project_id:'other-project',asset_id:'other-asset'}:null,
    listAssets:async()=>[{id:'a',image_url:'projects/p/image/new.png'}],
    listAssetImages:async()=>[{id:'new',asset_id:'a',object_path:'projects/p/image/new.png'}],
  };
  const payload={projectId:'p',assetId:'a',imageId:'removed'};
  const stale=await handleAction('asset-image-url',payload,{id:'u'},repo,signer);
  assert.equal(stale.status,404);
  assert.equal(stale.body.code,'ASSET_IMAGE_UNAVAILABLE');
  const updated=await handleAction('asset-image-url',{...payload,followAdoptedImage:true},{id:'u'},repo,signer);
  assert.equal(updated.body.id,'new');
  assert.equal(updated.body.url,'https://bucket.cos.test/projects/p/image/new.png?fresh');
  const wrong=await handleAction('asset-image-url',{...payload,imageId:'other',followAdoptedImage:true},{id:'u'},repo,signer);
  assert.equal(wrong.status,404);
  const denied=await handleAction('asset-image-url',{...payload,followAdoptedImage:true},{id:'outsider'},repo,signer);
  assert.equal(denied.status,403);
});
test('uploaded project reference images still resolve without an art asset ID',async()=>{
 const repo={getProject:async()=>({id:'p'}),findMedia:async()=>({id:'uploaded',project_id:'p',kind:'image',object_path:'projects/p/image/ref.png'})};
 const result=await handleAction('asset-image-url',{projectId:'p',imageId:'uploaded'},{id:'u'},repo,signer);
 assert.equal(result.status,200);
 assert.equal(result.body.url,'https://bucket.cos.test/projects/p/image/ref.png?fresh');
});
test('asset seat lookup always reads the current pointer, never the old photo ID',async()=>{
 let path='projects/p/image/new.png';
 const repo={getProject:async(p,u)=>p==='p'&&u==='u'?{id:'p'}:null,
  findMedia:async()=>{throw Error('must not read yesterday’s photo');},
  findAdoptedAssetImage:async(p,id,u)=>p==='p'&&id==='a'&&u==='u'?{image_url:path,image_id:'adopted'}:null};
 const payload={projectId:'p',assetId:'a',imageId:'old',assetImageSlot:true};
 const first=await handleAction('asset-image-url',payload,{id:'u'},repo,signer);
 assert.equal(first.body.url,'https://bucket.cos.test/projects/p/image/new.png?fresh');
 for(const imageId of ['a','a:old'])assert.equal((await handleAction('asset-image-url',{projectId:'p',assetId:'a',imageId},{id:'u'},repo,signer)).body.id,'adopted');
 path='';
 assert.equal((await handleAction('asset-image-url',payload,{id:'u'},repo,signer)).body.code,'ASSET_SLOT_EMPTY');
 assert.equal((await handleAction('asset-image-url',{...payload,assetId:'other'},{id:'u'},repo,signer)).status,404);
 assert.equal((await handleAction('asset-image-url',payload,{id:'outsider'},repo,signer)).status,403);
});
