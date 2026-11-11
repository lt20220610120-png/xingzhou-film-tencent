const test=require('node:test'),assert=require('node:assert/strict');
const {gateway}=require('./cloud-access-service.cjs');
test('storyboard save does not resend after its full gateway deadline',async()=>{
 const original=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return new Promise(()=>{});};
 try{await assert.rejects(gateway('storyboard-patch',{operation:'create',shotId:'stable'},'test',{timeoutMs:20}),/未确认本次保存/);assert.equal(calls,1);}finally{global.fetch=original;}
});
test('ambiguous non-idempotent write is not replayed and total outage is bounded',async()=>{
 const original=global.fetch;let count=0;global.fetch=async()=>{count++;return new Promise(()=>{});};
 try{await assert.rejects(gateway('project-create',{},'',{timeoutMs:15}),/未确认/);assert.equal(count,1);const start=Date.now();await assert.rejects(gateway('project-list',{},'',{timeoutMs:15}),/当前内容已保留/);assert.ok(Date.now()-start<1000);}finally{global.fetch=original;}
});
test('large project saves are gzip-compressed before upload while preserving JSON payload',async()=>{
 const {gzipSync,gunzipSync}=require('node:zlib'),original=global.fetch;let captured;
 global.fetch=async(_url,init)=>{captured=init;return new Response(JSON.stringify({error:'请先登录账号'}),{status:401,headers:{'content-type':'application/json'}});};
 try{
  const marker='大型项目'.repeat(400000);
  await assert.rejects(gateway('project-update',{projectId:'p',updates:{script:marker}},'token'),/请先登录账号|401|云端请求失败/);
  assert.equal(captured.headers['Content-Encoding'],'gzip');
  const decoded=JSON.parse(gunzipSync(captured.body).toString('utf8'));
  assert.equal(decoded.action,'project-update');assert.equal(decoded.updates.script,marker);
  assert.equal(Number(captured.headers['Content-Length']),captured.body.length);
  assert.ok(gzipSync(Buffer.from(JSON.stringify(decoded))).length<2*1024*1024);
 }finally{global.fetch=original;}
});
