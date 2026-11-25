const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createStoryboardBatchHost}=require('./storyboard-batch-host.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xz-sb-host-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const project={id:'p',myRole:'producer',episodes:[{id:'ep',episodeNumber:1,storyboardPrompts:[{id:'s',label:'1-1-1',content:'原词',generationConfig:{references:[]}}]}]};const sent=[],saved=[],jobs=[];let account='a';const state={activeVideoApiId:'v',mediaProfiles:[{id:'v',kind:'video',endpoint:'https://fixture/v1',apiKey:'private-local-fixture',model:'movie',videoProtocol:'videos-json',capabilities:{ratios:['16:9'],durations:[30],resolutions:['720p']}}]};const q=createStoryboardBatchHost({directory:dir,owner:()=>account,license:async()=>{},getProject:async()=>structuredClone(project),listMedia:async()=>[],listJobs:()=>jobs,getState:()=>state,schema:async()=>{},patchShot:async p=>{saved.push(p);Object.assign(project.episodes[0].storyboardPrompts[0],p.updates);return project;},submit:async input=>{sent.push(input);const j={...input,id:'j',status:'submitted'};jobs.push(j);return j;}});const payload={projectId:'p',accountId:'a',scope:'scene',episodeId:'ep',sceneId:'1-1',items:[{shotId:'s',publicationId:'',baseContent:'原词',baseGenerationConfig:{references:[]},value:{prompt:'手改词',references:[],profileId:'v',model:'movie',duration:30,apiKey:'must-never-persist',endpoint:'https://wrong.invalid'}}]};return {q,dir,project,payload,saved,sent,jobs,switchAccount:()=>account='b'};}
test('host saves correct prompt/settings and submits only the selected current project with server profile credentials',async t=>{const f=fixture(t);await f.q.start(f.payload);await f.q.idle();assert.equal(f.sent.length,1);assert.equal(f.saved[0].updates.content,'手改词');assert.equal(f.saved[0].requireExactBase,true);assert.equal(f.sent[0].duration,30);assert.equal(f.sent[0].projectId,'p');assert.equal(f.sent[0].apiKey,'private-local-fixture');assert.equal(f.sent[0].endpoint,'https://fixture/v1');const disk=fs.readFileSync(path.join(f.dir,'batches.json'),'utf8');assert(!disk.includes('must-never-persist'));assert(!disk.includes('private-local-fixture'));});
test('stale confirmation bases cannot overwrite collaborator edits, changed reference config or wrong scope',async t=>{for(const change of ['content','config','scope']){const f=fixture(t);if(change==='content')f.project.episodes[0].storyboardPrompts[0].content='协作者新稿';if(change==='config')f.project.episodes[0].storyboardPrompts[0].generationConfig.ratio='9:16';if(change==='scope')f.payload.sceneId='1-2';await assert.rejects(f.q.start(f.payload),/修改|范围/);assert.equal(f.saved.length,0);assert.equal(f.sent.length,0);}});
test('locked project and wrong account never create batch work',async t=>{const f=fixture(t);f.project.locked=true;await assert.rejects(f.q.start(f.payload),/锁定/);f.project.locked=false;f.switchAccount();await assert.rejects(f.q.start(f.payload),/账号/);assert.equal(f.sent.length,0);});
test('already completed shot is skipped without touching its newer unsaved draft',async t=>{const f=fixture(t);f.jobs.push({id:'old',projectId:'p',shotId:'s',kind:'video',status:'success'});f.payload.items[0].baseContent='旧基线';f.payload.items[0].value.prompt='尚未保存的新稿';const run=await f.q.start(f.payload);await f.q.idle();assert.equal(f.sent.length,0);assert.equal(f.saved.length,0);assert.equal(f.q.list({projectId:'p',accountId:'a'})[0].counts.skipped,1);});
test('batch scope rejects awaiting estimates before saving or sending work',async t=>{
 const f=fixture(t),shot=f.project.episodes[0].storyboardPrompts[0];
 shot.durationEstimate={version:'2.0.0',status:'pending',maxDurationSeconds:30,error:{code:'TIMEOUT',message:'估时超时'}};
 f.payload.items[0].value.prompt=shot.content;
 await assert.rejects(f.q.start(f.payload),/批量生成未启动.*待估时/);
 assert.equal(f.saved.length,0);assert.equal(f.sent.length,0);
});

test('opt-in batch skips unsaved and unavailable shots while dispatching the valid shot exactly once',async t=>{
 const f=fixture(t),episode=f.project.episodes[0];
 const pending={version:'3.0.0',status:'pending',maxDurationSeconds:30,error:{code:'TIMEOUT',message:'估时超时'}};
 const precise={version:'2.0.0',status:'estimated',maxDurationSeconds:30,naturalSeconds:17,recommendedSeconds:17,needsResegment:false,capacityStatus:'正常',breakdown:{speechSeconds:12,nonparallelActionSeconds:4,pauseBufferSeconds:1},reason:'原话与动作合计。'};
 const unsupported={...precise,maxDurationSeconds:15,naturalSeconds:13,recommendedSeconds:13,breakdown:{speechSeconds:8,nonparallelActionSeconds:4,pauseBufferSeconds:1}};
 const mirrors=[['draft',precise],['pending',pending],['unsupported',unsupported]];
 for(const [index,[shotId,estimate]] of mirrors.entries()){
  episode.storyboardPrompts.push({id:shotId,label:`1-1-${index+2}`,content:'原词',generationConfig:{references:[]},durationEstimate:estimate});
  f.payload.items.push({...f.payload.items[0],shotId,skipUnsavedDraft:shotId==='draft',value:{...f.payload.items[0].value,prompt:'原词',durationMode:'recommended',durationAlignment:'ceil'}});
 }
 const run=await f.q.start({...f.payload,skipUnavailable:true});await f.q.idle();
 assert.deepEqual(run.items.slice(1).map(item=>item.status),['skipped','skipped','skipped']);
 assert.match(run.items[1].error,/未保存/);
 assert.match(run.items[2].error,/待估时/);
 assert.match(run.items[3].error,/模型.*建议时长/);
 assert.deepEqual(f.saved.map(item=>item.shotId),['s']);
 assert.deepEqual(f.sent.map(item=>item.shotId),['s']);
});
test('batch with an explicit model duration policy aligns the persisted and generated execution seconds',async t=>{
 const f=fixture(t),shot=f.project.episodes[0].storyboardPrompts[0],item=f.payload.items[0];
 shot.durationEstimate={version:'2.0.0',status:'estimated',maxDurationSeconds:30,naturalSeconds:17,recommendedSeconds:17,needsResegment:false,capacityStatus:'正常',breakdown:{speechSeconds:12,nonparallelActionSeconds:4,pauseBufferSeconds:1},reason:'原话与动作合计。'};
 item.value={...item.value,prompt:shot.content,durationMode:'recommended',durationAlignment:'ceil',recommendedDurationSeconds:17,duration:17};
 await f.q.start(f.payload);await f.q.idle();
 assert.equal(f.saved[0].updates.generationConfig.duration,30);assert.equal(f.sent[0].duration,30);
});

test('batch sends a saved manual or fixed choice once even when the 15-second estimate is awaiting review',async t=>{
 for(const manual of [false,true]){
  const f=fixture(t),shot=f.project.episodes[0].storyboardPrompts[0],item=f.payload.items[0];
  shot.durationEstimate={version:'2.0.0',status:'needs-review',maxDurationSeconds:15};
  item.value={...item.value,storyboardDefaultsRevision:'active-settings',durationMode:'uniform',durationManuallyAdjusted:manual};
  await f.q.start(f.payload);await f.q.idle();
  assert.equal(f.saved[0].updates.generationConfig.storyboardDefaultsRevision,'active-settings');
  assert.equal(f.saved[0].updates.generationConfig.durationMode,'uniform');
  assert.equal(f.saved[0].updates.generationConfig.duration,30);
  assert.equal(f.sent.length,1);assert.equal(f.sent[0].duration,30);
 }
});

test('batch rejects illegal explicit seconds and stale omission of a saved recommended mode before dispatch',async t=>{
 const f=fixture(t),shot=f.project.episodes[0].storyboardPrompts[0],item=f.payload.items[0];
 item.value={...item.value,durationMode:'uniform',duration:20};
 await assert.rejects(f.q.start(f.payload),/批量生成未启动.*当前模型/);
 shot.generationConfig.durationMode='recommended';item.baseGenerationConfig=structuredClone(shot.generationConfig);
 delete item.value.durationMode;
 await assert.rejects(f.q.start(f.payload),/批量生成未启动/);
 assert.equal(f.saved.length,0);assert.equal(f.sent.length,0);
});
