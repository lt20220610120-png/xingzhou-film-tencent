const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createPromptArtStore}=require('./prompt-art-store.cjs');
test('本机关联持久化、账号隔离和并发版本检查',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-binding-'));let account='a';const store=createPromptArtStore(root,()=>account),payload={accountId:'a',projectId:'p'};
 try{
  assert.equal(store.load(payload),null);
  const saved=store.save({...payload,baseRevision:0,data:{enabled:true,snapshot:{projectId:'p',name:'剧名',cards:[],entries:[]},decisions:{}}});
  assert.equal(saved.revision,1);assert.equal(store.load(payload).snapshot.name,'剧名');assert.equal(store.list({accountId:'a'}).length,1);
  assert.throws(()=>store.save({...payload,baseRevision:0,data:saved}),/另一窗口/);
  account='b';assert.throws(()=>store.load(payload),/账号/);assert.equal(store.load({accountId:'b',projectId:'p'}),null);assert.equal(store.list({accountId:'b'}).length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('自动分发运行/失败检查点跨重启保留，旧客户端保存不擦除防重记录',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xingzhou-binding-')),payload={accountId:'a',projectId:'p'};
 try{
  let store=createPromptArtStore(root,()=> 'a');
  const data={enabled:true,snapshot:{projectId:'p',cards:[],entries:[]},sceneDistributionAttempts:{'v:p1':{stamp:'source-v1',status:'failed'}}};
  store.save({...payload,baseRevision:0,data});store=createPromptArtStore(root,()=> 'a');
  assert.deepEqual(store.load(payload).sceneDistributionAttempts,data.sceneDistributionAttempts);
  store.save({...payload,baseRevision:1,data:{enabled:true,snapshot:data.snapshot}});
  assert.deepEqual(store.load(payload).sceneDistributionAttempts,data.sceneDistributionAttempts);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
