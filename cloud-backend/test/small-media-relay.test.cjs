const test = require('node:test');
const assert = require('node:assert/strict');
const {createCosSigner} = require('../src/cos.cjs');
const {createSmallMediaRelay} = require('../src/small-media-relay.cjs');

const signer=createCosSigner({secretId:'fixture',secretKey:'fixture',bucket:'mock',region:'ap-guangzhou'});
const objectKey='projects/demo/image/123-asset.jpg';
const signed=signer.signDownload({objectKey}).url;
const preflight=async(fn,url=signed)=>fn({url},{id:'creator'},{getProject:async(id)=>id==='demo'});
const partial=(size,total=size)=>new Response(Buffer.alloc(size,7),{status:206,headers:{
  'content-type':'image/jpeg','content-range':`bytes 0-${size-1}/${total}`,'content-length':String(size),
}});

test('the small media route authorizes each object, skips contention and returns original bytes',async()=>{
  let release;
  const read=createSmallMediaRelay({signer,fetchFn:async(_url,{headers})=>{
    assert.equal(headers.Range,'bytes=0-196607');
    await new Promise(resolve=>{release=resolve});
    return partial(50);
  }});
  const first=preflight(read);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await preflight(read)).route,'busy');
  release();
  const result=await first;
  assert.equal(result.route,'relay');
  assert.deepEqual(Buffer.from(result.base64,'base64'),Buffer.alloc(50,7));
  assert.equal((await preflight(read)).route,'busy');
});

test('large, invalid, unauthorised and stalled media stays on the original route',async t=>{
  let attempts=0;
  const read=createSmallMediaRelay({signer,timeoutMs:20,fetchFn:async()=>{attempts++;return partial(50,300000);}});
  assert.equal((await preflight(read,signed.replace('123-asset','124-asset'))).route,'ineligible');
  assert.equal((await read({url:signed},{id:'other'},{getProject:async()=>null})).route,'denied');
  assert.equal((await preflight(read,signer.signDownload({objectKey:'projects/demo/video/clip.mp4'}).url)).route,'ineligible');
  assert.equal((await preflight(read)).route,'large');
  assert.equal(attempts,1);
  const keepAlive=setTimeout(()=>{},1000);
  t.after(()=>clearTimeout(keepAlive));
  const stalled=createSmallMediaRelay({signer,timeoutMs:20,fetchFn:async(_url,{signal})=>new Promise((_,reject)=>{
    signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
  })});
  assert.equal((await preflight(stalled)).route,'unavailable');
});
