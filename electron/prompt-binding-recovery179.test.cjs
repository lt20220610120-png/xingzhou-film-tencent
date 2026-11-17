const test=require('node:test'),assert=require('node:assert/strict');
const {createProjectPromptBinding}=require('./project-prompt-binding.cjs');
const {nextPromptBinding}=require('../cloud-backend/src/prompt-binding.cjs');
const pid='00000000-0000-4000-8000-000000000179';
function fixture(mode='ok'){
 let project={id:pid,myRole:'producer',episodes:[],analysis_progress:{}},reads=0,writes=0,owner='u';
 const api=createProjectPromptBinding({scope:()=>owner,authorize:async()=>({id:owner}),getLedger:()=>({episodes:{}}),localStore:()=>({load:()=>null}),getProject:async()=>{reads++;return structuredClone(project)},saveShared:async p=>{
  writes++;if(mode==='denied')throw Object.assign(Error('没有权限'),{status:403});
  if(mode!=='not-saved')project.analysis_progress._sharedPromptBinding=nextPromptBinding(project,p,'u');
  if(mode==='switch')owner='other';
  if(mode!=='ok')throw Error('云端未确认本次保存');
  const {revision,lastWriteId,updatedBy,updatedAt}=project.analysis_progress._sharedPromptBinding;
  return {bindingReceipt:true,projectId:pid,revision,lastWriteId,updatedBy,updatedAt};
 }});
 const p={accountId:'u',projectId:pid,baseRevision:0,data:{enabled:true,snapshot:{projectId:pid,cards:[],entries:[]},decisions:{}}};
 return {api,p,get project(){return project},get writes(){return writes},get reads(){return reads}};
}
test('short binding receipt reconstructs exactly the sanitized persisted result',async()=>{
 const f=fixture();f.p.data.snapshot.secret='never-shared';const saved=await f.api.save(f.p);
 assert.deepEqual(saved,{...f.project.analysis_progress._sharedPromptBinding,accountId:'u'});assert.equal(f.writes,1);
});
test('lost binding acknowledgement reads original writeId without repeating write or losing success',async()=>{
 const f=fixture('lost');const saved=await f.api.save(f.p);assert.equal(saved.revision,1);assert.equal(f.writes,1);assert.equal(f.reads,2);
});
test('an uncommitted save stays failed; permission and account changes cannot recover another write',async()=>{
 for(const mode of ['not-saved','denied','switch']){const f=fixture(mode);await assert.rejects(f.api.save(f.p));assert.equal(f.writes,1);if(mode==='denied')assert.equal(f.reads,1);}
});
