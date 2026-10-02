import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickGenerationController } from './directorQuickGeneration.js';

const fixture = () => {
  let accountId = 'account-a';
  const source = '1-1 景：客厅 日 内\n甲说：“先把门关上。”\n乙关门，说：“好了。”';
  const project = { id:'p', style:'真人电影集', aspectRatio:'9:16', episodes:[{id:'e',content:source}] };
  const skill = {id:'s',name:'custom',content:'按编号输出提示词'};
  const profile = {id:'m',model:'mock',endpoint:'http://mock',protocol:'chat'};
  const files = new Map();
  const calls = [], commits = [];
  let failRepair = false, wholeCalls = 0, pending;
  const controller = createQuickGenerationController({
    getContext:()=>({accountId,project,episode:project.episodes[0],inputText:source,skill,profile,permissions:{canGenerate:true}}),
    checkpoints:{save:async({run})=>files.set(run.id,structuredClone(run)),list:async()=>[...files.values()],load:async({runId})=>structuredClone(files.get(runId))},
    executeText:async({messages})=>{
      calls.push({kind:messages[0].content.includes('核对')?'audit':'plan'});
      if (messages[0].content.includes('核对')) return JSON.stringify({ok:true,issues:[]});
      return JSON.stringify({segments:[
        {end:{unitId:'u1'},timing:{speechSeconds:28,actionSeconds:2,overlapSeconds:0,transitionSeconds:0},startState:'甲在门旁',endState:'甲说完',boundary:'切乙',visualNotes:[]},
        {end:{unitId:'u2'},timing:{speechSeconds:8,actionSeconds:2,overlapSeconds:0,transitionSeconds:0},startState:'乙站门旁',endState:'门已关',boundary:'结束',visualNotes:[]}
      ]});
    },
    executeSkill:async(request)=>{
      calls.push({kind:'skill',request});
      const labels=request.expectedLabels || [...new Set(request.input.match(/1-1-[12]/g))];
      wholeCalls+=1;
      if(failRepair && wholeCalls>1) throw new Error('模拟整场修复网络中断');
      if(pending) await pending;
      return {output:(failRepair?labels.slice(0,1):labels).map(label=>`${label}\n【画面内容】\n自然表演与对应原话。`).join('\n\n')};
    },
    commitRun:async(run)=>{commits.push(structuredClone(run));return {applied:true};},
  });
  return {controller,calls,commits,files,project,request:{accountId:'account-a',project,episode:project.episodes[0],sceneLabel:'1-1',inputText:source,maxDurationSeconds:30,skill,profile},fail:()=>{failRepair=true;},recover:()=>{failRepair=false;},account:()=>{accountId='account-b';},wait:p=>{pending=p;}};
};

test('auto scene submits all numbered brackets in one Skill request, audits and commits 30+10 exactly once',async()=>{
  const f=fixture(); const run=await f.controller.start(f.request);
  assert.equal(run.phase,'completed');
  assert.deepEqual(f.calls.map(c=>c.kind),['plan','skill','audit']);
  const request=f.calls.find(c=>c.kind==='skill').request;
  assert.deepEqual(request.expectedLabels,['1-1-1','1-1-2']);
  assert.match(request.input,/（1）/);
  assert.match(request.input,/（2）/);
  assert.ok(request.input.includes('先把门关上。'));
  assert.ok(request.input.includes('好了。'));
  assert.deepEqual(run.plan.segments.map(s=>s.recommendedDurationSeconds),[30,10]);
  assert.equal(f.commits.length,1);
  assert.equal(run.promptIds.length,2);
  await f.controller.resume(run.id);
  assert.equal(f.commits.length,1);
});

test('partial whole-scene output preserves accepted draft across failed whole-scene repair and resume',async()=>{
  const f=fixture();f.fail();const failed=await f.controller.start(f.request);
  assert.equal(failed.phase,'failed');assert.equal(f.commits.length,0);
  const first=failed.plan.segments[0];
  assert.equal(failed.segmentDrafts[first.id].validated,true);
  const accepted=structuredClone(failed.segmentDrafts[first.id]);
  const ids=[...failed.promptIds];
  assert.equal(f.calls.filter(c=>c.kind==='skill').length,2);
  f.recover();const done=await f.controller.resume(failed.id);
  assert.equal(done.phase,'completed');
  assert.deepEqual(done.segmentDrafts[first.id].prompt,accepted.prompt);
  assert.deepEqual(done.promptIds,ids);
  const repaired=f.calls.filter(c=>c.kind==='skill').at(-1).request;
  assert.deepEqual(repaired.expectedLabels,['1-1-1','1-1-2']);
  assert.deepEqual(repaired.preservedPrompts,[{label:'1-1-1',content:accepted.prompt.content}]);
  assert.equal(f.calls.filter(c=>c.kind==='skill').length,3);
  assert.equal(f.commits.length,1);
});

test('stopped or account-switched request cannot commit late output',async()=>{
  const f=fixture();let release;f.wait(new Promise(resolve=>{release=resolve;}));
  const task=f.controller.start(f.request);
  for(let i=0;i<50 && !f.calls.some(c=>c.kind==='skill');i++)await new Promise(r=>setTimeout(r,5));
  const run=f.controller.entries()[0];
  await f.controller.stop(run.id);f.account();release();await task;
  assert.equal(f.commits.length,0);
  assert.notEqual(f.controller.get(run.id).phase,'completed');
});
