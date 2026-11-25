import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickGenerationController } from './directorQuickGeneration.js';
import { commitQuickSceneRun } from './directorQuickStore.js';
import {commitDirectorResegment} from './directorDurationWorkflow.js';
import { manorScene, englishManorScene } from './directorSceneBudget.fixtures.js';

function fixture({ source=manorScene, planner, skill, audit, estimateScene,maxDurationSeconds=32 }={}) {
  let state={accountId:'a',skills:[{id:'s',name:'custom',content:'按括号输出一一对应的编号视频提示词。'}],
    apiProfiles:[{id:'m',model:'mock',apiKey:'never-checkpoint'}],
    directorProjects:[{id:'p',style:'真人电影级',aspectRatio:'9:16',episodes:[{id:'e1',title:'第1集',content:'场景 1-1 门外 日 外景'}, {id:'e',title:'第2集',content:source}]}]};
  const records=new Map(),calls=[],progress=[];
  const context=()=>({accountId:state.accountId,project:state.directorProjects[0],episode:state.directorProjects[0].episodes[1],skill:state.skills[0],profile:state.apiProfiles[0],
    inputText:source,sceneLabel:'2-1',maxDurationSeconds,permissions:{canGenerate:true}});
  const commit=(run,partial)=>{const result=commitQuickSceneRun(state,run,{partial});state=result.state;return result;};
  const deps={editorialPlanning:true,groundedTiming:true,maxQualityAttempts:3,getContext:context,estimateScene,
    checkpoints:{save:async({run})=>records.set(run.id,structuredClone(run)),load:async({runId})=>structuredClone(records.get(runId)),list:async()=>[...records.values()]},
    executeText:async payload=>{
      const type=payload.messages[0].content.includes('核对')?'audit':'plan';calls.push({type,payload});
      return type==='plan'?(planner?.(payload)??JSON.stringify({estimatedSceneSeconds:45,timingRationale:'整场英文对白、反应及进出场同步表演。'})):(audit?.(payload)??'{"ok":true,"issues":[]}');
    },
    executeSkill:async payload=>{calls.push({type:'skill',payload});return skill?.(payload,calls)??payload.expectedLabels.map(label=>`${label}\n【画面内容】\n按本段完整原话和镜头表演。`).join('\n\n');},
    commitProgress:async run=>{progress.push(structuredClone(run));return commit(run,true);},commitRun:async run=>commit(run,false)};
  return {controller:createQuickGenerationController({...deps,legacyPromptReview:true}),deps,context,records,calls,progress,get state(){return state;},changeAccount(){state.accountId='b';}};
}

const bulkTiming=(segments,maxDurationSeconds,overload)=>new Map(segments.map(({id},index)=>[id,{
 version:'2.0.0',status:'estimated',maxDurationSeconds,naturalSeconds:overload&&index===0?36:11,recommendedSeconds:overload&&index===0?36:11,
 needsResegment:overload&&index===0,capacityStatus:overload&&index===0?'超载需重分':'正常',
 breakdown:{speechSeconds:overload&&index===0?33:8,nonparallelActionSeconds:0,pauseBufferSeconds:3},reason:overload&&index===0?'模拟；需重新划分片段并重新生成提示词。':'模拟',
}]));

test('overload saves the first body, and only an explicit resegment generates a new draft',async()=>{
 const batchSizes=[];let f;
 f=fixture({maxDurationSeconds:30,estimateScene:async request=>{
  const {segments,maxDurationSeconds}=request;batchSizes.push(segments.length);
  assert.match(segments[0].script,/泼|妈/);
  assert.match(segments[0].prompt,/编辑成品/);
  assert.equal(f.state.directorProjects[0].episodes[1].prompts.length,2);
  return bulkTiming(segments,maxDurationSeconds,batchSizes.length===1);
 },skill:p=>p.expectedLabels.map(l=>`${l}\n编辑成品`).join('\n\n')});
 const controller=createQuickGenerationController(f.deps),first=await controller.start(f.context());
 assert.equal(first.phase,'completed');
 assert.deepEqual(batchSizes,[2]);
 assert.equal(f.calls.filter(c=>c.type==='skill').length,1);
 assert.ok(f.state.directorProjects[0].episodes[1].prompts[0].durationEstimate.needsResegment);
 const run=await controller.resegment(first.id);
 assert.equal(run.phase,'completed',JSON.stringify(run.errors));
 assert.deepEqual(batchSizes,[2,3]);
 assert.equal(f.calls.filter(c=>c.type==='skill').length,2);
 const project=f.state.directorProjects[0];
 assert.equal(project.episodes[1].prompts.length,3);
 assert.equal(project.promptHistory.length,5);
 assert.equal(project.promptHistory.filter(p=>p.durationEstimate?.needsResegment).length,1);
 assert.ok(project.episodes[1].prompts.every(p=>p.durationEstimate?.recommendedSeconds===11));
});

test('a second overload and a failed explicit resegment never launch another rewrite',async()=>{
 for(const fail of [false,true]){
  let estimates=0,skills=0;
  const f=fixture({maxDurationSeconds:30,estimateScene:async({segments,maxDurationSeconds})=>{estimates++;return bulkTiming(segments,maxDurationSeconds,true);},skill:p=>{
   if(++skills===2&&fail)throw Error('模拟重分接口失败');
   return p.expectedLabels.map(l=>`${l}\n编辑成品`).join('\n\n');
  }});
  const controller=createQuickGenerationController(f.deps),first=await controller.start(f.context());
  assert.equal(skills,1);
  const run=await controller.resegment(first.id);
  assert.equal(run.phase,'completed',JSON.stringify(run.errors));
  assert.equal(skills,2);
  assert.equal(estimates,fail?1:2);
  assert.ok(f.state.directorProjects[0].episodes[1].prompts.some(p=>p.durationEstimate?.needsResegment));
  await assert.rejects(controller.resegment(first.id),/重分/);
  assert.equal(skills,2);
 }
});

test('successful estimates are written before the other rows settle and original text stays intact',async()=>{
 let f;
 f=fixture({maxDurationSeconds:30,estimateScene:async({segments,maxDurationSeconds,onEstimates})=>{
  const valid=bulkTiming(segments,maxDurationSeconds,false);
  const id=segments[0].id;
  await onEstimates(new Map([[id,valid.get(id)]]));
  const live=f.state.directorProjects[0].episodes[1].prompts;
  assert.equal(live[0].durationEstimate.recommendedSeconds,11);
  assert.equal(live[1].durationEstimate.status,'pending');
  return valid;
 }});
 const run=await f.controller.start(f.context());
 assert.equal(run.phase,'completed',JSON.stringify(run.errors));
 assert.ok(f.state.directorProjects[0].episodes[1].prompts.every(p=>p.durationEstimate.recommendedSeconds===11));
});

test('pending, tight, edited and obsolete drafts cannot launch a resegment',async()=>{
 for(const state of ['pending','tight','edited','account']){
  const f=fixture({maxDurationSeconds:30,estimateScene:async({segments,maxDurationSeconds})=>{
   const values=bulkTiming(segments,maxDurationSeconds,true),first=segments[0].id;
   if(state==='pending')values.set(first,{version:'2.0.0',status:'pending',maxDurationSeconds,error:{code:'TIMEOUT',message:'估时超时。'}});
   if(state==='tight')values.set(first,{...values.get(first),naturalSeconds:35,recommendedSeconds:30,needsResegment:false,capacityStatus:'略偏紧',breakdown:{speechSeconds:33,nonparallelActionSeconds:0,pauseBufferSeconds:2}});
   return values;
  }});
  const run=await f.controller.start(f.context());
  assert.equal(run.phase,'completed');
  if(state==='edited')f.state.directorProjects[0].episodes[1].prompts[0].content='手工改过的内容';
  if(state==='account')f.changeAccount();
  await assert.rejects(f.controller.resegment(run.id),/超载|手动修改|账号已切换/);
  assert.equal(f.calls.filter(c=>c.type==='skill').length,1);
 }
});

test('resplit first draft stays visible until the new draft is durable, including write failures and rebases',async()=>{
 const original={prompt:'首次稿',other:'旧修改'};
 let visible=original,writes=[];
 const shared={read:()=>visible,apply:state=>({applied:true,state:{...state,prompt:'重分稿'}}),publish:state=>{visible=state;},isCurrent:()=>true};
 await assert.rejects(commitDirectorResegment({...shared,save:async state=>{
  writes.push(state.prompt);assert.equal(visible,original);
  if(writes.length===1)throw Error('隔离写入故障');
 }}),/隔离写入故障/);
 assert.equal(visible,original);assert.deepEqual(writes,['重分稿','首次稿']);
 writes=[];
 await commitDirectorResegment({...shared,save:async state=>{
  writes.push(state);assert.equal(visible.prompt,'首次稿');
  if(writes.length===1)visible={...visible,other:'保存时的手动编辑'};
 }});
 assert.equal(writes.length,2);assert.deepEqual(visible,{prompt:'重分稿',other:'保存时的手动编辑'});
});

test('an edition change before an isolated retry does not dispatch another estimate',async()=>{
 let f,retries=0;
 f=fixture({maxDurationSeconds:30,estimateScene:async({onProgress})=>{
  f.changeAccount();
  await onProgress({stage:'retrying',retryId:'2-1-1'});
  retries++;
  return new Map();
 }});
 const run=await f.controller.start(f.context());
 assert.equal(retries,0);assert.equal(run.phase,'paused');
});

test('an edit to a fresh saved prompt stops an estimate retry against its old text',async()=>{
 let f,retries=0;
 f=fixture({maxDurationSeconds:30,estimateScene:async({segments,onProgress})=>{
  f.state.directorProjects[0].episodes[1].prompts[0].content='已编辑的提示词';
  await onProgress({stage:'retrying',retryId:segments[0].id});
  retries++;return new Map();
 }});
 const run=await f.controller.start(f.context());
 assert.equal(retries,0);assert.equal(run.phase,'stale');
 assert.equal(f.state.directorProjects[0].episodes[1].prompts[0].content,'已编辑的提示词');
});

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
  const controller=createQuickGenerationController({...f.deps,legacyPromptReview:true});
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
