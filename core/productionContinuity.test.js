import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionController,productionDefaults} from './productionFurnace.js';
const tick=()=>new Promise(r=>setImmediate(r));

test('a scoped instruction resumes the original paused pipeline by default and preserves paid receipts',async()=>{
 let c,executed=0;const adapters={chat:async run=>{const receipt=await c.agentTool(run.id,'xingzhou_task',{action:'set_scope',episodes:[1]});assert.equal(receipt.resumeRequested,true);return{action:'none',reply:'先交付第一集'};},videos:async({run})=>{executed++;assert.equal(run.config.endStage,'edit');assert.equal(run.items[0].jobId,'original');assert.equal(run.executionScope.until,'edit');run.episodes=[{number:1,stage:'done'},{number:2,stage:'waiting'}];}};
 c=createProductionController({load:async()=>[],save:async()=>{},adapters});const run=await c.create('p',productionDefaults());run.items=[{id:'paid',jobId:'original'}];await c.chat(run.id,{text:'先把第一集生成、超分并剪好'});for(let n=0;n<30&&!executed;n++)await tick();assert.equal(executed,1);
});

test('an in-flight chat and live scope revision never pause or spawn another executor',async()=>{
 let c,releaseVideo,releaseChat,entered=false,count=0;const video=new Promise(r=>releaseVideo=r),chat=new Promise(r=>releaseChat=r);
 c=createProductionController({load:async()=>[],save:async()=>{},adapters:{videos:async({run})=>{count++;entered=true;await video;run.episodes=[{number:1,stage:'done'}];},chat:async run=>{assert.notEqual(run.dispatchHold,true);await c.agentTool(run.id,'xingzhou_task',{action:'set_scope',episodes:[1]});assert.equal(run.status,'running');await c.agentTool(run.id,'xingzhou_task',{action:'run_stage',stage:'videos'});await chat;return{action:'none',reply:'持续接续'};}}});
 const run=await c.create('p',productionDefaults());const execution=c.start(run.id);while(!entered)await tick();const request=c.chat(run.id,{text:'先做第一集'});try{for(let n=0;n<10;n++)await tick();assert.equal(run.status,'running');assert.equal(run.chatActive,true);assert.equal(run.planRevision,1);}finally{releaseVideo();releaseChat();}await request;await execution;assert.equal(count,1);assert.equal(run.status,'paused');assert.match(run.message,/完成/);
});

test('a user pause cancels pending resume requested by a scope tool',async()=>{
 let c;const runGate={};let release;const gate=new Promise(r=>release=r);c=createProductionController({load:async()=>[],save:async()=>{},adapters:{videos:async()=>{runGate.started=true;await gate;},chat:async run=>{await c.agentTool(run.id,'xingzhou_task',{action:'set_scope',episodes:[1]});await c.agentTool(run.id,'xingzhou_task',{action:'pause'});return{action:'none',reply:'已暂停'};}}});const run=await c.create('p',productionDefaults());await c.chat(run.id,{text:'先调整范围，然后暂停'});release();for(let n=0;n<10;n++)await tick();assert.equal(run.status,'paused');assert.equal(run.chatPaused,true);
});


test('pause then continue before an old scoped executor exits queues a fresh epoch without overlap',async()=>{
 let c,release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);let count=0,live=0,peak=0;
 c=createProductionController({load:async()=>[],save:async()=>{},adapters:{videos:async({run})=>{count++;live++;peak=Math.max(peak,live);try{if(count===1){entered();await gate;}else run.episodes=[{number:1,stage:'done'}];}finally{live--;}},chat:async(run,{text})=>{if(text==='范围')await c.agentTool(run.id,'xingzhou_task',{action:'set_scope',episodes:[1]});else await c.agentTool(run.id,'xingzhou_task',{action:text==='暂停'?'pause':'continue'});return{action:'none',reply:'已接收'};}}});
 const run=await c.create('p',productionDefaults());await c.chat(run.id,{text:'范围'});await started;await c.chat(run.id,{text:'暂停'});await c.chat(run.id,{text:'继续'});release();for(let n=0;n<100&&count<2;n++)await new Promise(r=>setTimeout(r,2));assert.equal(count,2);assert.equal(peak,1);
});
