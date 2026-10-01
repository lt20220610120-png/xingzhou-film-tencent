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
  let failSecond = false, pending;
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
      const label=request.input.match(/1-1-[12]/)?.[0];
      if(label==='1-1-2' && failSecond) throw new Error('模拟网络中断');
      if(pending) await pending;
      return {output:`${label}\n【画面内容】\n自然表演与对应原话。`};
    },
    commitRun:async(run)=>{commits.push(structuredClone(run));return {applied:true};},
  });
  return {controller,calls,commits,files,project,request:{accountId:'account-a',project,episode:project.episodes[0],sceneLabel:'1-1',inputText:source,maxDurationSeconds:30,skill,profile},fail:()=>{failSecond=true;},recover:()=>{failSecond=false;},account:()=>{accountId='account-b';},wait:p=>{pending=p;}};
};

test('auto scene runs plan, serial Skill, audit and commits exactly once with 30+10',async()=>{
  const f=fixture(); const run=await f.controller.start(f.request);
  assert.equal(run.phase,'completed');
  assert.deepEqual(f.calls.map(c=>c.kind),['plan','skill','skill','audit']);
  assert.deepEqual(run.plan.segments.map(s=>s.recommendedDurationSeconds),[30,10]);
  assert.equal(f.commits.length,1);
  assert.equal(run.promptIds.length,2);
  await f.controller.resume(run.id);
  assert.equal(f.commits.length,1);
});

test('failed second segment preserves first draft and resume avoids regenerating it',async()=>{
  const f=fixture();f.fail();const failed=await f.controller.start(f.request);
  assert.equal(failed.phase,'failed');assert.equal(f.commits.length,0);
  const firstCalls=f.calls.filter(c=>c.kind==='skill' && c.request.input.includes('1-1-1')).length;
  f.recover();const done=await f.controller.resume(failed.id);
  assert.equal(done.phase,'completed');
  assert.equal(f.calls.filter(c=>c.kind==='skill' && c.request.input.includes('规范编号：1-1-1')).length,firstCalls);
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
