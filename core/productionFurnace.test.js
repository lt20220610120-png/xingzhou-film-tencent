import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionController,completeEpisode,imageFailureKind,productionDefaults,productionIssues,productionCoverage,VOICE_AUTOMATION_RULE} from './productionFurnace.js';
test('automation defaults include an explicit first-sample voice policy',()=>{const c=productionDefaults();assert.equal(c.voiceModelId,'');assert.match(VOICE_AUTOMATION_RULE,/第一条成功生成/);assert.match(VOICE_AUTOMATION_RULE,/年龄阶段/);});

test('information reading executes before voices and still runs when voices are disabled',async()=>{
 for(const voiceEnabled of [true,false]){const order=[],controller=createProductionController({load:async()=>[],save:async()=>{},adapters:{information:async()=>order.push('information'),voices:async()=>order.push('voices'),art:async()=>order.push('art'),videos:async({run})=>{run.episodes=[{stage:'done'}];}}});const run=await controller.create('p',{...productionDefaults(),voiceEnabled});await controller.start(run.id);assert.deepEqual(order,voiceEnabled?['information','voices','art']:['information','art']);}
});
test('automatic stage order puts enabled character voices between prompts and art',async()=>{const order=[],c=createProductionController({load:async()=>[],save:async()=>{},adapters:{prompts:async()=>order.push('prompts'),voices:async()=>order.push('voices'),art:async()=>order.push('art'),images:async()=>order.push('images'),videos:async({run})=>{order.push('videos');run.episodes=[{number:1,stage:'done'}]}}});const run=await c.create('p',{...productionDefaults(),mode:'auto',voiceEnabled:true});await c.start(run.id);assert.deepEqual(order,['prompts','voices','art','images','videos']);assert.equal(run.stages.voices.status,'done');});

test('optional voices default off, never run or block old tasks and clear obsolete voice errors',async()=>{
 assert.equal(productionDefaults().voiceEnabled,false);
 const called=[],c=createProductionController({load:async()=>[],save:async()=>{},adapters:{monitor:async()=>({voices:false}),voices:async()=>{called.push('voice');throw Error('模型不存在');},videos:async({run})=>{run.episodes=[{stage:'done'}];}}});
 const run=await c.create('p',{mode:'auto'});run.stageErrors={voices:'旧版未选语音模型'};run.voiceWarnings=['旧错误'];await c.start(run.id);
 assert.deepEqual(called,[]);assert.equal(run.status,'done');assert.equal(run.stages.voices.skipped,true);assert.deepEqual(run.voiceWarnings,[]);
 assert(!productionIssues(productionDefaults()).some(s=>/音色/.test(s)));
});

test('voice policy can switch during runtime, clears obsolete blockers and preserves submitted identity',async()=>{
 const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{validateVoicePolicy:async()=>{}}}),run=await c.create('p',{...productionDefaults(),voiceEnabled:true,voiceModelId:'voice',voiceCompletionProfileId:'text',voiceDistributionProfileId:'text'});
 run.status='running';run.items=[{id:'clip',jobId:'keep',status:'submitted'}];run.stageErrors={voices:'模型被删除',images:'保留'};run.stages.voices={status:'partial'};
 await c.updateVoicePolicy(run.id,{voiceEnabled:false,voiceConcurrency:128,projectId:'wrong'});
 assert.equal(run.config.voiceEnabled,false);assert.equal(run.config.voiceConcurrency,128);assert.equal(run.stages.voices.skipped,true);assert.equal(run.stageErrors.voices,undefined);assert.equal(run.stageErrors.images,'保留');assert.equal(run.items[0].jobId,'keep');assert.equal(run.projectId,'p');
 await c.updateVoicePolicy(run.id,{voiceEnabled:true});assert.equal(run.stages.voices.status,'pending');assert.equal(run.config.voiceEnabled,true);
 await assert.rejects(c.updateVoicePolicy(run.id,{voiceConcurrency:0}),/并发/);
 await c.updateVoicePolicy(run.id,{voiceEnabled:false,voiceConcurrency:''});assert.equal(run.config.voiceEnabled,false);assert.equal(run.config.voiceConcurrency,1);
});

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
test('insufficient funds keeps the scheduler alive with bounded retries; the user can stop before another submission',async()=>{
 let attempts=0,delaySeen=0;
 const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{
  images:async()=>({partial:true}),videos:async()=>{attempts++;},
  recover:async()=>({budget:true,reason:'主备生图渠道余额不足'}),
  waitForRecovery:async(delay,ctx)=>{delaySeen=delay;assert.equal(ctx.run.status,'running');assert.match(ctx.run.message,/余额/);await c.pause(ctx.run.id);}
 }});
 const run=await c.create('p',productionDefaults());await c.start(run.id);
 assert(delaySeen>=60000);assert.equal(attempts,1);assert.equal(run.status,'paused');
});
test('old done episodes cannot mask a current video precondition failure',async()=>{let repairs=0;const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{prompts:async()=>{},art:async()=>{},images:async()=>{},videos:async({run})=>{run.episodes=[{number:1,stage:'done'}];throw Error('来源已变化');},recover:async()=>{repairs++;return {budget:true,reason:'fixture stop'};},waitForRecovery:async(_delay,ctx)=>c.pause(ctx.run.id)}});const run=await c.create('p',productionDefaults());await c.start(run.id);assert.equal(repairs,1);assert.notEqual(run.status,'done');});
test('pause/resume and restart trust bulk evidence and never rerun completed upstream stages',async()=>{
 const stored=[],calls=[];const make=()=>createProductionController({load:async()=>stored,save:async r=>{stored.splice(0,stored.length,structuredClone(r));},adapters:{monitor:async ctx=>{calls.push(ctx.readOnly?'readonly':'monitor');return {prompts:true,art:true,images:true};},prompts:async()=>calls.push('regenerate'),art:async()=>calls.push('republish'),images:async()=>calls.push('reimage'),videos:async()=>calls.push('video'),pause:async()=>{}}});
 let c=make();await c.restore();const run=await c.create('p',productionDefaults());await c.start(run.id);await c.pause(run.id);await c.start(run.id);c=make();await c.restore();await c.refresh(run.id);await c.start(run.id);assert.deepEqual(calls,['monitor','video','monitor','video','readonly','monitor','video']);
});
test('inspection locks start/rebind and missing output reopens a completed run for recovery',async()=>{let release,entered;const pending=new Promise(r=>release=r),ready=new Promise(r=>entered=r);let videos=0;const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{monitor:async({run})=>{entered();await pending;run.monitor={files:{invalidItems:['lost'],invalidEpisodes:[]}};return {prompts:true,art:true,images:true};},videos:async()=>{videos++;},selectCollab:async()=>{}}});const run=await c.create('p',productionDefaults());run.status='done';const refresh=c.refresh(run.id);await ready;await c.start(run.id);await assert.rejects(c.bindProject(run.id,'x'),/暂停/);assert.equal(videos,0);release();await refresh;assert.equal(run.status,'attention');await c.start(run.id);assert.equal(videos,1);});
test('incomplete prompts stop dependent stages without losing durable errors',async()=>{
 const saved=[];let later=0;const controller=createProductionController({load:async()=>[],save:async r=>saved.push(structuredClone(r)),adapters:{prompts:async()=>{throw Error('已有提示词无需重复审核');},art:async({notice})=>{await notice('清单部分关联，继续使用已发布结果');return {partial:true};},images:async()=>{later++;return {partial:true};},videos:async({run})=>{run.episodes=[{number:1,stage:'done'}];}}});
 await controller.restore();const run=await controller.create('p',productionDefaults());await controller.start(run.id);assert.equal(later,0);assert.equal(run.stages.prompts.status,'partial');assert.equal(run.stages.images,undefined);assert(run.logs.some(log=>log.text.includes('已有提示词无需重复审核')));assert(!run.logs.some(log=>log.text.includes('继续使用已发布结果')));
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

test('Agent conversation persists streamed assistant text before the final response arrives',async()=>{
 let release,delta;const pending=new Promise(r=>release=r),saved=[];
 const c=createProductionController({load:async()=>[],save:async r=>saved.push(structuredClone(r)),adapters:{chat:async(run,{onDelta})=>{delta=onDelta;await onDelta('先');await pending;await onDelta('后');return{reply:'先后',action:'none'};}}});
 const run=await c.create('p',productionDefaults());const request=c.chat(run.id,{text:'继续执行',model:'m'});for(let i=0;i<20&&!delta;i++)await new Promise(r=>setImmediate(r));assert.equal(run.conversation.at(-1).role,'assistant');assert.equal(run.conversation.at(-1).text,'先');release();await request;assert.equal(run.conversation.at(-1).text,'先后');assert(saved.some(snapshot=>snapshot.conversation?.some(message=>message.role==='assistant'&&message.text==='先')));
});
test('chat cannot change projects after paid submissions and failed action remains visible',async()=>{
 const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{chat:async()=>({reply:'尝试改选',action:'select_collab',projectId:'other'}),selectCollab:async()=>{throw Error('不应执行');}}});const run=await c.create('p',productionDefaults());run.items=[{id:'submitted'}];
 await assert.rejects(c.chat(run.id,{text:'切换',model:'m'}),/已有视频提交记录/);assert.match(run.conversation.at(-1).text,/指令未完成/);assert.equal(run.collabProjectId,undefined);
});

test('Agent tool receipts stay readable while the full result remains available to the Agent',async()=>{
 let controller;
 const adapters={inspect:async()=>({config:{agentPath:'C:/private/codex.exe'},episodes:60}),chat:async run=>{const result=await controller.agentTool(run.id,'xingzhou_task',{action:'inspect'});assert.equal(result.episodes,60);return{reply:'已读取当前任务。',action:'none'};}};
 controller=createProductionController({load:async()=>[],save:async()=>{},adapters});const run=await controller.create('p',productionDefaults());await controller.chat(run.id,{text:'读取当前任务',model:'m'});
 const receipt=run.conversation.find(message=>message.kind==='tool');assert.equal(receipt.text,'已读取当前任务、制作设置与进度。');assert.doesNotMatch(receipt.text,/config|agentPath|\{|\}/);
});


test('coverage requires every active planned segment, including a missing tail',()=>{
 const ep={id:'e',content:'1-1 客厅 日 内\n甲说话。',activeQuickScenePlanIds:{'1-1':'plan'},quickScenePlans:[{id:'plan',sceneLabel:'1-1',segments:[{id:'a',index:1},{id:'b',index:2},{id:'c',index:3}]}],prompts:[{label:'1-1-1',content:'已完成',segmentationPlanId:'plan',segmentId:'a'}]};
 const scene=productionCoverage({episodes:[ep]})[0].scenes[0];assert.equal(scene.complete,false);assert.deepEqual(scene.missingLabels,['1-1-2','1-1-3']);
});
test('semi mode resumes missing upstream work and streams videos while images are still working',async()=>{
 const events=[];let release;const images=new Promise(r=>release=r);
 const controller=createProductionController({load:async()=>[],save:async()=>{},adapters:{monitor:async()=>({prompts:true,information:false,art:false,images:false}),prompts:async()=>events.push('redo-prompts'),information:async()=>events.push('information'),art:async()=>events.push('art'),images:async()=>{events.push('images-start');await images;events.push('images-done');},videos:async({run})=>{events.push('video');release();run.episodes=[{stage:'done'}];}}});
 const run=await controller.create('p',{...productionDefaults(),mode:'semi'});await controller.start(run.id);assert.deepEqual(events,['information','art','images-start','video','images-done']);assert.equal(run.status,'done');
});

test('new setup for the same project resumes durable task identity after restart',async()=>{
 let disk=[];const adapters={validateSettings:async()=>{}};const make=()=>createProductionController({load:async()=>structuredClone(disk),save:async r=>{disk=[structuredClone(r),...disk.filter(x=>x.id!==r.id)]},adapters});
 let c=make();await c.restore();const old=await c.create('p',productionDefaults());old.collabProjectId='collab';old.items=[{id:'clip',jobId:'paid-job',status:'uncertain'}];old.referencePlans={clip:{verified:true}};old.episodes=[{number:1,stage:'waiting'}];await c.updateSettings(old.id,{videoConcurrency:4});
 c=make();await c.restore();const resumed=await c.createOrResume('p',{...productionDefaults(),videoConcurrency:8});assert.equal(resumed.id,old.id);assert.equal(c.snapshot().length,1);assert.equal(resumed.items[0].jobId,'paid-job');assert.equal(resumed.items[0].status,'uncertain');assert.equal(resumed.collabProjectId,'collab');assert.equal(resumed.referencePlans.clip.verified,true);assert.equal(resumed.config.videoConcurrency,8);
 resumed.status='running';await assert.rejects(c.createOrResume('p',productionDefaults()),/暂停/);assert.equal(c.snapshot().length,1);
});
test('failed settings persistence and validation preserve old configuration and output receipts',async()=>{
 let fail=false;const c=createProductionController({load:async()=>[],save:async()=>{if(fail)throw Error('disk full')},adapters:{validateSettings:async v=>{if(v.videoConcurrency===0)throw Error('invalid')}}});const r=await c.create('p',productionDefaults());r.items=[{id:'clip',status:'downloaded',outputFile:'keep.mp4',sha256:'hash',upscaleStatus:'done'}];
 await assert.rejects(c.updateSettings(r.id,{outputRoot:'another'}),/原输出目录/);await assert.rejects(c.updateSettings(r.id,{upscaleFactor:4}),/原倍率/);await assert.rejects(c.updateSettings(r.id,{videoConcurrency:0}),/invalid/);
 fail=true;await assert.rejects(c.updateSettings(r.id,{videoConcurrency:9}),/disk full/);assert.equal(r.config.videoConcurrency,2);assert.equal(r.items[0].outputFile,'keep.mp4');
});

test('saving settings excludes start until the durable write finishes',async()=>{
 let release,entered,block=false;const enteredPromise=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const c=createProductionController({load:async()=>[],save:async()=>{if(block){entered();await gate;}},adapters:{videos:async()=>{}}});const run=await c.create('p',productionDefaults());block=true;const saving=c.updateSettings(run.id,{videoConcurrency:6});await enteredPromise;await assert.rejects(c.start(run.id),/设置正在保存/);release();await saving;assert.equal(run.config.videoConcurrency,6);assert.equal(run.status,'paused');
});

test('failed conversational turn releases dispatch hold and clears visible chat activity',async()=>{const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{chat:async()=>{throw Error('连接断开');}}});const run=await c.create('p',productionDefaults());await assert.rejects(c.chat(run.id,{text:'读状态'}),/连接断开/);assert.equal(run.dispatchHold,false);assert.equal(run.chatActive,false);});

test('provider message items retain commentary and final reply as distinct messages',async()=>{let c;const adapters={chat:async run=>{await c.chatDelta(run.id,'正在核对',undefined,{itemId:'commentary'});await c.chatDelta(run.id,'已核对完成',undefined,{itemId:'final'});return{reply:'正在核对已核对完成',action:'none'};}};c=createProductionController({load:async()=>[],save:async()=>{},adapters});const run=await c.create('p',productionDefaults());await c.chat(run.id,{text:'检查项目'});assert.deepEqual(run.conversation.filter(m=>m.role==='assistant').map(m=>m.text),['正在核对','已核对完成']);});

test('model selection rechecks activity after async validation and cannot change an active reply',async()=>{let validated,finish;const validation=new Promise(r=>validated=r),reply=new Promise(r=>finish=r);const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{validateAgentModel:async()=>{await validation;return{defaultEffort:'low'};},chat:async()=>{await reply;return{reply:'完成',action:'none'};}}});const run=await c.create('p',{...productionDefaults(),agentModel:'original'});const selecting=c.updateAgentModel(run.id,'new');const chatting=c.chat(run.id,{text:'读取当前任务'});validated();await assert.rejects(selecting,/状态已变化/);assert.equal(run.config.agentModel,'original');finish();await chatting;});
test('model and supported effort persist together for subsequent turns',async()=>{const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{validateAgentModel:async()=>({defaultEffort:'low'})}});const run=await c.create('p',productionDefaults());await c.updateAgentModel(run.id,'model','high');assert.equal(run.config.agentEffort,'high');await c.updateAgentModel(run.id,'other');assert.equal(run.config.agentEffort,'low');});
test('ACP instructions queue inside one workflow and stop cancels queued work',async()=>{
 const calls=[];let releaseFirst,releaseThird;const first=new Promise(resolve=>releaseFirst=resolve),third=new Promise(resolve=>releaseThird=resolve);const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{chat:async(run,{text})=>{calls.push(text);if(calls.length===1)await first;if(calls.length===3)await third;return{reply:'已处理 '+text,action:'none'};},pause:async()=>{}}});const run=await c.create('p',{...productionDefaults(),agentProtocol:'hermes'});
 const pending=c.chat(run.id,{text:'先完成第一集'});await new Promise(resolve=>setImmediate(resolve));const queued=await c.chat(run.id,{text:'第一集完成后继续全剧'});assert.equal(queued.queued,true);assert.equal(calls.length,1);releaseFirst();await pending;for(let i=0;i<30&&calls.length<2;i++)await new Promise(resolve=>setTimeout(resolve,1));assert.deepEqual(calls,['先完成第一集','第一集完成后继续全剧']);
 const active=c.chat(run.id,{text:'新安排'});await new Promise(resolve=>setImmediate(resolve));const stopped=await c.chat(run.id,{text:'不应执行的排队项'});assert.equal(stopped.queued,true);await c.pause(run.id);assert.deepEqual(run.pendingChats,[]);assert.equal(run.status,'paused');releaseThird();await active;assert.deepEqual(calls,['先完成第一集','第一集完成后继续全剧','新安排']);
});

test('composer stop cancels one turn and queued ACP instructions while the default workflow stays running',async()=>{
 let finish,oldDelta,cancelled=0;
 const c=createProductionController({load:async()=>[],save:async()=>{},adapters:{
  stopChat:async()=>{cancelled++;},chat:async(r,{text,onDelta})=>{
   if(text==='new')return {reply:'fresh',action:'none'};
   oldDelta=onDelta;return new Promise(resolve=>finish=resolve);
  }
 }});
 const r=await c.create('project',{...productionDefaults(),agentProtocol:'acp'});r.status='running';
 const pending=c.chat(r.id,{text:'old'});while(!finish)await new Promise(resolve=>setImmediate(resolve));
 await c.chat(r.id,{text:'queued'});await c.stopChat(r.id);
 assert.equal(r.status,'running');assert.equal(r.chatActive,false);assert.equal(cancelled,1);
 assert.deepEqual(r.pendingChats,[]);await c.chat(r.id,{text:'new'});
 await oldDelta('late delta');finish({reply:'late',action:'set_scope',scope:{episodes:[1],until:'edit'}});await pending;
 assert(!r.executionScope);assert.deepEqual(r.operatorInstructions.map(i=>i.text),['new']);
 assert.deepEqual(r.chatTurns.map(t=>t.status),['cancelled','finished']);
 assert(!r.conversation.some(m=>m.text.includes('late')));
});
