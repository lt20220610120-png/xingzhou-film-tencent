const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {createSessionStore}=require('./session-store.cjs');const {createCloudAccessService}=require('./cloud-access-service.cjs');
function encryption(){const key=crypto.randomBytes(32);return {isEncryptionAvailable:()=>true,encryptString(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]);},decryptString(bytes){const cipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');}};}
function directory(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-session-security-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('旧明文会话自动迁移、凭证不再明文落盘，其他系统密钥不能读取',t=>{
 const dir=directory(t),file=path.join(dir,'cloud-session.json'),storage=encryption();const saved={token:'synthetic-sensitive-token',account:{id:'user1'}};
 fs.writeFileSync(file,JSON.stringify(saved));const store=createSessionStore(dir,storage);assert.deepEqual(store.read(),saved);
 assert.equal(fs.readFileSync(file,'utf8').includes(saved.token),false);assert.equal(JSON.parse(fs.readFileSync(file)).version,2);assert.deepEqual(store.read(),saved);
 assert.equal(createSessionStore(dir,encryption()).read(),null);store.clear();assert.equal(fs.existsSync(file),false);
});
test('加密不可用时不降级写明文，已有密文保留',t=>{
 const dir=directory(t);const unavailable=createSessionStore(dir,{isEncryptionAvailable:()=>false});assert.throws(()=>unavailable.write({token:'synthetic'}),/加密/);assert.equal(fs.existsSync(path.join(dir,'cloud-session.json')),false);
 createSessionStore(dir,encryption()).write({token:'synthetic'});assert.equal(unavailable.read(),null);assert.equal(fs.existsSync(path.join(dir,'cloud-session.json')),true);
});
test('临时断网保留加密会话；明确封禁/失效清理会话并撤销保护任务',async t=>{
 const dir=directory(t),storage=encryption(),store=createSessionStore(dir,storage),originalFetch=global.fetch;let revoked=0;
 t.after(()=>global.fetch=originalFetch);const service=createCloudAccessService(dir,{safeStorage:storage,onInvalidSession:()=>revoked++});
 store.write({token:'synthetic-unique-network-test'});global.fetch=async()=>new Response('unavailable',{status:503});assert.equal(await service.session(),null);assert.equal(service.token(),'synthetic-unique-network-test');assert.equal(revoked,0);
 global.fetch=async()=>Response.json({error:'账号停用'},{status:403});assert.equal(await service.session(),null);assert.equal(service.token(),'');assert.equal(revoked,1);
 store.write({token:'synthetic-banned-account-test'});global.fetch=async()=>Response.json({account:{id:'u',banned:true}});assert.equal(await service.session(),null);assert.equal(service.token(),'');
});


test('local projects may restore the cached account during a temporary project-cloud outage only when explicitly allowed',async t=>{
 const dir=directory(t),storage=encryption(),store=createSessionStore(dir,storage),originalFetch=global.fetch;t.after(()=>global.fetch=originalFetch);
 const saved={token:'synthetic-cached-local',account:{id:'local-owner',username:'owner',isProducer:true}};store.write(saved);
 global.fetch=async()=>Response.json({error:'temporary'},{status:503});const service=createCloudAccessService(dir,{safeStorage:storage});
 assert.equal(await service.session(),null);assert.equal(await service.session({allowCached:async()=>false}),null);
 assert.deepEqual(await service.session({allowCached:async()=>true}),saved.account);
 global.fetch=async()=>Response.json({error:'revoked'},{status:401});assert.equal(await service.session({allowCached:async()=>true}),null);assert.equal(service.token(),'');
});

test('cached local account is not restored after logout while the fallback permission is pending',async t=>{
 const dir=directory(t),storage=encryption(),store=createSessionStore(dir,storage),originalFetch=global.fetch;t.after(()=>global.fetch=originalFetch);
 store.write({token:'synthetic-racing-local',account:{id:'local-owner'}});global.fetch=async()=>Response.json({error:'temporary'},{status:503});const service=createCloudAccessService(dir,{safeStorage:storage});
 let enter,release;const entered=new Promise(r=>enter=r),allowed=new Promise(r=>release=r);
 const pending=service.session({allowCached:async()=>{enter();await allowed;return true;}});await entered;await service.logout();release();assert.equal(await pending,null);assert.equal(service.token(),'');
});
