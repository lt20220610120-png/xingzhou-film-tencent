import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSceneSourceTape, validateScenePlan } from './directorSegmentation.js';
import { recalibrateScenePlanTimings, buildSceneTimingFacts } from './directorTiming.js';
import { packScenePlan } from './directorPlanPacking.js';
const fixtures = JSON.parse(readFileSync(new URL('./directorActionTiming.fixtures.json', import.meta.url), 'utf8'));

const calibrate = (source, splitBefore) => {
  const tape = buildSceneSourceTape(source);
  const cuts = splitBefore ? [tape.sourceText.lastIndexOf(splitBefore), tape.sourceText.length] : [tape.sourceText.length];
  const candidate = { segments: cuts.map(end => {
    const unit = tape.units.find(unit => unit.start < end && unit.end >= end);
    return { end: { unitId: unit.id, ...(unit.end === end ? {} : { prefix: unit.text.slice(0, end - unit.start) }) }, timing: { speechSeconds: 30, actionSeconds: 10, overlapSeconds: 0, transitionSeconds: 2 }, startState: '原文起态', endState: '原文终态', boundary: '原文衔接', visualNotes: [] };
  }) };
  const calibrated = recalibrateScenePlanTimings(candidate, { tape, maxDurationSeconds: 30 });
  const packed = packScenePlan(calibrated.candidate, { tape, maxDurationSeconds: 30 });
  const result = validateScenePlan(packed.candidate, { tape, maxDurationSeconds: 30, groundedTiming: true });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.plan.segments.map(segment => tape.sourceText.slice(segment.sourceStart, segment.sourceEnd)).join(''), tape.sourceText);
  return result.plan;
};

test('short room dialogue stays one compact clip despite two inflated model segments', () => {
  const plan = calibrate(fixtures['3-2'], '△魏姝立刻');
  assert.equal(plan.segments.length, 1);
  assert.ok(plan.segments[0].recommendedDurationSeconds >= 13 && plan.segments[0].recommendedDurationSeconds <= 20);
});
test('morning OS and system VO remain audible and fit one thirty-second clip', () => {
  const plan = calibrate(fixtures['3-3'], '△魏今朝翻身');
  assert.equal(plan.segments.length, 1);
  assert.equal(buildSceneTimingFacts(buildSceneSourceTape(fixtures['3-3'])).scene.speechCharacterCount, 106);
  assert.ok(plan.segments[0].recommendedDurationSeconds >= Math.ceil(106 / 4));
  assert.ok(plan.segments[0].recommendedDurationSeconds <= 30);
});
test('static location plus quick eating and entering is one three-second clip', () => {
  assert.deepEqual(calibrate(fixtures['4-1']).segments.map(segment => segment.recommendedDurationSeconds), [3]);
});
test('explicit waiting and unknown long actions are never shortened to quick gestures', () => {
  const candidate = { segments: [{ end: { unitId: 'u1' }, timing: { speechSeconds: 0, actionSeconds: 40, overlapSeconds: 0, transitionSeconds: 0 } }] };
  for (const source of ['△他站在门边等待40秒。', '△他跑完长廊。']) {
    const tape = buildSceneSourceTape(source);
    assert.equal(recalibrateScenePlanTimings(candidate, { tape }).candidate.segments[0].timing.actionSeconds, 40);
  }
});
test('voiceover overlap cannot leap over intervening independent actions', () => {
  const facts = buildSceneTimingFacts(buildSceneSourceTape('△他挥拳打倒乙。△他蹲下搜刮现金。\n甲 OS：' + '你好'.repeat(20))).scene;
  assert.equal(facts.actionCues[0].overlapSeconds, 0);
  assert.equal(facts.actionCues[1].overlapSeconds, 2.5);
});

test('a model cut cannot separate concurrent action from the following OS into a tiny tail', () => {
  const source = '△他转身走进门。\n甲 OS：' + '好'.repeat(116);
  assert.deepEqual(calibrate(source, '甲 OS').segments.map(segment => segment.recommendedDurationSeconds), [29]);
});
test('unknown slow actions also block earlier action overlap and environment actors are unrestricted', () => {
  const facts = buildSceneTimingFacts(buildSceneSourceTape('△他挥拳打倒乙。△他慢慢走进门。\n甲 OS：你好你好你好你好。')).scene;
  assert.equal(facts.actionCues[0].overlapSeconds, 0);
  assert.ok(buildSceneTimingFacts(buildSceneSourceTape('△窗外，安德烈走进门，跪倒在地。')).scene.actionTimeline.actionSeconds > 0);
});
test('compound explicit waiting retains other action estimates and its duration lower bound', () => {
  const tape = buildSceneSourceTape('△他挥拳打倒乙，然后等待10秒，再蹲下搜刮现金。');
  const candidate = { segments: [{ end: { unitId: 'u1' }, timing: { speechSeconds: 0, actionSeconds: 16, overlapSeconds: 0, transitionSeconds: 0 } }] };
  assert.equal(recalibrateScenePlanTimings(candidate, { tape }).candidate.segments[0].timing.actionSeconds, 16);
});
test('a scene consisting only of location description still has one brief establishing image', () => {
  assert.deepEqual(calibrate('△窗外晨光洒入空屋，桌上放着旧书。').segments.map(segment => segment.recommendedDurationSeconds), [2]);
});
test('one-second maximum can show an otherwise static establishing scene', () => {
  const tape = buildSceneSourceTape('△窗外晨光洒入空屋，桌上放着旧书。');
  const candidate = { segments: [{ end: { unitId: 'u1' }, timing: { speechSeconds: 0, actionSeconds: 10, overlapSeconds: 0, transitionSeconds: 2 }, startState: '空屋晨光', endState: '空屋晨光', boundary: '全景收束', visualNotes: [] }] };
  const calibrated = recalibrateScenePlanTimings(candidate, { tape, maxDurationSeconds: 1 });
  const checked = validateScenePlan(calibrated.candidate, { tape, maxDurationSeconds: 1, groundedTiming: true });
  assert.equal(checked.ok, true, JSON.stringify(checked.issues));
  assert.deepEqual(checked.plan.segments.map(segment => segment.recommendedDurationSeconds), [1]);
});
test('pure spoken source cannot acquire twenty seconds of invented action staging', () => {
  assert.deepEqual(calibrate('人：甲\n甲（低声）：' + '你好'.repeat(40) + '。').segments.map(segment => segment.recommendedDurationSeconds), [20]);
});
test('genuine unmarked staging retains the planner action estimate', () => {
  const tape = buildSceneSourceTape('甲绕过桌子，检查门边后回到窗前。\n甲：好。');
  const candidate = { segments: [{ end: { unitId: tape.units.at(-1).id }, timing: { speechSeconds: 10, actionSeconds: 12, overlapSeconds: 0, transitionSeconds: 0 } }] };
  assert.equal(recalibrateScenePlanTimings(candidate, { tape, maxDurationSeconds: 30 }).candidate.segments[0].timing.actionSeconds, 12);
});
