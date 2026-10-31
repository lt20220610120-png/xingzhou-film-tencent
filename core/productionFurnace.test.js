import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionController,completeEpisode,imageFailureKind,productionDefaults,productionIssues} from './productionFurnace.js';

test('episode readiness requires every expected distinct clip and verified output',()=>{
 const clip={id:'a',status:'downloaded',outputFile:'a.mp4',sha256:'sha'};
 assert.equal(completeEpisode(['a','b'],[clip]),false);
 assert.equal(completeEpisode(['a','a'],[clip]),false);
 assert.equal(completeEpisode([],[]),false);
 assert.equal(completeEpisode(['a'],[clip]),true);
 assert.equal(completeEpisode(['a'],[{...clip,sha256:''}]),false);
});
test('paused workflow may update only future video retry policy, preserving submitted tasks and prompt identity',async()=>{const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{validateVideoPolicy:async()=>{}}}),run=await c.create('p',{...productionDefaults(),videoModel:'primary'});run.items=[{id:'i',jobId:'original',status:'submitted'}];run.videoSourceSignature='stable';await c.updateVideoPolicy(run.id,{videoAttempts:3,videoFallbackEnabled:true,fallbackVideoModel:'backup',fallbackVideoAttempts:2,videoModel:'malicious'});assert.equal(run.config.videoModel,'primary');assert.equal(run.config.videoAttempts,3);assert.equal(run.items[0].jobId,'original');assert.equal(run.videoSourceSignature,'stable');run.status='running';await assert.rejects(c.updateVideoPolicy(run.id,{}),/暂停/);});
test('prestart ordered fallback list is snapshotted durably and edits never mutate original task identity',async()=>{
 let saved;const c=createProductionController({load:async()=>[],save:async run=>{saved=structuredClone(run);},adapters:{validateVideoPolicy:async()=>{}}});
 const config={...productionDefaults(),videoModel:'primary',videoFallbacks:[{modelId:'b',attempts:3},{modelId:'c',attempts:2}]},run=await c.create('p',config);config.videoFallbacks[0].attempts=8;assert.equal(run.config.videoFallbacks[0].attempts,3);assert.equal(saved.config.videoFallbacks[1].modelId,'c');
 run.items=[{id:'original',status:'downloaded',outputFile:'keep.mp4'}];const patch={videoFallbacks:[{modelId:'d',attempts:4}],videoModel:'wrong'};await c.updateVideoPolicy(run.id,patch);patch.videoFallbacks[0].attempts=7;assert.equal(run.config.videoFallbacks[0].attempts,4);assert.equal(run.config.videoModel,'primary');assert.equal(run.config.videoAttempts,2);assert.equal(run.items[0].outputFile,'keep.mp4');assert.deepEqual(saved.config.videoFallbacks,[{modelId:'d',attempts:4}]);
});
test('partial art/images stay resumable and cannot make the whole run complete',async()=>{
 let images=0,art=0;const saved=[];
 const controller=createProductionController({load:async()=>[],save:async r=>saved.push(structuredClone(r)),adapters:{prompts:async()=>{},art:async()=>{art++;return {partial:true};},images:async()=>{images++;return {partial:true};},videos:async({run})=>{run.episodes=[{number:1,stage:'done'}];}}});
 await controller.restore();const run=await controller.create('p',productionDefaults());await controller.start(run.id);
 assert.equal(run.status,'attention');assert.equal(run.stages.images.status,'partial');
 await controller.start(run.id);assert.equal(images,2);assert.equal(art,2);
});
test('autonomous recovery repairs a blocker and resumes until verified completion',async()=>{let passes=0,repairs=0;const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{prompts:async()=>{},art:async()=>{},images:async()=>{},videos:async({run})=>{passes++;run.episodes=[{number:1,stage:passes>1?'done':'waiting'}];},recover:async()=>{repairs++;return {retry:true,delay:0};},waitForRecovery:async()=>{}}});const run=await c.create('p',productionDefaults());await c.start(run.id);assert.equal(run.status,'done');assert.equal(passes,2);assert.equal(repairs,1);});
test('funding wait is explicit and never presented as finished or generic attention',async()=>{const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{prompts:async()=>{},art:async()=>{},images:async()=>({partial:true}),videos:async()=>{},recover:async()=>({budget:true,reason:'主备生图渠道余额不足'})}});const run=await c.create('p',productionDefaults());await c.start(run.id);assert.equal(run.status,'waiting-budget');assert.match(run.message,/余额/);});
test('old done episodes cannot mask a current video precondition failure',async()=>{let repairs=0;const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{prompts:async()=>{},art:async()=>{},images:async()=>{},videos:async({run})=>{run.episodes=[{number:1,stage:'done'}];throw Error('来源已变化');},recover:async()=>{repairs++;return {budget:true,reason:'fixture stop'};}}});const run=await c.create('p',productionDefaults());await c.start(run.id);assert.equal(repairs,1);assert.notEqual(run.status,'done');});
test('pause/resume and restart trust bulk evidence and never rerun completed upstream stages',async()=>{
 const stored=[],calls=[];const make=()=>createProductionController({load:async()=>stored,save:async r=>{stored.splice(0,stored.length,structuredClone(r));},adapters:{monitor:async ctx=>{calls.push(ctx.readOnly?'readonly':'monitor');return {prompts:true,art:true,images:true};},prompts:async()=>calls.push('regenerate'),art:async()=>calls.push('republish'),images:async()=>calls.push('reimage'),videos:async()=>calls.push('video'),pause:async()=>{}}});
 let c=make();await c.restore();const run=await c.create('p',productionDefaults());await c.start(run.id);await c.pause(run.id);await c.start(run.id);c=make();await c.restore();await c.refresh(run.id);await c.start(run.id);assert.deepEqual(calls,['monitor','video','monitor','video','readonly','monitor','video']);
});
test('inspection locks start/rebind and missing output reopens a completed run for recovery',async()=>{let release,entered;const pending=new Promise(r=>release=r),ready=new Promise(r=>entered=r);let videos=0;const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{monitor:async({run})=>{entered();await pending;run.monitor={files:{invalidItems:['lost'],invalidEpisodes:[]}};return {prompts:true,art:true,images:true};},videos:async()=>{videos++;},selectCollab:async()=>{}}});const run=await c.create('p',productionDefaults());run.status='done';const refresh=c.refresh(run.id);await ready;await c.start(run.id);await assert.rejects(c.bindProject(run.id,'x'),/暂停/);assert.equal(videos,0);release();await refresh;assert.equal(run.status,'attention');await c.start(run.id);assert.equal(videos,1);});
test('stage problems are logged and later stages still run',async()=>{
 const saved=[];let later=0;const controller=createProductionController({load:async()=>[],save:async r=>saved.push(structuredClone(r)),adapters:{prompts:async()=>{throw Error('已有提示词无需重复审核');},art:async({notice})=>{await notice('清单部分关联，继续使用已发布结果');return {partial:true};},images:async()=>{later++;return {partial:true};},videos:async({run})=>{run.episodes=[{number:1,stage:'done'}];}}});
 await controller.restore();const run=await controller.create('p',productionDefaults());await controller.start(run.id);assert.equal(later,1);assert.equal(run.stages.prompts.status,'partial');assert.equal(run.stages.images.status,'partial');assert(run.logs.some(log=>log.text.includes('已有提示词无需重复审核')));assert(run.logs.some(log=>log.text.includes('继续使用已发布结果')));
});
test('failed read-only inspection does not lock a completed run against recovery',async()=>{const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{monitor:async()=>{throw Error('目录不可用');}}});const run=await c.create('p',productionDefaults());run.status='done';await assert.rejects(c.refresh(run.id),/目录不可用/);assert.equal(run.status,'attention');});
test('restore pauses interrupted work; duplicate start cannot submit twice',async()=>{
 let resolve,called=0;const gate=new Promise(r=>resolve=r),stored={id:'old',status:'running',config:{mode:'semi'},stages:{},episodes:[],items:[]};
 const controller=createProductionController({load:async()=>[stored],save:async()=>{},adapters:{videos:async({run})=>{called++;await gate;run.episodes=[{number:1,stage:'done'}];}}});
 await controller.restore();assert.equal(stored.status,'paused');const first=controller.start('old');const second=controller.start('old');await new Promise(r=>setTimeout(r,10));resolve();await Promise.all([first,second]);assert.equal(called,1);
});
test('unknown submission and transport errors do not become automatic image retries',()=>{
 assert.equal(imageFailureKind(new Error('timeout')),'uncertain');
 assert.equal(imageFailureKind(new Error('anything'),{receiptId:'r'}),'uncertain');
 assert.equal(imageFailureKind(new Error('content_policy_violation')),'content');
 assert.equal(imageFailureKind(new Error('429')),'rate-limit');
 assert.ok(productionIssues(productionDefaults()).length>0);
});
test('Agent conversation records actual actions, preserves task state and rejects concurrent messages',async()=>{
 let release;const pending=new Promise(r=>release=r),stored=[];let calls=0;
 const c=createProductionController({load:async()=>[],save:async r=>stored.push(r),adapters:{chat:async()=>{calls++;await pending;return {reply:'先暂停当前派发。',action:'pause'};},pause:async()=>{}}});
 const run=await c.create('p',productionDefaults());run.items=[{id:'saved-job',status:'submitted'}];const sending=c.chat(run.id,{text:'先暂停',model:'m'});await new Promise(r=>setImmediate(r));await assert.rejects(c.chat(run.id,{text:'重复点击',model:'m'}),/正在回复/);release();await sending;
 assert.equal(calls,1);assert.equal(run.status,'paused');assert.equal(run.items[0].id,'saved-job');assert.deepEqual(run.conversation.map(m=>m.role),['user','assistant','system']);assert.match(run.conversation.at(-1).text,/已暂停/);
 await c.saveRule(run.id,'复用已发布的清单');assert.equal(run.config.workflowRules,'复用已发布的清单');
});
test('chat cannot change projects after paid submissions and failed action remains visible',async()=>{
 const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{chat:async()=>({reply:'尝试改选',action:'select_collab',projectId:'other'}),selectCollab:async()=>{throw Error('不应执行');}}});const run=await c.create('p',productionDefaults());run.items=[{id:'submitted'}];
 await assert.rejects(c.chat(run.id,{text:'切换',model:'m'}),/已有视频提交记录/);assert.match(run.conversation.at(-1).text,/指令未完成/);assert.equal(run.collabProjectId,undefined);
});
