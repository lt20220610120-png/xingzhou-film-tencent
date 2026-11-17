const test=require('node:test'),assert=require('node:assert/strict');
const {handleAction}=require('../src/collab.cjs');
test('single shot save receipt omits whole script and other episodes, legacy response stays complete',async()=>{
 const row={id:'p',owner_id:'u',script:'x'.repeat(23000000),episodes:[{id:'e',storyboardPrompts:[{id:'s',content:'saved',generationConfig:{model:'ft'}}]}]};
 const repo={getProject:async()=>row,isProjectLocked:async()=>false,patchStoryboard:async()=>row};
 const payload={projectId:'p',episodeId:'e',shotId:'s',ackOnly:true};
 const r=await handleAction('storyboard-patch',payload,{id:'u'},repo);assert.equal(r.status,200);assert.equal(r.body.storyboardReceipt.shot.content,'saved');assert.ok(JSON.stringify(r.body).length<1000);
 const legacy=await handleAction('storyboard-patch',{...payload,ackOnly:false},{id:'u'},repo);assert.equal(legacy.body.script.length,23000000);
 const read=await handleAction('project-get',{...payload,shotReceipt:true},{id:'u'},repo);assert.deepEqual(read.body,r.body);
});


test('publication receipt excludes the 15MB project after persistence and retains permissions',async()=>{
 const row={id:'p',owner_id:'u',updated_at:'now',script:'x'.repeat(15000000),episodes:[]};let writes=0;
 const repo={getProject:async()=>row,isProjectLocked:async()=>false,patchStoryboard:async()=>{writes++;return row;}};
 const payload={projectId:'p',operation:'publish',episodeNumber:1,sceneIds:['1-1'],publicationId:'pub',ackOnly:true};
 const r=await handleAction('storyboard-patch',payload,{id:'u'},repo);assert.equal(r.status,200);assert.equal(writes,1);assert.deepEqual(r.body,{id:'p',publicationReceipt:{publicationId:'pub',episodeNumber:1,sceneIds:['1-1'],updatedAt:'now'}});assert(JSON.stringify(r.body).length<250);
 const legacy=await handleAction('storyboard-patch',{...payload,ackOnly:false},{id:'u'},repo);assert.equal(legacy.body.script.length,15000000);
 repo.findMembership=async()=>({role:'viewer'});assert.equal((await handleAction('storyboard-patch',payload,{id:'other'},repo)).status,403);assert.equal(writes,2);
 repo.isProjectLocked=async()=>true;assert.equal((await handleAction('storyboard-patch',payload,{id:'u'},repo)).status,423);assert.equal(writes,2);
});
