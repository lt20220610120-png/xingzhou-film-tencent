import test from 'node:test';
import assert from 'node:assert/strict';
import {durationFromSemanticClip} from './videoDurationSemantics.js';

const turn=(count,pace='normal')=>({text:'你'.repeat(count),pace});
const voice=(count,pace)=>({turns:[turn(count,pace)]});
const action=visual_seconds=>({visual_seconds});
const estimate=(groups,limit=30,extra={})=>durationFromSemanticClip({groups,...extra},limit);

test('v3.0 upstream pace examples and the nine-turn acceptance scene reach the calibrated seconds',()=>{
 const vo='知夏你先别回家陈家的人已经到楼下了我把车钥匙放在门口鞋柜里你看到消息立刻报警千万不要一个人过来';
 assert.equal(vo.length,47);
 // Upstream fixtures V3_C01–C05 use counts where the dialogue need not be
 // reproduced. The same number of actual Han characters exercises the app.
 const cases=[
  [[action(1.8),action(1.2),{turns:[{text:vo,pace:'fast'}],visual_seconds:2},action(1.5)],{},13,'正常','正常'],
  [[{...voice(160,'slow'),visual_seconds:2},action(1.5)],{},39,'超载需重分','超载需重分'],
  [[action(1.5),...[4,4,6,8,4,2,7,2].map(count=>voice(count)),action(2.5)],{},21,'超载需重分','正常'],
  [[action(4),voice(35),voice(36),voice(20),action(1.5),voice(46,'fast'),action(1),voice(17,'fast')],{},35,'超载需重分','略偏紧'],
  [[action(1.2)],{kind:'transition'},2,'正常','正常'],
  [[action(2.5),...([10,7,8,6].map(count=>voice(count))),action(2),...([10,8,9].map(count=>voice(count))),action(3.1),voice(8),voice(8),action(1.5)],{},29,'超载需重分','正常'],
 ];
 for(const [groups,extra,seconds,short,long] of cases){
  const a=estimate(groups,15,extra),b=estimate(groups,30,extra);
  assert.deepEqual([a.naturalSeconds,b.naturalSeconds,b.version],[seconds,seconds,'3.0.0']);
  assert.deepEqual([a.capacityStatus,b.capacityStatus],[short,long]);
  assert.deepEqual(a.breakdown,b.breakdown);
  if(long==='略偏紧')assert.equal(b.recommendedSeconds,30);
 }
});

test('punctuation leaves one turn pad, tight turns use the compact floor, and simultaneous tracks pick one ledger',()=>{
 const long=estimate([{turns:[{text:'等等、你听，别怕。'.repeat(6),pace:'normal'}],pauses:['comma','end','handoff']}]);
 assert.deepEqual(long.breakdown,{speechSeconds:6,nonparallelActionSeconds:0,pauseBufferSeconds:1.3});
 const tight={...turn(1,'fast'),tight:true};
 assert.deepEqual(estimate([action(2),{turns:[tight,tight]}]).breakdown,{speechSeconds:.3,nonparallelActionSeconds:2,pauseBufferSeconds:3.3});
 assert.deepEqual(estimate([{turns:[turn(1),turn(1)],parallel_speech:[[turn(19)]],visual_seconds:4.01}]).breakdown,
  {speechSeconds:.34,nonparallelActionSeconds:.01,pauseBufferSeconds:4.26});
 assert.deepEqual(estimate([{turns:[turn(1)],speech:[turn(100)],pause_seconds:.32},action(2)]).breakdown,
  {speechSeconds:.17,nonparallelActionSeconds:2,pauseBufferSeconds:2.75});
 assert.deepEqual(estimate([{speech:[turn(34,'fast')]}]).breakdown,estimate([voice(34,'fast')]).breakdown);
});

test('v3.0 uses the four calibrated defaults and accepts only the declared per-pace ranges',()=>{
 for(const [pace,units,min,max] of [['slow',45,3.8,4.8],['normal',60,5.4,6.4],['fast',70,6.5,7.5],['very_fast',75,7.2,8]]){
  assert.equal(estimate([voice(units,pace)]).breakdown.speechSeconds,10);
  for(const rate of [min,max])assert.equal(estimate([{turns:[{...turn(1,pace),rate}]}]).status,'estimated');
  for(const rate of [min-.01,max+.01])assert.throws(()=>estimate([{turns:[{...turn(1,pace),rate}]}]),/档位/);
 }
});

test('digits and short acronyms have spoken defaults, and an explicit reading takes precedence',()=>{
 for(const [text,pronunciation,speechSeconds] of [
  ['我给你500万，OK？',undefined,1.34],['15分钟',undefined,.67],['第3次',undefined,.5],['2026年',undefined,.84],
  ['去VIP室',undefined,.84],['CEO和APP',undefined,1.17],['CEO和app',undefined,1.17],['５００万，ＯＫ',undefined,.84],
  ['150万',undefined,.84],['APP','a pu',.34],['500万','五零零万',.67],['去VIP室','去 v i p 室',.84],
 ]) assert.equal(estimate([{turns:[{text,pronunciation,pace:'normal'}]}]).breakdown.speechSeconds,speechSeconds,text);
 assert.equal(estimate([{turns:[{text:'你好',units:600,pace:'normal'}]}]).breakdown.speechSeconds,.34);
 assert.throws(()=>estimate([{turns:[{units:600,pace:'normal'}]}]),/原文/);
 assert.throws(()=>estimate([{turns:[{text:'abcdefghijk',pace:'normal'}]}]),/读法/);
});

test('reading calibration, v3.0 tail bounds and decimal capacity edges stay exact',()=>{
 assert.deepEqual(estimate([{reading:{text:'字'.repeat(90)}}]).breakdown,{speechSeconds:0,nonparallelActionSeconds:12.5,pauseBufferSeconds:.6});
 assert.equal(estimate([action(14.4)],15).capacityStatus,'正常');
 assert.equal(estimate([action(14.40001)],15).capacityStatus,'略偏紧');
 assert.equal(estimate([action(34.4)]).capacityStatus,'略偏紧');
 assert.equal(estimate([action(34.40001)]).capacityStatus,'超载需重分');
 assert.throws(()=>estimate([action(4)],30,{tail_buffer_seconds:.81}),/0\.8/);
 assert.throws(()=>estimate([action(4)],30,{tail_buffer_seconds:.49}),/0\.5/);
 assert.throws(()=>estimate([voice(10)],30,{kind:'transition'}),/过场/);
 assert.throws(()=>estimate([{turns:[{text:'！？',pace:'normal'}]}]),/可计算/);
 assert.throws(()=>estimate([{turns:[{text:'！？',pronunciation:'假对白'}]}]),/可计算/);
 assert.throws(()=>estimate([{turns:[{text:'OK',pronunciation:'\u0301'}]}]),/可计算/);
});
