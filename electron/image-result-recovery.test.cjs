const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAAAAAAAAQCEeRdzAAAA1klEQVR4nC3PMUoDQRSA4f/NzKo4Yd1FTKURLMwNrOwsPIoHSCXWYpWLeAHxGPaCpYWaUZKJxp19Txbs/6/45S11V4ul3jmh9RjaC2LgVFJTu+uQcpkjxNwJq40wqZW+gwHklc4DJtEJxG3h4clzfihMj/4jJQYQHDYIchKel47jxqCDUW0EgCoIL+8O7eE1weO95+KyJ7RG8GIs1o71r3B2qpRP4WSsHEwM20AohbzrNU7HCvtCJUbljZ9v2BLLoRnJ7ONLb0uR1nodLjGH23GWwp6/+QMHFFqTxoOD/QAAAABJRU5ErkJggg==','base64');
const {generateImage,retryImageDownload}=require('./media-service.cjs');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'image2852-')),old=globalThis.fetch;t.after(()=>{globalThis.fetch=old;fs.rmSync(dir,{recursive:true,force:true});});return dir;}
test('477 reports the actual upstream missing-image response instead of blaming local disk; one paid POST',async t=>{
 const dir=setup(t);let posts=0,reads=0;
 globalThis.fetch=async(u,o)=>{if(o?.method==='POST'){posts++;return Response.json({data:[{url:'https://result.invalid/missing'}]});}reads++;return Response.json({error:{code:'image_download_failed',message:'源图片不存在或已过期，无法下载'}},{status:477});};
 let id;await assert.rejects(generateImage({endpoint:'https://provider.invalid/v1',model:'gpt-image-2.5',prompt:'box',destDir:dir}),e=>{id=e.downloadReceiptId;assert.equal(e.downloadReason,'upstream');assert.equal(e.httpStatus,477);assert.match(e.message,/源图片不存在或已过期/);assert.doesNotMatch(e.message,/检查本地资料目录|磁盘空间|图片已生成/);return !!id;});
 await assert.rejects(retryImageDownload(id,dir),e=>e.httpStatus===477);assert.equal(posts,1);assert.equal(reads,2);
});
test('a URL returning HTML 200 is not saved as an image or reported as generated',async t=>{
 const dir=setup(t);globalThis.fetch=async(u,o)=>o?.method==='POST'?Response.json({data:[{url:'https://result.invalid/login'}]}):new Response('<html>please login</html>',{headers:{'content-type':'text/html'}});
 await assert.rejects(generateImage({endpoint:'https://provider.invalid/v1',model:'gpt-image-2.5',prompt:'box',destDir:dir}),e=>e.downloadReason==='invalid');assert.equal(fs.readdirSync(dir).filter(n=>n.endsWith('.png')).length,0);
});
test('GPT-compatible requests prefer inline bytes and recovery survives successful download before acknowledgement',async t=>{
 const dir=setup(t);let posts=0,reads=0,available=false;
 globalThis.fetch=async(u,o)=>{if(o?.method==='POST'){posts++;assert.equal(JSON.parse(o.body).response_format,'b64_json');return Response.json({data:[{url:'https://result.invalid/image'}]});}reads++;return available?new Response(png,{headers:{'content-type':'image/png'}}):new Response('',{status:503});};
 let id;await assert.rejects(generateImage({endpoint:'https://provider.invalid/v1',model:'gpt-image-2.5',prompt:'box',destDir:dir}),e=>{id=e.downloadReceiptId;return !!id;});available=true;const result=await retryImageDownload(id,dir);assert.deepEqual(fs.readFileSync(result),png);const count=reads;assert.equal(await retryImageDownload(id,dir),result);assert.equal(reads,count);assert.equal(posts,1);assert(fs.existsSync(path.join(dir,'.pending-image-downloads',id+'.json')));
});

test('official GPT uses its inline default while unrelated models retain URL format; no download for inline bytes',async t=>{
 const dir=setup(t);let posts=0;
 globalThis.fetch=async(u,o)=>{assert.equal(o.method,'POST');posts++;const b=JSON.parse(o.body);assert.equal(b.response_format,posts===1?undefined:'url');return Response.json({data:[{b64_json:png.toString('base64')}]});};
 await generateImage({endpoint:'https://api.openai.com/v1',model:'gpt-image-1',prompt:'box',destDir:dir});await generateImage({endpoint:'https://provider.invalid/v1',model:'other-model',prompt:'box',destDir:dir});assert.equal(posts,2);
});

test('an empty upstream response is invalid content, not a local save failure',async t=>{
 const dir=setup(t);globalThis.fetch=async(u,o)=>o?.method==='POST'?Response.json({data:[{url:'https://result.invalid/empty'}]}):new Response('');
 await assert.rejects(generateImage({endpoint:'https://provider.invalid/v1',model:'image',prompt:'box',destDir:dir}),e=>e.downloadReason==='invalid'&&!/检查本地资料目录/.test(e.message));
});

test('verified inline bytes survive a local write failure and retry never resubmits generation',async t=>{
 const dir=setup(t);let posts=0;globalThis.fetch=async()=>{posts++;return Response.json({data:[{b64_json:png.toString('base64')}]});};
 const rename=fs.renameSync;let id;
 fs.renameSync=(from,to)=>{if(String(to).endsWith('.png'))throw Object.assign(Error('disk full'),{code:'ENOSPC'});return rename(from,to);};
 try{await assert.rejects(generateImage({endpoint:'https://provider.invalid/v1',model:'gpt-image-2.5',prompt:'box',destDir:dir}),e=>{id=e.downloadReceiptId;return e.downloadReason==='save'&&e.imageVerified===true&&/磁盘空间/.test(e.message);});}finally{fs.renameSync=rename;}
 assert.deepEqual(fs.readFileSync(await retryImageDownload(id,dir)),png);assert.equal(posts,1);
});
