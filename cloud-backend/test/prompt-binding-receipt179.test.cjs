const test=require('node:test'),assert=require('node:assert/strict'),{handleAction}=require('../src/collab.cjs');
const project={id:'p',owner_id:'u',genre:'[COLLAB_PROJECT]',episodes:[{id:'e',episodeNumber:1,content:'正文'}],analysis_progress:{_sharedPromptBinding:{revision:4,lastWriteId:'w',updatedBy:'u',updatedAt:'now',snapshot:{entries:[{prompt:'x'.repeat(100000)}]}}}};
const repo={getProject:async()=>project,isProjectLocked:async()=>false,savePromptBinding:async()=>project.analysis_progress._sharedPromptBinding};
test('binding save short receipt and legacy full response are distinct',async()=>{
 const short=await handleAction('prompt-binding-save',{projectId:'p',ackOnly:true},{id:'u'},repo);
 assert.equal(short.body.bindingReceipt,true);assert.equal(short.body.lastWriteId,'w');assert(JSON.stringify(short.body).length<500);
 const full=await handleAction('prompt-binding-save',{projectId:'p'},{id:'u'},repo);assert(full.body.snapshot);
});
test('conditional binding context omits large unchanged snapshot but rechecks role and lock',async()=>{
 const r=await handleAction('project-get',{projectId:'p',bindingContext:true,knownBindingRevision:4},{id:'u'},repo);
 assert.equal(r.body.bindingUnchanged,true);assert.equal(r.body.myRole,'producer');assert(!r.body.episodes);assert(!r.body.analysis_progress);assert.equal(r.body.bindingSources['1'].length,64);
 const changed=await handleAction('project-get',{projectId:'p',bindingContext:true,knownBindingRevision:3},{id:'u'},repo);assert.equal(changed.body.analysis_progress._sharedPromptBinding.revision,4);
 const denied=await handleAction('project-get',{projectId:'p',bindingContext:true},{id:'x'},{...repo,getProject:async()=>null});assert.equal(denied.status,404);
});
