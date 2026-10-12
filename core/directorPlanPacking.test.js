import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneSourceTape, validateScenePlan } from './directorSegmentation.js';
import { packScenePlan } from './directorPlanPacking.js';

const make = (lines, seconds) => {
  const tape = buildSceneSourceTape(lines.join('\n'));
  const candidate = { segments: tape.units.map((unit, i) => ({ end: { unitId: unit.id }, timing: { speechSeconds: seconds[i], actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: { actor: '坐着' }, endState: { actor: '坐着' }, boundary: { type: 'speaker-change' }, visualNotes: [] })) };
  return { tape, candidate };
};
test('packs short dialogue beats near cap, preserving all source and a real tail', () => {
  const fixture = make(Array.from({length: 4}, (_, i) => `${i % 2 ? '乙' : '甲'}：${'你好'.repeat(20)}`), [10, 10, 10, 10]);
  const result = packScenePlan(fixture.candidate, { tape: fixture.tape, maxDurationSeconds: 30 });
  const checked = validateScenePlan(result.candidate, { tape: fixture.tape, maxDurationSeconds: 30, groundedTiming: true });
  assert.equal(checked.ok, true, JSON.stringify(checked.issues));
  assert.deepEqual(checked.plan.segments.map(s => s.recommendedDurationSeconds), [30, 10]);
  assert.equal(checked.plan.segments.map(s => fixture.tape.sourceText.slice(s.sourceStart,s.sourceEnd)).join(''),fixture.tape.sourceText);
});
test('a ten second scene stays one ten second clip', () => {
  const {tape,candidate}=make(['甲：'+ '你好'.repeat(8), '乙：'+ '再见'.repeat(12)], [4,6]);
  const checked=validateScenePlan(packScenePlan(candidate,{tape,maxDurationSeconds:30}).candidate,{tape,maxDurationSeconds:30,groundedTiming:true});
  assert.equal(checked.ok,true);assert.deepEqual(checked.plan.segments.map(s=>s.recommendedDurationSeconds),[10]);
});
test('moves an entire short speech to the next clip instead of splitting it to fill thirty seconds',()=>{
  const {tape,candidate}=make(['甲：'+ '你好'.repeat(40), '乙：'+ '再见'.repeat(40), '甲：'+ '知道'.repeat(40)], [20,20,20]);
  const checked=validateScenePlan(packScenePlan(candidate,{tape,maxDurationSeconds:30}).candidate,{tape,maxDurationSeconds:30,groundedTiming:true});
  assert.equal(checked.ok,true,JSON.stringify(checked.issues));
  assert.deepEqual(checked.plan.segments.map(s=>s.recommendedDurationSeconds),[20,20,20]);
  assert.equal(checked.plan.segments[0].sourceEnd,tape.units[0].end);
  assert.ok(checked.plan.segments.slice(0,-1).every(s=>s.completeDialoguePriority));
});
test('never repairs missing source or invalid anchors by guessing',()=>{
  const {tape,candidate}=make(['甲：你好','乙：再见'],[.5,.5]);
  candidate.segments[0].end.prefix='不是原文';
  assert.equal(packScenePlan(candidate,{tape,maxDurationSeconds:30}).changed,false);
});
test('retains valid plans and does not make a long independent action fit by clipping',()=>{
  const tape=buildSceneSourceTape('△他跑完长廊。');
  const candidate={segments:[{end:{unitId:'u1'},timing:{speechSeconds:0,actionSeconds:40,overlapSeconds:0,transitionSeconds:0},startState:'走廊起点',endState:'走廊终点',boundary:'结束',visualNotes:[]}]};
  const packed=packScenePlan(candidate,{tape,maxDurationSeconds:30});
  assert.equal(packed.changed,false);
  assert.equal(validateScenePlan(packed.candidate,{tape,maxDurationSeconds:30,groundedTiming:true}).ok,false);
});

test('overlapping speech and action are counted once after packing',()=>{
  const {tape,candidate}=make(['甲：'+ '你好'.repeat(20), '乙：'+ '再见'.repeat(20)], [10,10]);
  for(const s of candidate.segments){s.timing.actionSeconds=5;s.timing.overlapSeconds=4;}
  const packed=packScenePlan(candidate,{tape,maxDurationSeconds:30});
  const checked=validateScenePlan(packed.candidate,{tape,maxDurationSeconds:30,groundedTiming:true});
  assert.equal(checked.ok,true);assert.deepEqual(checked.plan.segments.map(s=>s.recommendedDurationSeconds),[22]);
});

test('never leaves final punctuation as a separate video when action time is charged at speech end',()=>{
  const {tape,candidate}=make(['甲：'+ '你好'.repeat(58)+'！'], [29]);
  candidate.segments[0].timing.actionSeconds=4;
  const packed=packScenePlan(candidate,{tape,maxDurationSeconds:30});
  assert.equal(packed.changed,false, 'a short complete turn cannot be broken to fit invented extra staging');
  const checked=validateScenePlan(packed.candidate,{tape,maxDurationSeconds:30,groundedTiming:true});
  assert.equal(checked.ok,false);
  assert.equal(packed.candidate.segments.length,1);
});

test('minimizing clip count merges sixteen small beats before Skill submission but preserves equal-count balanced cuts',()=>{
 const f=make(Array.from({length:16},(_,i)=>`${i%2?'乙':'甲'}：${'你好'.repeat(12)}。`),Array(16).fill(6));
 const p=packScenePlan(f.candidate,{tape:f.tape,maxDurationSeconds:32,optimizeUnderfilled:'segment-count'});
 assert.equal(p.changed,true);assert.equal(p.candidate.segments.length,4);
 const balanced=make(['甲：'+ '你好'.repeat(50)+'。','乙：'+ '再见'.repeat(50)+'。'],[25,25]);
 assert.equal(packScenePlan(balanced.candidate,{tape:balanced.tape,maxDurationSeconds:30,optimizeUnderfilled:'segment-count'}).changed,false);
});

test('packed count matches the minimum capacity partition of complete turns across varied scenes',()=>{
 for(const seconds of [[28,2,28,2],[20,20,20],[7,11,19,6,5,16],[2,29,1,29,1],[16,16,16,16]]){
  const f=make(seconds.map((n,i)=>`${i%2?'乙':'甲'}：${'字'.repeat(n*4)}。`),seconds);
  const costs=Array(seconds.length+1).fill(Infinity);costs[seconds.length]=0;
  for(let i=seconds.length-1;i>=0;i--){let total=0;for(let j=i;j<seconds.length;j++){total+=seconds[j];if(total>30)break;costs[i]=Math.min(costs[i],1+costs[j+1]);}}
  const result=packScenePlan(f.candidate,{tape:f.tape,maxDurationSeconds:30,optimizeUnderfilled:'segment-count'});
  const checked=validateScenePlan(result.candidate,{tape:f.tape,maxDurationSeconds:30,groundedTiming:true});
  assert.equal(checked.ok,true,JSON.stringify(checked.issues));assert.equal(checked.plan.segments.length,costs[0],String(seconds));
 }
});
