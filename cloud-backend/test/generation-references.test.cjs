const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createCosSigner}=require('../src/cos.cjs');
const config={secretId:'fixture-id',secretKey:'fixture-secret',bucket:'test-123',region:'ap-guangzhou'};
test('temporary reference downloads have 48-hour lifetime without changing ordinary object signatures',()=>{
 const signer=createCosSigner(config),key='temporary/generation/'+'a'.repeat(32)+'/a.png';
 const ref=signer.signGenerationReference({objectKey:key});assert.ok(ref.expiresAt-Date.now()>47*3600*1000);assert.ok(signer.signDownload({objectKey:'projects/p/a.png',ttlSeconds:999999}).expiresAt-Date.now()<15*60*1000);
 assert.throws(()=>signer.signGenerationReference({objectKey:'projects/p/a.png'}),/临时素材/);
});
test('temporary reference issuance isolates users, rejects invalid/quota requests and survives restart for cleanup',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-temp-refs-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let now=Date.now(),deletes=0;
 const {createGenerationReferenceStore}=require('../src/generation-references.cjs');const signer=createCosSigner(config);
 const options={directory:root,signer,now:()=>now,fetchFn:async(_,o)=>{assert.equal(o.method,'DELETE');deletes++;return new Response(null,{status:204});}};
 const store=createGenerationReferenceStore(options);const a=await store.issue({filename:'a.png',kind:'image',mime:'image/png',size:100},{id:'alice'});
 const b=await store.issue({filename:'a.png',kind:'image',mime:'image/png',size:100},{id:'bob'});assert.notEqual(a.objectKey.split('/')[2],b.objectKey.split('/')[2]);assert.match(a.downloadUrl,/q-signature=/);assert.ok(!JSON.stringify(a).includes(config.secretKey));
 await assert.rejects(store.issue({filename:'a.txt',kind:'image',mime:'image/png',size:100},{id:'alice'}),/素材/);await assert.rejects(store.issue({filename:'a.png',kind:'image',mime:'image/png',size:0},{id:'alice'}),/素材/);assert.equal(fs.readdirSync(root).length,2);
 now+=49*3600*1000;assert.equal((await createGenerationReferenceStore(options).prune()).removed,2);assert.equal(deletes,2);assert.equal(fs.readdirSync(root).length,0);
});
test('temporary cleanup retains failed deletions and never trusts tampered metadata paths',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-temp-refs-fail-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let now=Date.now(),calls=0;
 const {createGenerationReferenceStore}=require('../src/generation-references.cjs');const options={directory:root,signer:createCosSigner(config),now:()=>now,fetchFn:async()=>{calls++;return new Response(null,{status:503});}};
 await createGenerationReferenceStore(options).issue({filename:'v.mp4',kind:'video',mime:'video/mp4',size:100},{id:'u'});
 fs.writeFileSync(path.join(root,'evil.json'),JSON.stringify({objectKey:'projects/p/delete.png',expiresAt:0}));now+=49*3600*1000;
 assert.equal((await createGenerationReferenceStore(options).prune()).removed,0);assert.equal(calls,1);assert.equal(fs.readdirSync(root).length,2);
});
test('temporary upload signature binds declared byte count and quota cannot be bypassed by another object path',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-temp-quota-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const signer=createCosSigner(config),store=require('../src/generation-references.cjs').createGenerationReferenceStore({directory:root,signer});
 const first=await store.issue({filename:'a.png',kind:'image',mime:'image/png',size:10},{id:'u'});assert.match(first.authorization,/q-header-list=content-length;content-type/);assert.notEqual(first.authorization,signer.signUpload({objectKey:first.objectKey,contentType:'image/png',contentLength:20}).authorization);
 for(let i=0;i<10;i++)await store.issue({filename:'v.mp4',kind:'video',mime:'video/mp4',size:100*1024*1024},{id:'u'});
 await assert.rejects(store.issue({filename:'v.mp4',kind:'video',mime:'video/mp4',size:100*1024*1024},{id:'u'}),/额度/);
});
test('authenticated gateway issues only generation-reference tickets; anonymous and banned users are refused',async t=>{
 const {createServer}=require('../src/server.cjs');let issued=0;let user=null;const server=createServer({API_SECRET:'fixture',DATABASE_URL:'test',PORT:'0'},{repository:{findBySession:async()=>user},mailer:null,cosSigner:null,referenceStore:{issue:async(payload,u)=>{assert.equal(u.id,'u');issued++;return {downloadUrl:'signed-fixture'};},prune:async()=>({removed:0})}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const request=()=>fetch(`http://127.0.0.1:${server.address().port}/api/gateway`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'generation-reference-upload-url',filename:'a.png'})});
 assert.equal((await request()).status,401);user={id:'u',banned:true};assert.equal((await request()).status,403);assert.equal(issued,0);user={id:'u'};assert.equal((await request()).status,200);assert.equal(issued,1);
});
test('AutoDL FLAC and MP4 audio tickets preserve audio MIME and are cleaned from the temporary prefix',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-autodl-audio-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let now=Date.now();const store=require('../src/generation-references.cjs').createGenerationReferenceStore({directory:root,signer:createCosSigner(config),now:()=>now,fetchFn:async()=>new Response(null,{status:204})});
 for(const [filename,mime] of [['a.flac','audio/flac'],['a.mp4','audio/mp4']]){const row=await store.issue({filename,kind:'audio',mime,size:100},{id:'u'});assert.equal(row.contentType,mime);assert.match(row.downloadUrl,/temporary\/generation/);}
 now+=49*3600*1000;assert.equal((await store.prune()).removed,2);
});
