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
test('partial art/images stay resumable and cannot make the whole run complete',async()=>{
 let images=0,art=0;const saved=[];
 const controller=createProductionController({load:async()=>[],save:async r=>saved.push(structuredClone(r)),adapters:{prompts:async()=>{},art:async()=>{art++;return {partial:true};},images:async()=>{images++;return {partial:true};},videos:async({run})=>{run.episodes=[{number:1,stage:'done'}];}}});
 await controller.restore();const run=await controller.create('p',productionDefaults());await controller.start(run.id);
 assert.equal(run.status,'attention');assert.equal(run.stages.images.status,'partial');
 await controller.start(run.id);assert.equal(images,2);assert.equal(art,2);
});
test('stage problems are logged and later stages still run',async()=>{
 const saved=[];let later=0;const controller=createProductionController({load:async()=>[],save:async r=>saved.push(structuredClone(r)),adapters:{prompts:async()=>{throw Error('已有提示词无需重复审核');},art:async({notice})=>{await notice('清单部分关联，继续使用已发布结果');return {partial:true};},images:async()=>{later++;return {partial:true};},videos:async({run})=>{run.episodes=[{number:1,stage:'done'}];}}});
 await controller.restore();const run=await controller.create('p',productionDefaults());await controller.start(run.id);assert.equal(later,1);assert.equal(run.stages.prompts.status,'partial');assert.equal(run.stages.images.status,'partial');assert(run.logs.some(log=>log.text.includes('已有提示词无需重复审核')));assert(run.logs.some(log=>log.text.includes('继续使用已发布结果')));
});
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
