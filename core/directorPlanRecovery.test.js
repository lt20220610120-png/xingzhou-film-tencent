import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSceneSourceTape,validateScenePlan} from './directorSegmentation.js';
import {recoverScenePlan,parseScenePlanningJson} from './directorPlanRecovery.js';
import {packScenePlan} from './directorPlanPacking.js';
import {getDirectorSegmentTimingFacts} from './directorTiming.js';

for(const seconds of [10,40,50,90])test(`source recovery covers ${seconds} seconds with natural tail`,()=>{
 const source=Array.from({length:seconds/10},(_,i)=>`${i%2?'乙':'甲'}：“${'天地人和'.repeat(10)}。”`).join('\n\n');
 const tape=buildSceneSourceTape(source),r=recoverScenePlan({tape,maxDurationSeconds:30});
 assert.equal(r.ok,true,JSON.stringify(r.issues));
 assert.deepEqual(r.plan.segments.map(s=>s.recommendedDurationSeconds),seconds===10?[10]:seconds===40?[30,10]:seconds===50?[30,20]:[30,30,30]);
 assert.equal(r.plan.segments.map(s=>tape.sourceText.slice(s.sourceStart,s.sourceEnd)).join(''),source);
});
test('balanced valid 25+25 is retained even below the former 85 percent threshold',()=>{
 const tape=buildSceneSourceTape(['甲：'+ '天地人和'.repeat(25)+'。','乙：'+ '天地人和'.repeat(25)+'。'].join('\n'));
 const candidate={segments:tape.units.map(u=>({end:{unitId:u.id},timing:{speechSeconds:25,actionSeconds:0,overlapSeconds:0,transitionSeconds:0},startState:'起',endState:'终',boundary:'换主体衔接',visualNotes:[]}))};
 assert.equal(validateScenePlan(candidate,{tape,maxDurationSeconds:30,groundedTiming:true}).ok,true);
 assert.equal(packScenePlan(candidate,{tape,maxDurationSeconds:30,optimizeUnderfilled:false}).candidate,candidate);
});
test('planning JSON accepts one complete fenced object with prose but never truncated or ambiguous plans',()=>{
 const obj={segments:[{end:{unitId:'u1',prefix:'甲："{字}"'}}]};
 assert.deepEqual(parseScenePlanningJson('说明\n```json\n'+JSON.stringify(obj)+'\n```\n结束'),obj);
 assert.throws(()=>parseScenePlanningJson(JSON.stringify(obj).slice(0,-1)));
 assert.throws(()=>parseScenePlanningJson(JSON.stringify(obj)+'\n'+JSON.stringify(obj)));
});
test('inline speech following a marked action is not charged again as an action',()=>{
 const source='甲：“你好。”△乙转身。乙：“'+ '天地人和'.repeat(20)+'。”';
 const facts=getDirectorSegmentTimingFacts({sourceText:source});
 assert.ok(facts.actionCues.every(c=>!c.sourceQuote.includes('天地人和')));
 const r=recoverScenePlan({tape:buildSceneSourceTape(source),maxDurationSeconds:30});assert.equal(r.ok,true,JSON.stringify(r.issues));
});
test('unbreakable long sentence and explicit prolonged action are not silently shortened',()=>{
 for(const source of ['甲：“'+ '天地人和'.repeat(40)+'。”','△等待60秒。']){
  const r=recoverScenePlan({tape:buildSceneSourceTape(source),maxDurationSeconds:30});assert.equal(r.ok,false);
 }
});

test('zero-weight final gesture cannot acquire negative residual action time after fractional allocation',()=>{
 const source=['△甲发现出口。','甲：'+ '你好'.repeat(20)+'。','△甲后退。','甲：我我赶时间找人！','△甲冲过人群。','△甲撞上乙。','甲：'+ '你好'.repeat(20)+'。','△乙一脚堵住去路。','乙：'+ '再见'.repeat(20)+'。','△乙神色动摇。','乙：'+ '再见'.repeat(20)+'。'].join('\n');
 const r=recoverScenePlan({tape:buildSceneSourceTape(source),maxDurationSeconds:35});
 assert.equal(r.ok,true,JSON.stringify(r.issues));assert.ok(r.plan.segments.every(s=>s.timing.actionSeconds>=0));
});
