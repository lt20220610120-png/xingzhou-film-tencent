const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('actual uploader and cloud store reuse bytes across tasks and restart, then release safe cleanup',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-reference-end-to-end-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'actor.png');fs.writeFileSync(file,'same-image-fixture');
 const {createGenerationReferenceStore}=require('../cloud-backend/src/generation-references.cjs'),{createCosSigner}=require('../cloud-backend/src/cos.cjs');
 const store=createGenerationReferenceStore({directory:path.join(root,'cloud'),signer:createCosSigner({secretId:'fixture',secretKey:'fixture',bucket:'test-123',region:'ap-guangzhou'}),fetchFn:async()=>new Response(null,{status:204})}),user={id:'qa'};
 let puts=0,session={account:user,token:'fixture-session'};const gateway=async(action,p)=>store[({'generation-reference-upload-url':'issue','generation-reference-uploaded':'uploaded','generation-reference-release':'release'})[action]](p,user);
 const make=()=>require('./niney-reference-upload.cjs').createNineyReferenceUploader({getSession:()=>session,gateway,fetchFn:async(_url,o)=>{for await(const _bytes of o.body){}puts++;return new Response(null,{status:200});}});
 const input={kind:'video',endpoint:'https://example.invalid/v1',videoProtocol:'autodl',references:[{kind:'image',filePath:file}]};
 const first=make();await first({...input,referenceTaskId:'task-1'});const second=make();await second({...input,referenceTaskId:'task-2'});assert.equal(puts,1);assert.equal((await store.list(user)).count,1);
 await first.release({id:'task-1',status:'success',referenceAccountId:user.id});assert.equal((await store.list(user)).items[0].canDelete,false);
 await second.release({id:'task-2',status:'uncertain',referenceAccountId:user.id});assert.equal((await store.list(user)).items[0].canDelete,false);
 session={account:{id:'other'},token:'other-session'};await second.release({id:'task-2',status:'failed',referenceAccountId:user.id});assert.equal((await store.list(user)).items[0].canDelete,false);
 session={account:user,token:'fixture-session'};await second.release({id:'task-2',status:'failed',referenceAccountId:user.id});assert.equal((await store.list(user)).items[0].canDelete,true);
 const item=(await store.list(user)).items[0];await store.cleanup({ids:[item.id]},user);first.clearCache();await first({...input,referenceTaskId:'task-3'});assert.equal(puts,2);assert.equal(fs.readFileSync(file,'utf8'),'same-image-fixture');
});
