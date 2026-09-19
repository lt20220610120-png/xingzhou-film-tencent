const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {readMediaBytes}=require('./media-network.cjs');
test('GET retries interrupted bodies, but does not retry missing objects',async()=>{
 let calls=0;
 const result=await readMediaBytes('https://image.test/a',{delayMs:0,fetchFn:async()=>{calls++;return calls===1?{ok:true,arrayBuffer:async()=>{throw Error('terminated');}}:new Response('png');}});
 assert.equal(result.bytes.toString(),'png');assert.equal(calls,2);
 calls=0;await assert.rejects(readMediaBytes('https://image.test/a',{delayMs:0,fetchFn:async()=>{calls++;return new Response('',{status:404});}}),/404/);assert.equal(calls,1);
});
test('paid POST is sent once; failed image download resumes from persisted receipt',async()=>{
 const original=globalThis.fetch;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-image-recovery-'));let posts=0,reads=0,recover=false,receipt;
 globalThis.fetch=async(url,options)=>{if(options?.method==='POST'){posts++;return Response.json({data:[{url:'https://result.test/image'}]});}reads++;assert.equal(options?.headers?.Authorization,undefined);if(!recover)return new Response('',{status:404});return new Response('image-bytes');};
 try{const {generateImage,retryImageDownload}=require('./media-service.cjs');await assert.rejects(generateImage({endpoint:'https://provider.test/v1',apiKey:'secret',model:'image',prompt:'test',destDir:dir}),e=>{receipt=e.downloadReceiptId;return Boolean(receipt);});assert.equal(posts,1);recover=true;const file=await retryImageDownload(receipt,dir);assert.equal(fs.readFileSync(file,'utf8'),'image-bytes');assert.equal(posts,1);assert.equal(reads,2);}
 finally{globalThis.fetch=original;fs.rmSync(dir,{recursive:true,force:true});}
});
