import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneSourceTape, validateScenePlan } from './directorSegmentation.js';
import { buildSceneTimingFacts, getDirectorSegmentTimingFacts, recalibrateScenePlanTimings, extractDirectorVisualBeats } from './directorTiming.js';

const segment = (unitId, seconds, extra = {}) => ({ end: { unitId }, timing: { speechSeconds: seconds, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: '原文起态', endState: '原文终态', boundary: { type: 'speaker-change', evidence: '原文换话' }, visualNotes: [], ...extra });
const speech = count => '好'.repeat(count);

test('unmarked actor actions retain the same visual timing as marked actions without becoming speech', () => {
  const plain = '人：甲、乙\n乙：好。\n甲抬手推开门，转身走进屋。';
  const marked = plain.replace('甲抬手', '△甲抬手');
  const a = getDirectorSegmentTimingFacts({ sourceText: plain }), b = getDirectorSegmentTimingFacts({ sourceText: marked });
  assert.equal(a.speechCharacterCount, 1);
  assert.equal(a.actionCues.length, b.actionCues.length);
  for (const field of ['actionSeconds', 'overlapSeconds', 'unknownBeatCount']) assert.equal(a.actionTimeline[field], b.actionTimeline[field]);
  assert.equal(extractDirectorVisualBeats('甲：“\n甲抬手推开门。\n”').length, 0);
});

test('forty seconds of real spoken source remains thirty plus ten and short whole scene remains ten', () => {
  const tape = buildSceneSourceTape(`1-1 景：办公室 日 内\n甲：${speech(120)}。\n乙：${speech(40)}。`);
  const result = validateScenePlan({ segments: [segment(tape.units[0].id, 30), segment(tape.units[1].id, 10)] }, { tape, maxDurationSeconds: 30, groundedTiming: true });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.deepEqual(result.plan.segments.map(item => item.recommendedDurationSeconds), [30, 10]);
  const short = buildSceneSourceTape(`乙：${speech(40)}。`);
  const single = validateScenePlan({ segments: [segment(short.units[0].id, 10)] }, { tape: short, maxDurationSeconds: 30, groundedTiming: true });
  assert.equal(single.ok, true, JSON.stringify(single.issues));
  assert.equal(single.plan.segments.length, 1);
  assert.equal(single.plan.segments[0].recommendedDurationSeconds, 10);
});

test('speaker metadata and action description words never become dialogue duration', () => {
  const source = `人：甲、乙、系统\n△甲在窗边${'衣料质感与晨光'.repeat(20)}，擦去额头的汗。\n甲（低声）：${speech(40)}。\n系统 VO：${speech(20)}。\n甲 OS：${speech(20)}。`;
  const facts = buildSceneTimingFacts(buildSceneSourceTape(source));
  assert.equal(facts.scene.speechCharacterCount, 80);
  assert.equal(facts.scene.speechSecondsAt4, 20);
  assert.ok(facts.scene.actionCues.length > 0);
  assert.ok(facts.scene.dialogues.every(dialogue => dialogue.speaker !== '人'));
  assert.equal(facts.rules.actionTextCharacterCountIsNotDuration, true);
});

test('a prefix cut inside a long monologue counts the suffix without duplicating actor labels or speech', () => {
  const tape = buildSceneSourceTape(`甲 OS（严肃）：${speech(120)}。${speech(40)}。`);
  const prefix = `甲 OS（严肃）：${speech(120)}。`;
  const first = getDirectorSegmentTimingFacts({ sourceText: tape.sourceText, sourceStart: 0, sourceEnd: prefix.length });
  const second = getDirectorSegmentTimingFacts({ sourceText: tape.sourceText, sourceStart: prefix.length, sourceEnd: tape.sourceText.length });
  assert.equal(first.speechCharacterCount, 120);
  assert.equal(second.speechCharacterCount, 40);
  assert.equal(second.dialogues[0].speaker, '甲');
  const result = validateScenePlan({ segments: [segment(tape.units[0].id, 30, { end: { unitId: tape.units[0].id, prefix } }), segment(tape.units[0].id, 10)] }, { tape, maxDurationSeconds: 30, groundedTiming: true });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
});

test('grounded planning catches an impossible speech capacity without hard-coding any shot minimum', () => {
  const tape = buildSceneSourceTape(`甲：${speech(160)}。`);
  const result = validateScenePlan({ segments: [segment(tape.units[0].id, 30)] }, { tape, maxDurationSeconds: 30, groundedTiming: true });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(item => item.code === 'SPEECH_CAPACITY_EXCEEDED'));
  assert.ok(result.issues.some(item => item.code === 'SPEECH_TIMING_UNDERESTIMATED'));
  const valid = buildSceneSourceTape(`甲：${speech(120)}。`);
  assert.equal(validateScenePlan({ segments: [segment(valid.units[0].id, 30)] }, { tape: valid, maxDurationSeconds: 30, groundedTiming: true }).ok, true);
});

test('calibration repairs made-up speech seconds while preserving source anchors and real action timing', () => {
  const tape = buildSceneSourceTape('甲：好。\n△乙拿起杯子，喝完，把杯子放回桌面。');
  const candidate = { segments: [segment(tape.units.at(-1).id, 30, { timing: { speechSeconds: 30, actionSeconds: 6, overlapSeconds: 4, transitionSeconds: 0 } })] };
  const calibrated = recalibrateScenePlanTimings(candidate, { tape });
  assert.equal(calibrated.changed, true);
  assert.equal(calibrated.candidate.segments[0].timing.speechSeconds, 0.25);
  assert.equal(calibrated.candidate.segments[0].timing.actionSeconds, 6);
  assert.equal(calibrated.candidate.segments[0].timing.overlapSeconds, 0.25);
  assert.deepEqual(calibrated.candidate.segments[0].end, candidate.segments[0].end);
  assert.equal(candidate.segments[0].timing.speechSeconds, 30, 'input remains untouched');
  assert.ok(calibrated.candidate.segments[0].timingFacts.actionCues.length > 0);
});

test('overlapping dialogue and visual action count once, not additive double time', () => {
  const tape = buildSceneSourceTape(`甲：${speech(80)}。\n△甲说话时抬手擦汗。`);
  const result = validateScenePlan({ segments: [segment(tape.units.at(-1).id, 20, { timing: { speechSeconds: 20, actionSeconds: 3, overlapSeconds: 3, transitionSeconds: 0 } })] }, { tape, maxDurationSeconds: 30, groundedTiming: true });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.plan.segments[0].recommendedDurationSeconds, 20);
});

test('visual beat cues are original evidence with offsets, never narration word-count timing', () => {
  const source = '△甲擦汗。△乙推门，走进来。\n甲：好。';
  const beats = extractDirectorVisualBeats(source);
  assert.equal(beats.length, 2);
  for (const beat of beats) {
    assert.equal(source.slice(beat.sourceStart, beat.sourceEnd), beat.sourceQuote);
    assert.ok(beat.typicalSeconds[0] <= beat.typicalSeconds[1]);
  }
  assert.deepEqual(beats[0].typicalSeconds, [0.8, 1.5], 'a quick wipe is shorter than a separate three-second hold');
});
