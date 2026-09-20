const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCosImageCache } = require('./cos-image-cache.cjs');
const host = 'xingzhou-media-test-1469762028.cos.ap-guangzhou.myqcloud.com';
const url = (signature = 'a', file = '1-image.png') => `https://${host}/projects/p/image/${file}?q-signature=${signature}&q-key-time=1;9999999999`;
function setup(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-cos-cache-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  return {dir, cache:createCosImageCache({directory:dir, ...options})};
}
test('renewed signed URLs and simultaneous readers share one download, including after restart', async t => {
  const {dir, cache} = setup(t); let calls = 0;
  const load = async () => { calls++; await new Promise(r=>setTimeout(r,10)); return {bytes:Buffer.from('original'), mime:'image/png'}; };
  const [a,b] = await Promise.all([cache.read(url(), 'alice', load), cache.read(url('b'), 'alice', load)]);
  assert.equal(calls, 1); assert.deepEqual(a.bytes, b.bytes);
  const reopened = createCosImageCache({directory:dir});
  assert.equal((await reopened.read(url('c'), 'alice', load)).bytes.toString(), 'original');
  assert.equal(calls, 1);
  assert.equal(fs.readFileSync(a.filePath, 'utf8'), 'original');
});
test('accounts and object paths remain isolated; corrupt files download again', async t => {
  const {cache} = setup(t); let calls = 0;
  const load = async () => ({bytes:Buffer.from(`image-${++calls}`),mime:'image/png'});
  const a = await cache.read(url(), 'alice', load);
  await cache.read(url(), 'bob', load);
  await cache.read(url('a','2-image.png'), 'alice', load);
  fs.writeFileSync(a.filePath, 'corrupt');
  assert.equal((await cache.read(url(), 'alice', load)).bytes.toString(), 'image-4');
  assert.equal(calls,4);
});
test('external, unsigned, expired and transformed URLs bypass the cache', async t => {
  const {cache} = setup(t); let calls=0;
  const load = async () => {calls++; return {bytes:Buffer.from('image'),mime:'image/png'};};
  for(const address of [url().replace(host,'external.test'),url().split('?')[0],url().replace('9999999999','2'),url()+'&imageMogr2=thumbnail/200x',url()]) {
    const scope = address === url() ? '' : 'alice';
    await cache.read(address,scope,load); await cache.read(address,scope,load);
  }
  assert.equal(calls,10);
});
test('failed downloads are not saved and can be retried', async t => {
  const {cache} = setup(t);
  await assert.rejects(cache.read(url(),'alice',async()=>{throw Error('interrupted');}),/interrupted/);
  assert.equal((await cache.read(url(),'alice',async()=>({bytes:Buffer.from('complete'),mime:'image/png'}))).bytes.toString(),'complete');
});
test('disk cache evicts older entries within the byte limit and skips oversized images', async t => {
  const {dir,cache} = setup(t,{maxBytes:8,maxEntryBytes:8});
  const load = async()=>({bytes:Buffer.from('12345'),mime:'image/png'});
  const first=await cache.read(url(),'alice',load);
  const second=await cache.read(url('a','2-image.png'),'alice',load);
  assert.equal(fs.existsSync(first.filePath),false); assert.equal(fs.existsSync(second.filePath),true);
  const large=await cache.read(url('a','3-image.png'),'alice',async()=>({bytes:Buffer.alloc(9),mime:'image/png'}));
  assert.equal(large.filePath,undefined);
  assert.ok(fs.readdirSync(dir).filter(x=>!x.endsWith('.json')).reduce((sum,x)=>sum+fs.statSync(path.join(dir,x)).size,0)<=8);
});
