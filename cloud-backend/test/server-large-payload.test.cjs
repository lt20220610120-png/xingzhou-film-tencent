const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require(process.env.XINGZHOU_TEST_SERVER_MODULE || '../src/server.cjs');

test('17 MiB 项目保存请求到达业务鉴权层，而不是被传输限制重置',async()=>{
 const server=createServer({API_SECRET:'test',DATABASE_URL:'postgres://test'},{repository:{findBySession:async()=>null},mailer:null,cosSigner:null});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/gateway`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'project-update',updates:{script:'x'.repeat(17*1024*1024)}})});
  assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'请先登录账号'});
 }finally{await new Promise(r=>server.close(r));}
});

test('超过 64 MiB 的请求返回可诊断的 JSON 413，而不是断连形成假网络错误',async()=>{
 const server=createServer({API_SECRET:'test',DATABASE_URL:'postgres://test'},{repository:{findBySession:async()=>null},mailer:null,cosSigner:null});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/gateway`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'project-update',updates:{script:'x'.repeat(65*1024*1024)}})});
  assert.equal(response.status,413);assert.deepEqual(await response.json(),{error:'项目数据过大，请分批保存或精简后重试'});
 }finally{await new Promise(r=>server.close(r));}
});

test('压缩的大型项目保存请求可正常解压并到达业务鉴权层',async()=>{
 const {gzipSync}=require('node:zlib');
 const server=createServer({API_SECRET:'test',DATABASE_URL:'postgres://test'},{repository:{findBySession:async()=>null},mailer:null,cosSigner:null});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const body=gzipSync(JSON.stringify({action:'project-update',updates:{script:'项目内容'.repeat(3*1024*1024)}}));
  assert.ok(body.length<1024*1024);
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/gateway`,{method:'POST',headers:{'content-type':'application/json','content-encoding':'gzip'},body});
  assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'请先登录账号'});
 }finally{await new Promise(r=>server.close(r));}
});
