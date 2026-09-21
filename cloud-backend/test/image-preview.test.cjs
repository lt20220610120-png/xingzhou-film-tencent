const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createImagePreview } = require('../src/image-preview.cjs');

test('preview reduces real pixels, coalesces downloads, and reuses disk cache after restart', async t => {
  const sharp = require('sharp');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xz-thumb-'));
  t.after(() => fs.rm(directory, {recursive:true, force:true}));
  const original = await sharp({create:{width:1600,height:1200,channels:4,background:'#4488aa'}}).png().toBuffer();
  let downloads = 0;
  const options = { directory, host:'bucket.cos.test', fetchFn:async () => {
    downloads++; return new Response(original, {headers:{'content-type':'image/png'}});
  }};
  const image = {objectKey:'projects/p/image/1-a.png', url:'https://bucket.cos.test/projects/p/image/1-a.png?signature=old'};
  const preview = createImagePreview(options);
  const [a,b] = await Promise.all([preview(image),preview(image)]);
  assert.equal(a,b); assert.equal(downloads,1);
  const bytes = Buffer.from(a.split(',')[1], 'base64');
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format,'webp'); assert.equal(metadata.width,640); assert.equal(metadata.height,480);
  assert.ok(bytes.length < original.length);
  assert.equal(await createImagePreview(options)({...image,url:image.url.replace('old','new')}),a);
  assert.equal(downloads,1);
});

test('preview will not fetch external URLs, mismatched keys or oversized responses', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'xz-thumb-'));
  t.after(() => fs.rm(directory,{recursive:true,force:true}));
  const valid = {objectKey:'projects/p/image/1-a.png',url:'https://bucket.cos.test/projects/p/image/1-a.png'};
  let calls = 0;
  const preview = createImagePreview({directory,host:'bucket.cos.test',fetchFn:async()=>{
    calls++;return new Response('bad',{headers:{'content-length':40*1024*1024}});
  }});
  assert.equal(await preview({...valid,url:'https://external.test/a.png'}),null);
  assert.equal(await preview({...valid,objectKey:'projects/other/image/a.png'}),null);
  assert.equal(calls,0);
  assert.equal(await preview(valid),null);
  assert.equal(calls,1);
});

test('warm previews bypass busy generation and queued previews fall back within a bounded wait',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'xz-thumb-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const bytes=await require('sharp')({create:{width:10,height:10,channels:3,background:'red'}}).png().toBuffer();
  let unblock;const gate=new Promise(resolve=>{unblock=resolve;});let blocked=false,downloads=0;
  const preview=createImagePreview({directory,host:'bucket.cos.test',queueWaitMs:20,fetchFn:async()=>{downloads++;if(blocked)await gate;return new Response(bytes);}});
  const image=name=>({objectKey:`projects/p/image/${name}.png`,url:`https://bucket.cos.test/projects/p/image/${name}.png`});
  const warm=await preview(image('warm'));blocked=true;
  const jobs=[preview(image('cold1')),preview(image('cold2'))];
  try {
    while(downloads<3)await new Promise(resolve=>setTimeout(resolve,2));
    const result=await Promise.race([preview(image('warm')),new Promise(resolve=>setTimeout(()=>resolve('timeout'),200))]);
    assert.equal(result,warm);
    assert.equal(await Promise.race([preview(image('queued')),new Promise(resolve=>setTimeout(()=>resolve('timeout'),200))]),null);
  } finally {unblock();await Promise.all(jobs);}
});
