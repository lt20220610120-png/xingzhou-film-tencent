const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {Readable} = require('node:stream');

const projectId = 'ba9b16f4-9b10-493d-b5df-2b806b91c031';
const imageId = 'efb09eaa-2d40-4f03-b3d4-d8a0844bc0c0';
const assetId = '11d303b7-2baf-4706-b8f2-6308b42fd41d';
const audioId = 'be318175-e8b2-4c11-85d1-86d3924f70cb';
const imageKey = `projects/${projectId}/image/123-asset.png`;
const audioKey = `projects/${projectId}/audio/456-asset.wav`;
const imageUrl = `https://example.test/${imageKey}?q-signature=fixture`;
const image = {id:imageId, projectId, assetId, kind:'asset-image', objectKey:imageKey, url:imageUrl, filename:'画面.png', mime:'image/png'};
const withRefs = references => ({id:projectId, episodes:[{id:'episode', storyboardPrompts:[{id:'shot', generationConfig:{references}}]}]});
const refs = value => value.project.episodes[0].storyboardPrompts[0].generationConfig.references;

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xz-local-project-media-'));
  let root = path.join(directory, 'managed');
  const {createLocalProjectMedia} = require('./local-project-media.cjs');
  const helper = createLocalProjectMedia({root:()=>root, ...options});
  t.after(() => fs.rm(directory, {recursive:true, force:true}));
  return {helper, directory, get root(){return root;}, move:next=>{root=next;}};
}

test('stores a selected file in the project and rebuilds playback paths after changing data directory', async t => {
  const f = await fixture(t);
  const selected = path.join(f.directory, '示例.wav');
  await fs.writeFile(selected, 'audio bytes');
  const stored = await f.helper.storeFile({projectId, filePath:selected, id:audioId, kind:'audio'});
  assert.equal(stored.filename, '示例.wav');
  assert.equal(stored.mime, 'audio/wav');
  assert.equal(await fs.readFile(stored.filePath, 'utf8'), 'audio bytes');
  assert.equal(stored.url, `xzmedia://local/${encodeURIComponent(stored.filePath)}`);
  assert.equal(path.isAbsolute(stored.localPath), false);
  const moved = path.join(f.directory, 'new data');
  await fs.rename(f.root, moved);
  f.move(moved);
  const materialized = f.helper.materialize({project:{id:projectId}, assets:[], media:[stored]});
  assert.equal(materialized.media[0].filePath, path.join(moved, stored.localPath));
  assert.equal(await fs.readFile(materialized.media[0].filePath, 'utf8'), 'audio bytes');
  await assert.rejects(f.helper.storeFile({projectId:'../escape', filePath:selected,kind:'audio'}), /项目编号/);
  await assert.rejects(f.helper.storeFile({projectId,filePath:selected,kind:'image'}), /格式|类型/);
});

test('captures one cloud object for the asset, media and nested reference while preserving identities', async t => {
  const seen = [];
  const f = await fixture(t,{download:async row=>{seen.push(row.objectKey);return Buffer.from('image bytes');}});
  const project = withRefs([{id:imageId, imageId, projectId, assetId, kind:'image', url:imageUrl+'-older'}]);
  const asset = {id:assetId, project_id:projectId, image_url:imageUrl, adoptedImageId:imageId, images:[image]};
  const captured = await f.helper.capture({project,assets:[asset],media:[image]});
  assert.equal(captured.media[0].id,imageId);
  assert.equal(captured.assets[0].adoptedImageId,imageId);
  assert.equal(captured.assets[0].image_url,captured.media[0].url);
  assert.equal(refs(captured)[0].filePath,captured.media[0].filePath);
  assert.equal(refs(captured)[0].objectKey,imageKey);
  assert.equal(await fs.readFile(captured.assets[0].images[0].filePath,'utf8'),'image bytes');
  assert.equal(JSON.stringify(captured).includes('q-signature'),false);
  await f.helper.capture({project,assets:[asset],media:[{...image,url:imageUrl+'-renewed'}]});
  assert.deepEqual(seen,[imageKey]);
  await fs.writeFile(captured.media[0].filePath,'wrong bytes');
  const repaired=await f.helper.capture({project,assets:[asset],media:[image]});
  assert.equal(await fs.readFile(repaired.media[0].filePath,'utf8'),'image bytes');
  assert.deepEqual(seen,[imageKey,imageKey]);
});

test('a truncated cloud transfer leaves no completed blob and capture retries with a fresh body', async t => {
  let count=0;
  const f=await fixture(t,{download:async()=>{count++;return count===1?{body:Readable.from([Buffer.from('half')]),size:10}:{bytes:Buffer.from('valid data'),size:10};}});
  const bundle={project:{id:projectId}, assets:[], media:[image]};
  await assert.rejects(f.helper.capture(bundle),/下载|完整/);
  const captured=await f.helper.capture(bundle);
  assert.equal(await fs.readFile(captured.media[0].filePath,'utf8'),'valid data');
  assert.equal(count,2);
});

test('ignores paths from a cloud snapshot and leaves unavailable references marked', async t => {
  const f=await fixture(t);
  const arbitrary=path.join(f.directory,'private.wav');
  await fs.writeFile(arbitrary,'must not read');
  const captured=await f.helper.capture({project:withRefs([{id:'unknown',projectId,kind:'audio',filePath:arbitrary,url:'http://127.0.0.1/private.wav'}]),assets:[],media:[]});
  assert.equal(refs(captured)[0].localUnavailable,true);
  assert.equal(refs(captured)[0].filePath,undefined);
  assert.equal(refs(captured)[0].url,undefined);
});

test('shares prior cloud media by key and uploads new bytes once while keeping reference aliases', async t => {
  const uploads=[];
  const f=await fixture(t,{upload:async (id,file,kind)=>{uploads.push({id,file,kind});return {objectKey:audioKey,url:`https://example.test/${audioKey}?q-signature=fixture`};}});
  const selected=path.join(f.directory,'语音.wav');
  await fs.writeFile(selected,'voice bytes');
  const stored=await f.helper.storeFile({projectId,filePath:selected,id:audioId,kind:'audio'});
  const media=[image,{...stored,id:audioId,projectId,note:'参考素材 音色',legacy:{apiKey:'local-key-fixture',url:imageUrl,filePath:stored.filePath}}];
  const project=withRefs([{id:imageId,assetId,imageId,projectId,kind:'image',url:imageUrl},{...stored,id:'voice:主演:a',mediaId:audioId,projectId}]);
  project.script='C:/片场文件夹是剧情的一部分\n下一句仍应保留';
  project.episodes[0].storyboardPrompts[0].generationConfig.apiKey='local-key-fixture';
  const assets=[{id:assetId,project_id:projectId,adoptedImageId:imageId,image_url:imageUrl,images:[image]}];
  const shared=await f.helper.prepareShare({project,assets,media});
  assert.equal(uploads.length,1);
  assert.equal(uploads[0].kind,'audio');
  assert.equal(await fs.readFile(uploads[0].file,'utf8'),'voice bytes');
  assert.equal(shared.media.find(r=>r.id===imageId).objectKey,imageKey);
  assert.equal(shared.media.find(r=>r.id===audioId).objectKey,audioKey);
  assert.equal(shared.assets[0].image_url,imageKey);
  assert.equal(shared.project.script,project.script);
  assert.equal(refs(shared)[1].id,'voice:主演:a');
  assert.equal(refs(shared)[1].mediaId,audioId);
  assert.equal(refs(shared)[1].objectKey,audioKey);
  assert.doesNotMatch(JSON.stringify(shared),/local-key-fixture|q-signature|filePath|localPath|xzmedia:\/\//);
});

test('sharing marks an unverified attachment unavailable without reading its path or blocking the project', async t => {
  const f=await fixture(t,{upload:async()=>assert.fail('must not upload an unverified path')});
  const other=path.join(f.directory,'private.wav');
  await fs.writeFile(other,'private bytes');
  const stored=await f.helper.storeFile({projectId,filePath:other,id:audioId,kind:'audio'});
  const shared=await f.helper.prepareShare({project:withRefs([{id:'voice:主演:a',projectId,kind:'audio',filePath:other,url:'https://provider.test/private.wav?token=private'}]),assets:[],media:[{...stored,objectKey:audioKey}]});
  assert.deepEqual(refs(shared)[0],{id:'voice:主演:a',projectId,kind:'audio',localUnavailable:true});
  assert.equal(shared.unavailableCount,1);
});

test('missing managed files are marked while known cloud media can be shared without a local copy',async t=>{
 const f=await fixture(t,{upload:async()=>assert.fail('no file should be uploaded')});
 const file=path.join(f.directory,'voice.wav');await fs.writeFile(file,'voice');
 const stored=await f.helper.storeFile({projectId,filePath:file,id:audioId,kind:'audio'});await fs.unlink(stored.filePath);
 const shared=await f.helper.prepareShare({project:withRefs([{...stored,id:'voice:主演:a',mediaId:audioId},{id:imageId,kind:'image',imageId}]),assets:[],media:[stored,{...image,kind:'image',assetId:undefined,localUnavailable:true}]});
 assert.equal(refs(shared)[0].localUnavailable,true);assert.equal(refs(shared)[1].objectKey,imageKey);
 assert.equal(shared.unavailableCount,1);assert.deepEqual(shared.media.map(m=>m.id),[imageId]);
});

test('captures a verified adopted voice and shares both aliases through the same record', async t => {
  let verifiedPath;
  const f=await fixture(t,{resolveLocalReference:async ref=>ref.id.startsWith('voice:')?verifiedPath:null,upload:async()=>({objectKey:audioKey})});
  verifiedPath=path.join(f.directory,'voice.wav');
  await fs.writeFile(verifiedPath,'selected voice');
  const reference={id:'voice:主演:a',projectId,kind:'audio',filePath:verifiedPath};
  const project=withRefs([reference,{...reference,id:'voice:演员:a'}]);
  const captured=await f.helper.capture({project,assets:[],media:[]});
  assert.equal(captured.media.length,1);
  assert.equal(await fs.readFile(captured.media[0].filePath,'utf8'),'selected voice');
  const shared=await f.helper.prepareShare(captured);
  assert.deepEqual(refs(shared).map(ref=>ref.id),['voice:主演:a','voice:演员:a']);
  assert.equal(refs(shared)[0].mediaId,refs(shared)[1].mediaId);
  assert.deepEqual(refs(shared).map(ref=>ref.objectKey),[audioKey,audioKey]);
});

test('local audio and video retain their media type through the collaboration upload', async t=>{
  const f=await fixture(t);
  const {configureCloudFetch}=require('./cloud-access-service.cjs');
  const {configureAPIFetch}=require('./win-ai-api-fetch.cjs');
  const {uploadToBucket}=require('./collab-service.cjs');
  const signed=[],received=[];
  configureCloudFetch(async (_url,init)=>{
    const request=JSON.parse(init.body);
    signed.push([request.kind,request.mime]);
    return Response.json({url:'https://bucket.invalid/fixture',contentType:request.mime,objectKey:'fixture',authorization:'fixture'});
  });
  configureAPIFetch(async (_url,init)=>{
    received.push([init.headers['Content-Type'],Buffer.from(init.body).toString()]);
    return new Response(null,{status:200});
  });
  t.after(()=>{configureCloudFetch(undefined);configureAPIFetch(undefined);});
  for(const [ext,kind,mime] of [['flac','audio','audio/flac'],['aac','audio','audio/aac'],['ogg','audio','audio/ogg'],['m4a','audio','audio/mp4'],['mp4','audio','audio/mp4'],['mp4','video','video/mp4']]){
    const selected=path.join(f.directory,'fixture.'+ext);
    const bytes='fixture-'+kind+'-'+ext;
    await fs.writeFile(selected,bytes);
    const stored=await f.helper.storeFile({projectId,filePath:selected,kind});
    const uploaded=await uploadToBucket(projectId,stored.filePath,stored.kind,'fixture');
    assert.deepEqual([stored.kind,stored.mime],[kind,mime]);
    assert.deepEqual([uploaded.kind,uploaded.mime],[kind,mime]);
    assert.deepEqual(signed.at(-1),[kind,mime]);
    assert.deepEqual(received.at(-1),[mime,bytes]);
  }
});
