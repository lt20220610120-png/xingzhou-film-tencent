const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {readLocalCodexCatalog}=require('./codex-catalog.cjs');
test('API catalog refresh starts a new client, reads ChatGPT models without inference and closes it',async()=>{
 let starts=0,closed=0;const dirs=[];
 const createClient=options=>{starts++;dirs.push(options.cwd);return {
  connect:async settings=>{assert.deepEqual(settings,{status:'account',chatgptOnly:true});return {models:[{id:'new-'+starts,efforts:['low','ultra']}],status:{account:{type:'chatgpt',plan:'plus'},windows:[],errors:{limits:'unavailable'}}};},close:()=>closed++};};
 const first=await readLocalCodexCatalog({createClient}),next=await readLocalCodexCatalog({createClient});
 assert.equal(first.models[0].id,'new-1');assert.equal(next.models[0].id,'new-2');assert.equal(next.quotaError,'unavailable');assert.equal(closed,2);assert(dirs.every(dir=>!fs.existsSync(dir)));
});
test('catalog failure and account revocation release the owned client and temporary directory',async()=>{
 for(const revoke of [false,true]){const controller=new AbortController();let closed=0,dir;
  const createClient=options=>{dir=options.cwd;return {connect:async()=>{if(revoke)controller.abort();else throw Error('请先登录');return {models:[{id:'unused'}]};},close:()=>closed++};};
  await assert.rejects(readLocalCodexCatalog({createClient,signal:controller.signal}),revoke?/账号状态/:/登录/);assert(closed>=1);assert(!fs.existsSync(dir));
 }
});
test('an empty model catalog is reported instead of inventing hardcoded models',async()=>{
 await assert.rejects(readLocalCodexCatalog({createClient:()=>({connect:async()=>({models:[]}),close(){}})}),/未返回可用模型/);
});
