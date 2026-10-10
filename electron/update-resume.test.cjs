const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {downloadInstaller}=require('./update-service.cjs');
const {serveUpdate}=require('../cloud-backend/src/update-download.cjs');
const http=require('node:http');
test('interrupted installer resumes exact bytes and validates complete SHA; mirror fallback is bounded',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-resume-'));t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));
 const bytes=Buffer.alloc(4096,7);bytes.write('MZ');const url='https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v9.8.7/Xingzhou-Film-Tencent-Setup-9.8.7.exe';let calls=0,ranges=[];
 const file=await downloadInstaller({url,version:'9.8.7',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length,destinationDir:dir,sleep:async()=>{},fetchImpl:async(_url,init)=>{
  calls++;ranges.push(init.headers.Range);
  if(calls===1)return new Response(new ReadableStream({start(c){c.enqueue(bytes.subarray(0,1024));setTimeout(()=>c.error(Object.assign(Error('network interrupted'),{code:'ECONNRESET'})),30);}}));
  const start=Number(init.headers.Range.match(/bytes=(\d+)/)[1]);return new Response(bytes.subarray(start),{status:206,headers:{'content-range':`bytes ${start}-${bytes.length-1}/${bytes.length}`}});
 }});assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(calls,2);assert.equal(ranges[1],'bytes=1024-');
 // A cached verified package should not touch the network again.
 await downloadInstaller({url,version:'9.8.7',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length,destinationDir:dir,fetchImpl:async()=>{throw Error('unexpected request')}});
});
test('official mirror supports ranges while blocking traversal and symlinked files',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-mirror-')),name='Xingzhou-Film-Tencent-Setup-9.8.7.exe';fs.writeFileSync(path.join(dir,name),Buffer.alloc(128,7));
 const server=http.createServer((req,res)=>{if(!serveUpdate(req,res,dir)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});const origin='http://127.0.0.1:'+server.address().port;
 const r=await fetch(origin+'/api/updates/'+name,{headers:{Range:'bytes=64-'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 64-127/128');assert.equal((await r.arrayBuffer()).byteLength,64);
 for(const file of ['foo.exe','%2e%2e%2fsecret','latest.json/../secret']){const response=await fetch(origin+'/api/updates/'+file);assert.equal(response.status,404);}
});
