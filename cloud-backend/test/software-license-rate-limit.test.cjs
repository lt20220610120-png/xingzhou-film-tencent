const test=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('../src/server.cjs');
test('受信任反向代理按真实客户端地址限流，不让一个客户端阻断另一个登录',async t=>{
 const repo={licenseState:async()=>({exempt:false,grant:null}),findBySession:async()=>null,findUser:async()=>null};
 const server=createServer({API_SECRET:'test',DATABASE_URL:'unused',PORT:'0',TRUST_PROXY:'1'},{repository:repo,mailer:null,cosSigner:null,logger:{error(){}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+'/api/gateway';
 const call=async(action,forwarded)=>fetch(url,{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':forwarded},body:JSON.stringify({action})});
 for(let i=0;i<120;i++)assert.equal((await call('license-check','203.0.113.'+i+', 198.51.100.10')).status,403);
 assert.equal((await call('license-check','203.0.113.200, 198.51.100.10')).status,429,'客户端伪造的前段地址不能绕过代理限流');
 assert.notEqual((await call('login','198.51.100.11')).status,429);
});
