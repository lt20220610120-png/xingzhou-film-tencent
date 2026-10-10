import test from 'node:test';
import assert from 'node:assert/strict';
import {createDirectorManualController,commitManualSceneRun} from './directorManualGeneration.js';
import {createDirectorBatchPlan,createDirectorBatchController} from './directorBatchGeneration.js';
import {directorSceneInput} from './directorQuickStore.js';
import {createQuickGenerationController} from './directorQuickGeneration.js';

function fixture(){
 let state={accountId:'a',skills:[{id:'s',name:'完整Skill',content:'原有格式'}],apiProfiles:[{id:'m',model:'mock',apiKey:'secret'}],directorProjects:[{id:'p',name:'整本人工分段',episodes:[{id:'setting',kind:'setting',content:'世界观'},{id:'e1',content:'1-1 房间 日 内\n（1）\n甲：你好。\n（2）\n甲：再见。\n1-2 走廊 日 内\n甲：走吧。'},{id:'e2',content:'2-1 花园 日 外\n（1）\n乙：我来了。'}]}]};
 const records=new Map(),calls=[];let hold=null,fail='',active=0,peak=0,outputOverride=null;
 const checkpoints={list:async()=>[...records.values()].map(x=>structuredClone(x)),load:async({runId})=>structuredClone(records.get(runId)),save:async({run})=>records.set(run.id,structuredClone(run))};
 const getContext=t=>{const project=state.directorProjects[0],episode=project.episodes.find(e=>e.id===t.episodeId);return{accountId:state.accountId,project,episode,skill:state.skills[0],profile:state.apiProfiles[0],inputText:directorSceneInput(project,episode,t.sceneLabel),permissions:{canGenerate:!project.cloudLocked}};};
 const make=()=>createDirectorManualController({getContext,checkpoints,executeSkill:async payload=>{calls.push(payload);active++;peak=Math.max(peak,active);try{if(hold)await hold;if(fail===payload.snapshot.sceneLabel)throw Error('模拟断网');return outputOverride??payload.expectedLabels.map(label=>`${label}\n按原文生成的提示词`).join('\n\n');}finally{active--; }},commitRun:async run=>{const result=commitManualSceneRun(state,run);state=result.state;return result;}});
 const manual=make(),batch=createDirectorBatchController({sceneController:manual,getContext,checkpoints});
 return{manual,batch,make,records,calls,get state(){return state;},get peak(){return peak;},setHold:v=>hold=v,setFail:v=>fail=v,setOutput:v=>outputOverride=v,plan:opts=>createDirectorBatchPlan({accountId:'a',project:state.directorProjects[0],skill:state.skills[0],profile:state.apiProfiles[0],maxDurationSeconds:30,segmentationMode:'manual',concurrency:2,...opts})};
}
async function until(fn){for(let i=0;i<300&&!fn();i++)await new Promise(r=>setTimeout(r,2));assert.ok(fn());}
test('manual whole script preserves numbered cuts, excludes settings, uses bounded concurrency and one original Skill call per scene',async()=>{
 const f=fixture();let release;f.setHold(new Promise(r=>release=r));const plan=await f.plan();assert.equal(plan.snapshot.segmentationMode,'manual');assert.equal(plan.manualPromptCount,4);
 const task=f.batch.start(plan);await until(()=>f.calls.length===2);assert.equal(f.peak,2);assert.deepEqual(f.calls[0].expectedLabels,['1-1-1','1-1-2']);assert.match(f.calls[0].input,/（1）[\s\S]*（2）/);assert.match(f.calls[0].input,/不拆增条数/);assert.ok(!JSON.stringify(plan).includes('secret'));release();const done=await task;assert.equal(done.phase,'completed');assert.equal(f.calls.length,3);assert.ok(f.peak<=2);assert.deepEqual(f.state.directorProjects[0].episodes[1].prompts.map(p=>p.label),['1-1-1','1-1-2','1-2-1']);
});
test('paid reply is reused after commit failure or restart; a completed scene is not billed twice',async()=>{
 const f=fixture();const plan=await f.plan({concurrency:1});f.setFail('1-2');const first=await f.batch.start(plan);assert.equal(first.phase,'completed-with-errors');f.setFail('');const next=await f.batch.resume(first.id);assert.equal(next.phase,'completed');assert.equal(f.calls.filter(c=>c.snapshot.sceneLabel==='1-1').length,1);
 const run=f.manual.entries().find(r=>r.snapshot.sceneLabel==='1-1');const paid=structuredClone(run);paid.phase='ready-to-commit';f.records.set(paid.id,paid);const restored=f.make();await restored.restore();await restored.resume(paid.id);assert.equal(f.calls.filter(c=>c.snapshot.sceneLabel==='1-1').length,1);assert.equal(f.state.directorProjects[0].episodes[1].prompts.filter(p=>p.generationRunId===paid.id).length,2);
});
test('manual pause drains started replies, keeps results, and does not admit more scenes',async()=>{
 const f=fixture();let release;f.setHold(new Promise(r=>release=r));const task=f.batch.start(await f.plan({concurrency:1}));await until(()=>f.calls.length===1);await f.batch.pause(f.batch.entries()[0].id);release();const paused=await task;assert.equal(paused.phase,'paused');assert.equal(f.calls.length,1);assert.equal(paused.targets[0].status,'completed');f.setHold(null);assert.equal((await f.batch.resume(paused.id)).phase,'completed');assert.equal(f.calls.filter(c=>c.snapshot.sceneLabel==='1-1').length,1);
});
test('editing a source or locking a project during a paid response preserves the reply without overwriting local edits',async()=>{
 for(const action of ['source','lock','account']){const f=fixture();let release;f.setHold(new Promise(r=>release=r));const task=f.batch.start(await f.plan({concurrency:1}));await until(()=>f.calls.length===1);if(action==='source')f.state.directorProjects[0].episodes[1].quickSceneEdits={'1-1':'人工新修改'};if(action==='lock')f.state.directorProjects[0].cloudLocked=true;if(action==='account')f.state.accountId='b';release();const result=await task;assert.notEqual(result.targets[0].status,'completed');assert.ok(f.manual.entries()[0].output.includes('1-1-1'));assert.equal((f.state.directorProjects[0].episodes[1].prompts||[]).some(p=>p.label.startsWith('1-1-')),false);}
});
test('malformed paid numbering is retained and resuming never loops paid generation; duplicate or empty manual boundaries fail before calling AI',async()=>{
 const f=fixture();f.setOutput('1-1-1\n只有一段');const first=await f.batch.start(await f.plan({concurrency:1}));const bad=first.targets[0],calls=f.calls.length;await f.batch.resume(first.id);assert.equal(f.calls.length,calls);assert.equal(f.manual.get(bad.sceneRunId).output,'1-1-1\n只有一段');
 for(const content of ['1-1 家 日 内\n（1）\n甲：你好。\n（1）\n甲：再见。','1-1 家 日 内\n（1）\n（2）\n甲：再见。']){const g=fixture();g.state.directorProjects[0].episodes[1].content=content;await assert.rejects(g.plan(),/重复|空白/);assert.equal(g.calls.length,0);}
});
test('automatic mode cannot resume a paid manual checkpoint or trigger new planning/Skill calls',async()=>{
 const f=fixture();f.setOutput('1-1-1\n只有一段');const done=await f.batch.start(await f.plan({concurrency:1}));const id=done.targets[0].sceneRunId;let calls=0;
 const auto=createQuickGenerationController({getContext:()=>null,executeText:async()=>{calls++;},executeSkill:async()=>{calls++;},checkpoints:{list:async()=>[...f.records.values()],load:async({runId})=>f.records.get(runId),save:async()=>{}},commitRun:async()=>{throw Error('must not publish');}});
 await auto.restore();assert.equal(auto.entries().some(r=>r.kind==='manual-scene'),false);await assert.rejects(auto.resume(id),/人工分段/);assert.equal(calls,0);
});
