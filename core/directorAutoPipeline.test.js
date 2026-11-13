import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuickGenerationController} from './directorQuickGeneration.js';
import {commitQuickSceneRun} from './directorQuickStore.js';
import {promptsForScene} from './directorCreative.js';

function fixture({planFails=false,auditFails=false,skillFails=false,emptyStage='',controlStage='',controlCode='STOPPED',pace=50,maxDurationSeconds=15,assessmentSeconds=12,body='人物：甲、乙\n甲：今天我们终于见面了，我等了你很久。\n乙：我知道，但有些事情必须当面说清楚。\n△甲放下杯子，转头看向门口。'}={}){
 const source='1-1 餐厅 日 内\n'+body;
 let state={accountId:'account',skills:[{id:'skill',name:'fixture',content:'按每个编号返回完整视频提示词。'}],apiProfiles:[{id:'model',model:'fixture'}],directorProjects:[{id:'project',style:'真人电影级',aspectRatio:'9:16',episodes:[{id:'episode',title:'第1集',content:source}]}]};
 const calls=[],records=new Map(),requests={};
 const context=()=>({accountId:state.accountId,project:state.directorProjects[0],episode:state.directorProjects[0].episodes[0],skill:state.skills[0],profile:state.apiProfiles[0],sceneLabel:'1-1',inputText:source,maxDurationSeconds,pace,permissions:{canGenerate:true}});
 const commit=(run,partial)=>{const result=commitQuickSceneRun(state,run,{partial});state=result.state;return result;};
 const controller=createQuickGenerationController({editorialPlanning:true,groundedTiming:true,getContext:context,
  checkpoints:{save:async({run})=>records.set(run.id,structuredClone(run)),load:async({runId})=>records.get(runId),list:async()=>[...records.values()]},
  executeText:async({messages})=>{const kind=messages[0].content.includes('核对')?'audit':'plan';calls.push(kind);requests[kind]=messages;if(kind===controlStage)throw Object.assign(Error('execution control'),{code:controlCode});if(kind===emptyStage)return '';if(kind==='plan'&&planFails||kind==='audit'&&auditFails)throw Error('all accounts are temporarily unavailable, please retry later');return kind==='audit'?'{"ok":true,"issues":[]}':JSON.stringify({estimatedSceneSeconds:assessmentSeconds});},
  executeSkill:async request=>{calls.push('skill');requests.skill=request;if(emptyStage==='skill')return '';if(skillFails)throw Error('all accounts are temporarily unavailable, please retry later');return request.expectedLabels.map(label=>`${label}\n【画面内容】\n完整表演与台词。`).join('\n\n');},
  commitProgress:run=>commit(run,true),commitRun:run=>commit(run,false)});
 return{controller,context,calls,requests,get state(){return state;}};
}

test('fastest pace changes a long dialogue plan, survives model timing inflation and publishes every card',async()=>{
 const body=Array.from({length:24},(_,i)=>`${i%2?'乙':'甲'}：这件事情没你想的那么简单，我们现在必须马上赶过去处理清楚！`).join('\n');
 const compact=fixture({body,pace:0,maxDurationSeconds:30,planFails:true});
 const fast=fixture({body,pace:-100,maxDurationSeconds:30,assessmentSeconds:180});
 const previous=await compact.controller.start(compact.context());
 const run=await fast.controller.start(fast.context());
 assert.equal(run.phase,'completed',JSON.stringify(run.errors));
 assert.deepEqual(fast.calls,['plan','skill','audit']);
 assert.ok(run.plan.editorialBudget.totalEstimatedSeconds<previous.plan.editorialBudget.totalEstimatedSeconds*0.8);
 assert.ok(run.plan.segments.length<previous.plan.segments.length);
 assert.equal(run.plan.segments.map(s=>run.plan.sourceText.slice(s.sourceStart,s.sourceEnd)).join(''),body);
 const cards=promptsForScene(fast.state.directorProjects[0].episodes[0].prompts,'1-1');
 assert.equal(cards.length,run.plan.segments.length);
 assert.ok(cards.every(p=>p.pace===-100&&p.recommendedDurationSeconds>0&&p.recommendedDurationSeconds<=30&&p.generationComplete));
 assert.match(fast.requests.skill.input,/极紧凑.*8\.4字\/秒/);
 assert.match(fast.requests.audit[1].content,/极紧凑.*8\.4字\/秒/);
});

test('whole scene endpoint retains a long scene in one saved prompt and reports the duration conflict',async()=>{
 const body=Array.from({length:24},(_,i)=>`${i%2?'乙':'甲'}：这件事情没你想的那么简单，我们现在必须马上赶过去处理清楚！`).join('\n');
 const f=fixture({body,pace:-200,maxDurationSeconds:30,planFails:true});
 const run=await f.controller.start(f.context());
 assert.equal(run.phase,'completed',JSON.stringify(run.errors));
 assert.equal(run.plan.segments.length,1);
 assert.equal(run.plan.segments[0].sourceEnd,body.length);
 assert.equal(run.plan.sourceText,body);
 assert.ok(run.plan.editorialBudget.totalEstimatedSeconds<30);
 assert.ok(run.plan.editorialBudget.referenceSeconds>30);
 assert.ok(run.auditWarnings.some(w=>w.code==='SCENE_CAPACITY_CALIBRATED'));
 assert.deepEqual(f.calls,['skill','audit']);
 assert.match(f.requests.skill.input,/逐镜估算/);
 const cards=promptsForScene(f.state.directorProjects[0].episodes[0].prompts,'1-1');
 assert.equal(cards.length,1);
 assert.equal(cards[0].recommendedDurationSeconds,run.plan.editorialBudget.totalEstimatedSeconds);
});

test('automatic planning outage falls back locally then generates visible prompts with selected pace and durations',async()=>{
 const f=fixture({planFails:true});const run=await f.controller.start(f.context());
 assert.equal(run.phase,'completed',JSON.stringify(run.errors));
 assert.deepEqual(f.calls,['plan','skill','audit']);
 const cards=promptsForScene(f.state.directorProjects[0].episodes[0].prompts,'1-1');
 assert.equal(cards.length,run.plan.segments.length);assert.ok(cards.length>0);
 assert.equal(run.snapshot.pace,50);assert.equal(run.snapshot.maxDurationSeconds,15);
 cards.forEach((card,i)=>{assert.equal(card.recommendedDurationSeconds,run.plan.segments[i].recommendedDurationSeconds);assert.equal(card.pace,50);assert.ok(card.recommendedDurationSeconds>0&&card.recommendedDurationSeconds<=15);});
 assert.ok(run.auditWarnings.some(w=>w.code==='PLANNING_UNAVAILABLE'));
});

test('read-only audit outage annotates generated prompts without failing the completed scene or duplicating Skill calls',async()=>{
 const f=fixture({auditFails:true});const run=await f.controller.start(f.context());
 assert.equal(run.phase,'completed',JSON.stringify(run.errors));assert.deepEqual(f.calls,['plan','skill','audit']);
 assert.ok(run.auditWarnings.some(w=>w.code==='AUDIT_UNAVAILABLE'));
 const cards=f.state.directorProjects[0].episodes[0].prompts;
 assert.ok(cards.length>0);assert.ok(cards.every(card=>card.sceneAuditStatus==='warning'&&card.recommendedDurationSeconds>0));
 await f.controller.resume(run.id);assert.equal(f.calls.filter(c=>c==='skill').length,1);
});

test('automatic pipeline preserves manual/automatic controls and pace across duration selections',async()=>{
 for(const pace of [0,50,100])for(const maxDurationSeconds of [0,10,30,35]){
  const f=fixture({planFails:true,pace,maxDurationSeconds});const run=await f.controller.start(f.context());
  assert.equal(run.phase,'completed',JSON.stringify({pace,maxDurationSeconds,errors:run.errors}));
  const cards=f.state.directorProjects[0].episodes[0].prompts;
  assert.ok(cards.length>0);assert.ok(cards.every(p=>p.recommendedDurationSeconds>=1&&p.recommendedDurationSeconds<=(maxDurationSeconds||35)&&p.pace===pace&&p.segmentationMode==='auto'));
 }
});

test('empty planning or audit bodies are non-blocking, while empty Skill output stays failed',async()=>{
 for(const stage of ['plan','audit','skill']){
  const f=fixture({emptyStage:stage});const run=await f.controller.start(f.context());
  assert.equal(run.phase,stage==='skill'?'failed':'completed',JSON.stringify(run.errors));
  assert.equal(f.calls.filter(c=>c==='skill').length,1);
 }
});

test('execution-layer cancellation and permission revocation are never downgraded into continued paid work',async()=>{
 for(const controlStage of ['plan','audit'])for(const controlCode of ['STOPPED','PAUSED','ACCOUNT_CHANGED','FORBIDDEN','UNAUTHORIZED','RATE_LIMITED']){
  const f=fixture({controlStage,controlCode}),run=await f.controller.start(f.context());
  assert.notEqual(run.phase,'completed',`${controlStage}/${controlCode}`);
  assert.equal(run.errors[0].code,controlCode);
  if(controlStage==='plan')assert.deepEqual(f.calls,['plan']);
  else assert.equal(f.calls.filter(c=>c==='skill').length,1);
 }
});

test('actual Skill outage is never fabricated into a prompt or retried as a paid generation',async()=>{
 const f=fixture({skillFails:true});const run=await f.controller.start(f.context());
 assert.equal(run.phase,'failed');assert.equal(f.calls.filter(c=>c==='skill').length,1);
 assert.equal(f.state.directorProjects[0].episodes[0].prompts,undefined);
 assert.equal(run.wholeSceneResponses?.length||0,0);
});
