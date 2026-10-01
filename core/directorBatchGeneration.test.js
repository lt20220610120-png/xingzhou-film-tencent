import test from 'node:test';
import assert from 'node:assert/strict';
import {createDirectorBatchPlan,createDirectorBatchController} from './directorBatchGeneration.js';
import {createQuickGenerationController} from './directorQuickGeneration.js';
import {commitQuickSceneRun,directorSceneInput} from './directorQuickStore.js';

function fixture(){
 let state={accountId:'a',skills:[{id:'s',name:'generic',content:'生成编号提示词'}],apiProfiles:[{id:'m',model:'mock',apiKey:'must-not-persist'}],directorProjects:[{id:'p',name:'测试全剧',style:'真人电影集',aspectRatio:'9:16',episodes:[
 {id:'setting',kind:'setting',title:'设定和小传',content:'背景'},
 {id:'e1',title:'第1集',content:'1-1 景：房间 夜 内\n甲：我来关灯。\n1-2 景：走廊 夜 内\n乙：我先走了。'},
 {id:'e2',title:'第2集',content:''},
 {id:'e3',title:'第3集',content:'3-1 景：房间 日 内\n甲：我回来了。'},
 ]}]};
 const records=new Map(),calls=[];let failScene='',waitRequest=null;
 const checkpoints={save:async({run})=>records.set(run.id,structuredClone(run)),load:async({runId})=>structuredClone(records.get(runId)),list:async()=>[...records.values()].map(x=>structuredClone(x))};
 const getContext=target=>{const project=state.directorProjects.find(p=>p.id===target.projectId),episode=project.episodes.find(e=>e.id===target.episodeId);return {accountId:state.accountId,project,episode,inputText:directorSceneInput(project,episode,target.sceneLabel),skill:state.skills[0],profile:state.apiProfiles[0],permissions:{canGenerate:true}};};
 const scene=createQuickGenerationController({getContext,checkpoints,groundedTiming:true,executeText:async payload=>{
   calls.push({kind:payload.messages[0].content.includes('核对')?'audit':'plan',scene:payload.snapshot.sceneLabel});
   if(payload.messages[0].content.includes('核对'))return '{"ok":true,"issues":[]}';
   return JSON.stringify({segments:[{end:{unitId:'u1'},timing:{speechSeconds:2,actionSeconds:2,overlapSeconds:0,transitionSeconds:0},startState:'起点',endState:'终点',boundary:'scene-end',visualNotes:[]}]});
 },executeSkill:async payload=>{
   calls.push({kind:'skill',scene:payload.snapshot.sceneLabel});
   if(waitRequest){const pending=waitRequest;waitRequest=null;await pending;}
   if(failScene===payload.snapshot.sceneLabel)throw new Error('模拟断网');
   return `${payload.snapshot.sceneLabel}-1\n正常镜头与原台词。`;
 },commitRun:async run=>{const result=commitQuickSceneRun(state,run);state=result.state;return result;}});
 const deps={sceneController:scene,checkpoints,getContext};
 const batch=createDirectorBatchController(deps);
 return {batch,scene,deps,records,calls,get state(){return state;},setFailure:label=>{failScene=label;},waitOn:promise=>{waitRequest=promise;},changeAccount:()=>{state.accountId='other';},plan:opts=>createDirectorBatchPlan({accountId:state.accountId,project:state.directorProjects[0],skill:state.skills[0],profile:state.apiProfiles[0],maxDurationSeconds:30,...opts})};
}

test('enumeration keeps episode numbering, excludes settings and empty scenes, and snapshots edited sources',async()=>{
 const f=fixture();f.state.directorProjects[0].episodes[1].quickSceneEdits={'1-1':'1-1 景：房间 夜 内\n甲：我换句话说。'};
 const plan=await f.plan();assert.deepEqual(plan.targets.map(t=>t.sceneLabel),['1-1','1-2','3-1']);
 assert.deepEqual(plan.targets.map(t=>t.episodeNumber),[1,1,3]);assert.equal(plan.kind,'batch');
 assert.ok(!JSON.stringify(plan).includes('must-not-persist'));assert.ok(!JSON.stringify(plan).includes('我换句话说'));
});

test('default skips existing manual results without pretending they are complete; append preserves them',async()=>{
 const f=fixture();f.state.directorProjects[0].episodes[1].prompts=[{id:'old',label:'1-1-1',content:'人工结果'}];
 const plan=await f.plan();assert.equal(plan.targets[0].status,'skipped');assert.match(plan.targets[0].reason,/已有/);
 const done=await f.batch.start(plan);assert.equal(done.phase,'completed');assert.equal(done.targets.filter(t=>t.status==='completed').length,2);
 assert.equal(f.calls.filter(c=>c.scene==='1-1').length,0);assert.equal(f.state.directorProjects[0].episodes[1].prompts[0].content,'人工结果');
});

test('sequential whole script produces and saves each scene and resumes only interrupted work after restart',async()=>{
 const f=fixture();f.setFailure('1-2');const stopped=await f.batch.start(await f.plan());
 assert.equal(stopped.phase,'paused');assert.equal(stopped.targets[0].status,'completed');assert.equal(stopped.targets[1].status,'failed');
 assert.deepEqual(f.state.directorProjects[0].episodes[1].prompts.map(p=>p.label),['1-1-1']);
 f.setFailure('');const restored=createDirectorBatchController(f.deps);await restored.restore();
 assert.equal(f.calls.filter(c=>c.scene==='3-1').length,0);
 const done=await restored.resume(stopped.id);assert.equal(done.phase,'completed');assert.equal(done.targets.filter(t=>t.status==='completed').length,3);
 assert.equal(f.calls.filter(c=>c.kind==='skill'&&c.scene==='1-1').length,1);
 assert.deepEqual(f.state.directorProjects[0].episodes[1].prompts.map(p=>p.label),['1-1-1','1-2-1']);
 assert.equal(f.state.directorProjects[0].episodes[3].prompts[0].label,'3-1-1');
});

test('pause saves current paid response and does not launch the next scene; repeat resume cannot duplicate work',async()=>{
 const f=fixture();let resolve;f.waitOn(new Promise(done=>{resolve=done;}));const task=f.batch.start(await f.plan());
 for(let i=0;i<100&&!f.calls.some(c=>c.kind==='skill');i++)await new Promise(r=>setTimeout(r,2));
 const id=f.batch.entries()[0].id;await f.batch.pause(id);resolve();await task;
 assert.equal(f.batch.get(id).phase,'paused');assert.equal(f.calls.filter(c=>c.scene==='1-2').length,0);
 const before=f.calls.filter(c=>c.kind==='skill').length;
 await Promise.all([f.batch.resume(id),f.batch.resume(id)]);
 assert.equal(f.batch.get(id).phase,'completed');assert.equal(f.calls.filter(c=>c.kind==='skill').length-before,2);
});

test('changed source is marked stale while other untouched scenes can proceed',async()=>{
 const f=fixture();const plan=await f.plan();f.state.directorProjects[0].episodes[1].quickSceneEdits={'1-1':'不同内容'};
 const done=await f.batch.start(plan);assert.equal(done.targets[0].status,'stale');assert.equal(done.phase,'completed-with-errors');
 assert.equal(f.calls.filter(c=>c.scene==='1-1').length,0);assert.equal(done.targets[1].status,'completed');
});

test('account changes cannot advance another account batch or submit late output',async()=>{
 const f=fixture();let resolve;f.waitOn(new Promise(done=>{resolve=done;}));const task=f.batch.start(await f.plan());
 for(let i=0;i<100&&!f.calls.some(c=>c.kind==='skill');i++)await new Promise(r=>setTimeout(r,2));
 f.changeAccount();resolve();const stopped=await task;assert.equal(stopped.phase,'paused');
 assert.equal(f.state.directorProjects[0].episodes[1].prompts,undefined);assert.equal(f.calls.some(c=>c.scene==='1-2'),false);
});

test('ending a task stays ended when its cancelled child returns and preserves finished results',async()=>{
 const f=fixture();let resolve;f.waitOn(new Promise(done=>{resolve=done;}));const task=f.batch.start(await f.plan());
 for(let i=0;i<100&&!f.calls.some(c=>c.kind==='skill');i++)await new Promise(r=>setTimeout(r,2));
 const id=f.batch.entries()[0].id;await f.batch.cancel(id);resolve();await task;
 assert.equal(f.batch.get(id).phase,'cancelled');assert.equal(f.calls.some(c=>c.scene==='1-2'),false);
 await f.batch.resume(id);assert.equal(f.calls.some(c=>c.scene==='1-2'),false);
});

test('a 95 episode, 225 scene queue restores a mid-book interruption without replaying completed scenes',async()=>{
 const f=fixture();
 f.state.directorProjects[0].episodes=[f.state.directorProjects[0].episodes[0],...Array.from({length:95},(_,i)=>({
  id:`e${i+1}`,title:`第${i+1}集`,content:Array.from({length:i<35?3:2},(_,j)=>`${i+1}-${j+1} 景：房间 日 内\n甲：我回来了。`).join('\n'),
 }))];
 const plan=await f.plan();assert.equal(plan.episodeCount,95);assert.equal(plan.targets.length,225);
 f.setFailure('43-1');const paused=await f.batch.start(plan);
 assert.equal(paused.phase,'paused');assert.equal(paused.targets.filter(t=>t.status==='completed').length,119);
 const restored=createDirectorBatchController(f.deps);await restored.restore();f.setFailure('');
 const done=await restored.resume(paused.id);assert.equal(done.phase,'completed');assert.equal(done.targets.filter(t=>t.status==='completed').length,225);
 assert.equal(f.calls.filter(c=>c.kind==='skill'&&c.scene==='1-1').length,1);
 assert.equal(f.calls.filter(c=>c.kind==='skill').length,226);
 assert.equal(f.state.directorProjects[0].episodes[95].prompts.length,2);
});
