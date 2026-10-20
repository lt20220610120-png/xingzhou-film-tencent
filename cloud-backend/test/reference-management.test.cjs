const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createGenerationReferenceStore}=require('../src/generation-references.cjs');
const {createCosSigner}=require('../src/cos.cjs');
function setup(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'xz-reference-management-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));let time=Date.now(),fail=false;const deleted=[];const config={directory,signer:createCosSigner({secretId:'fixture',secretKey:'fixture',bucket:'test-123',region:'ap-guangzhou'}),now:()=>time,fetchFn:async url=>{deleted.push(url);return new Response(null,{status:fail?503:204});}};return {directory,config,store:createGenerationReferenceStore(config),deleted,advance:()=>time+=49*3600000,fail:()=>fail=true};}
const payload={filename:'actor.png',kind:'image',mime:'image/png',size:100,hash:'a'.repeat(64),leaseId:'task-one'};
test('repeated bytes reuse an uploaded object across restarts and protect every active task',async t=>{
 const f=setup(t),u={id:'a'},one=await f.store.issue(payload,u);await f.store.uploaded({id:one.id},u);
 const store=createGenerationReferenceStore(f.config),two=await store.issue({...payload,leaseId:'task-two'},u);
 assert.equal(two.reused,true);assert.equal(two.id,one.id);assert.equal((await store.list(u)).count,1);
 await store.release({leaseId:'task-one'},u);assert.equal((await store.cleanup({ids:[one.id]},u)).removed,0);
 await store.release({leaseId:'task-two'},u);assert.equal((await store.list(u)).items[0].canDelete,true);
 const result=await store.cleanup({ids:[one.id]},u);assert.equal(result.removed,1);assert.equal(result.bytesFreed,100);
});
test('cleanup owner isolation, legacy protection, expiration and failed deletes are preserved',async t=>{
 const f=setup(t),alice={id:'alice'},bob={id:'bob'};
 const a=await f.store.issue(payload,alice),b=await f.store.issue({...payload,hash:'b'.repeat(64)},bob);
 assert.equal((await f.store.list(alice)).items.length,1);await f.store.release({leaseId:payload.leaseId},alice);
 assert.equal((await f.store.cleanup({ids:[b.id]},alice)).removed,0);
 f.fail();const failed=await f.store.cleanup({ids:[a.id]},alice);assert.equal(failed.failed.length,1);assert.equal((await f.store.list(alice)).count,1);
 const file=path.join(f.directory,a.id+'.json'),row=JSON.parse(fs.readFileSync(file));delete row.tracked;delete row.leases;fs.writeFileSync(file,JSON.stringify(row));
 assert.equal((await f.store.list(alice)).items[0].state,'legacy');assert.equal((await f.store.cleanup({ids:[a.id]},alice)).removed,0);
 f.advance();assert.equal((await f.store.list(alice)).items[0].state,'expired');
});
test('more than 100 small references do not hit the obsolete count cap; byte quota remains',async t=>{
 const f=setup(t),u={id:'a'};for(let i=0;i<110;i++)await f.store.issue({...payload,hash:undefined,filename:i+'.png'},u);
 assert.equal((await f.store.list(u)).count,110);assert.equal((await f.store.list(u)).limits.count,500);
 for(let i=0;i<10;i++)await f.store.issue({filename:'v.mp4',kind:'video',mime:'video/mp4',size:100*1024*1024},u);
 await assert.rejects(f.store.issue({filename:'v.mp4',kind:'video',mime:'video/mp4',size:100*1024*1024},u),/临时素材/);
});
test('expired records are reclaimed before quota rejects, concurrent reservations remain within byte quota',async t=>{
 const f=setup(t),u={id:'a'};for(let i=0;i<10;i++)await f.store.issue({filename:'v.mp4',kind:'video',mime:'video/mp4',size:100*1024*1024},u);
 f.advance();await f.store.issue({filename:'v.mp4',kind:'video',mime:'video/mp4',size:100*1024*1024},u);assert.equal((await f.store.list(u)).count,1);
 const result=await Promise.allSettled(Array.from({length:15},()=>f.store.issue({filename:'v.mp4',kind:'video',mime:'video/mp4',size:100*1024*1024},u)));
 assert.equal(result.filter(r=>r.status==='fulfilled').length,9);assert.equal((await f.store.list(u)).count,10);
});
