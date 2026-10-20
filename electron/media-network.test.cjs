const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {readMediaBytes}=require('./media-network.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAAAAAAAAQCEeRdzAAAA1klEQVR4nC3PMUoDQRSA4f/NzKo4Yd1FTKURLMwNrOwsPIoHSCXWYpWLeAHxGPaCpYWaUZKJxp19Txbs/6/45S11V4ul3jmh9RjaC2LgVFJTu+uQcpkjxNwJq40wqZW+gwHklc4DJtEJxG3h4clzfihMj/4jJQYQHDYIchKel47jxqCDUW0EgCoIL+8O7eE1weO95+KyJ7RG8GIs1o71r3B2qpRP4WSsHEwM20AohbzrNU7HCvtCJUbljZ9v2BLLoRnJ7ONLb0uR1nodLjGH23GWwp6/+QMHFFqTxoOD/QAAAABJRU5ErkJggg==','base64');
test('desktop media transport downloads with system proxy without forwarding provider credentials',async()=>{
 const {configureMediaFetch}=require('./media-network.cjs');let requests=0;
 configureMediaFetch(async(url,options)=>{requests++;assert.equal(url,'https://result.test/a');assert.equal(options.method,'GET');assert.equal(options.headers,undefined);return new Response('desktop-image');});
 try{assert.equal((await readMediaBytes('https://result.test/a')).bytes.toString(),'desktop-image');assert.equal(requests,1);}finally{configureMediaFetch(null);}
});
test('expired result is identified rather than asking for endless retries; embedded result takes priority',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-image-result-')),original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({data:[{url:'https://dead.test/image',b64_json:png.toString('base64')}]});
 try{
  const {generateImage,retryImageDownload,pendingImageSource}=require('./media-service.cjs');
  const file=await generateImage({endpoint:'https://provider.test/v1',model:'image',prompt:'test',destDir:dir});assert.deepEqual(fs.readFileSync(file),png);
  globalThis.fetch=async(url,options)=>options?.method==='POST'?Response.json({data:[{url:'https://dead.test/image'}]}):new Response('',{status:403});
  let id;await assert.rejects(generateImage({endpoint:'https://provider.test/v1',model:'image',prompt:'test',destDir:dir}),e=>{id=e.downloadReceiptId;return e.downloadReason==='upstream'&&e.httpStatus===403&&/上游表示/.test(e.message);});
  assert.equal(pendingImageSource(id,dir),'https://dead.test/image');assert.throws(()=>retryImageDownload('../secret',dir),/恢复记录无效/);
 }finally{globalThis.fetch=original;fs.rmSync(dir,{recursive:true,force:true});}
});
test('GET retries interrupted bodies, but does not retry missing objects',async()=>{
 let calls=0;
 const result=await readMediaBytes('https://image.test/a',{delayMs:0,fetchFn:async()=>{calls++;return calls===1?{ok:true,arrayBuffer:async()=>{throw Error('terminated');}}:new Response('png');}});
 assert.equal(result.bytes.toString(),'png');assert.equal(calls,2);
 calls=0;await assert.rejects(readMediaBytes('https://image.test/a',{delayMs:0,fetchFn:async()=>{calls++;return new Response('',{status:404});}}),/404/);assert.equal(calls,1);
});
test('paid POST is sent once; failed image download resumes from persisted receipt',async()=>{
 const original=globalThis.fetch;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-image-recovery-'));let posts=0,reads=0,recover=false,receipt;
 globalThis.fetch=async(url,options)=>{if(options?.method==='POST'){posts++;return Response.json({data:[{url:'https://result.test/image'}]});}reads++;assert.equal(options?.headers?.Authorization,undefined);if(!recover)return new Response('',{status:404});return new Response(png);};
 try{const {generateImage,retryImageDownload}=require('./media-service.cjs');await assert.rejects(generateImage({endpoint:'https://provider.test/v1',apiKey:'secret',model:'image',prompt:'test',destDir:dir}),e=>{receipt=e.downloadReceiptId;return Boolean(receipt);});assert.equal(posts,1);recover=true;const file=await retryImageDownload(receipt,dir);assert.deepEqual(fs.readFileSync(file),png);assert.equal(posts,1);assert.equal(reads,2);}
 finally{globalThis.fetch=original;fs.rmSync(dir,{recursive:true,force:true});}
});
