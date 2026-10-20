import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickGenerationController } from './directorQuickGeneration.js';
import { commitQuickSceneRun } from './directorQuickStore.js';
import { manorScene, englishManorScene } from './directorSceneBudget.fixtures.js';

function fixture({ source=manorScene, planner, skill, audit }={}) {
  let state={accountId:'a',skills:[{id:'s',name:'custom',content:'按括号输出一一对应的编号视频提示词。'}],
    apiProfiles:[{id:'m',model:'mock',apiKey:'never-checkpoint'}],
    directorProjects:[{id:'p',style:'真人电影级',aspectRatio:'9:16',episodes:[{id:'e1',title:'第1集',content:'场景 1-1 门外 日 外景'}, {id:'e',title:'第2集',content:source}]}]};
  const records=new Map(),calls=[],progress=[];
  const context=()=>({accountId:state.accountId,project:state.directorProjects[0],episode:state.directorProjects[0].episodes[1],skill:state.skills[0],profile:state.apiProfiles[0],
    inputText:source,sceneLabel:'2-1',maxDurationSeconds:32,permissions:{canGenerate:true}});
  const commit=(run,partial)=>{const result=commitQuickSceneRun(state,run,{partial});state=result.state;return result;};
  const deps={editorialPlanning:true,groundedTiming:true,maxQualityAttempts:3,getContext:context,
    checkpoints:{save:async({run})=>records.set(run.id,structuredClone(run)),load:async({runId})=>structuredClone(records.get(runId)),list:async()=>[...records.values()]},
    executeText:async payload=>{
      const type=payload.messages[0].content.includes('核对')?'audit':'plan';calls.push({type,payload});
      return type==='plan'?(planner?.(payload)??JSON.stringify({estimatedSceneSeconds:45,timingRationale:'整场英文对白、反应及进出场同步表演。'})):(audit?.(payload)??'{"ok":true,"issues":[]}');
    },
    executeSkill:async payload=>{calls.push({type:'skill',payload});return skill?.(payload,calls)??payload.expectedLabels.map(label=>`${label}\n【画面内容】\n按本段完整原话和镜头表演。`).join('\n\n');},
    commitProgress:async run=>{progress.push(structuredClone(run));return commit(run,true);},commitRun:async run=>commit(run,false)};
  return {controller:createQuickGenerationController(deps),deps,context,records,calls,progress,get state(){return state;},changeAccount(){state.accountId='b';}};
}

for(const [name,source] of [['bilingual',manorScene],['English-only',englishManorScene]]) {
  test(`${name} actual store path: fixed two brackets -> selected Skill -> two visible saved prompts`,async()=>{
    const f=fixture({source}),run=await f.controller.start(f.context());
    assert.equal(run.phase,'completed',JSON.stringify(run.errors));
    assert.equal(run.plan.segments.length,2);
    assert.deepEqual(f.calls.map(c=>c.type),['plan','skill','audit']);
    const input=f.calls.find(c=>c.type==='skill').payload;
    assert.deepEqual(input.expectedLabels,['2-1-1','2-1-2']);
    assert.match(input.input,/每段都必须转换为一条完整提示词/);
    assert.ok(input.input.includes("Before he fell into a coma"));
    assert.equal(f.state.directorProjects[0].episodes[1].prompts.length,2);
    assert.equal(f.state.directorProjects[0].promptHistory.length,2);
    assert.ok(!JSON.stringify([...f.records.values()]).includes('never-checkpoint'));
  });
}

test('capacity refusal, four-way proposal and broken planner output do not block Skill',async()=>{
  for(const output of ['拒绝，字数超过4字每秒。','{"capacityIssue":{"message":"超时"}}','{"segments":[{},{},{},{}]}','{"estimatedSceneSeconds":']){
    const f=fixture({planner:()=>output}),run=await f.controller.start(f.context());
    assert.equal(run.phase,'completed',JSON.stringify(run.errors));
    assert.equal(run.plan.segments.length,2);
    assert.equal(f.calls.filter(c=>c.type==='plan').length,1);
    assert.equal(f.state.directorProjects[0].episodes[1].prompts.length,2);
  }
});

test('missing second prompt repairs while first stays visible; review warnings never remove either card',async()=>{
  let skills=0;
  const f=fixture({skill:p=> (++skills===1?p.expectedLabels.slice(0,1):p.expectedLabels).map(label=>`${label}\n完整提示词${skills}`).join('\n\n'),
    audit:()=>JSON.stringify({ok:false,issues:[{code:'PACE_REVIEW',segmentIndex:1,message:'语速可再核对',evidence:{sourceQuote:'妈！她敢泼我！'}}]})});
  const run=await f.controller.start(f.context());
  assert.equal(run.phase,'completed',JSON.stringify(run.errors));
  assert.equal(skills,2);
  assert.ok(f.progress.some(r=>Object.values(r.segmentDrafts).filter(d=>d.prompt?.content).length===1));
  assert.match(f.state.directorProjects[0].episodes[1].prompts[0].content,/完整提示词1/);
  assert.equal(f.state.directorProjects[0].episodes[1].prompts.length,2);
});

test('resume after failed Skill reuses planned count and completed output; does not make a new planning request',async()=>{
  let fail=true;
  const f=fixture({skill:p=>{if(fail)throw Error('模拟请求失败');return p.expectedLabels.map(l=>`${l}\n对应原文`).join('\n\n');}});
  const first=await f.controller.start(f.context());
  assert.equal(first.phase,'failed');
  fail=false;
  const second=await f.controller.resume(first.id);
  assert.equal(second.phase,'completed',JSON.stringify(second.errors));
  assert.deepEqual(second.promptIds,first.promptIds);
  assert.equal(f.calls.filter(c=>c.type==='plan').length,1);
});

test('upgrade failed old plan clears only pre-generation gate, preserves original screenplay and creates results',async()=>{
  const f=fixture();
  // Simulate old checkpoint blocked before any Skill call.
  const first=await f.controller.start(f.context());
  const legacy=structuredClone(first);
  legacy.id='old-failed';legacy.phase='needs-review';legacy.processingVersion=10;legacy.plan=null;
  legacy.segmentDrafts={};legacy.wholeSceneResponses=[];legacy.editorialAssessment=undefined;
  legacy.planIssues=[{code:'SPEECH_CAPACITY_EXCEEDED',message:'按4字每秒拒绝'}];legacy.planQualityFailures=3;legacy.checks={audited:false,ranges:{}};
  f.records.set(legacy.id,legacy);
  const controller=createQuickGenerationController(f.deps);
  const run=await controller.resume(legacy.id);
  assert.equal(run.phase,'completed',JSON.stringify(run.errors));
  assert.equal(run.plan.segments.length,2);
});

test('account switch still blocks commit regardless of timing advisory',async()=>{
  const f=fixture({skill:p=>{f.changeAccount();return p.expectedLabels.map(l=>`${l}\n原文`).join('\n\n');}});
  const run=await f.controller.start(f.context());
  assert.equal(run.phase,'paused');
  assert.equal(f.state.directorProjects[0].episodes[1].prompts,undefined);
});
