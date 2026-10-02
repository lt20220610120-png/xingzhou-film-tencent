import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSceneSourceTape, validateScenePlan } from './directorSegmentation.js';
import { recalibrateScenePlanTimings, getDirectorSegmentTimingFacts } from './directorTiming.js';
import { packScenePlan } from './directorPlanPacking.js';
import { directorSpeechBoundary } from './directorSpeechBoundaries.js';
import { createSceneSnapshot, commitQuickSceneRun } from './directorQuickStore.js';

const fixtures = JSON.parse(readFileSync(new URL('./directorSegmentation.v2414.fixtures.json', import.meta.url), 'utf8'));
const segment = (tape, end, timing) => {
  const unit = tape.units.find(unit => unit.start < end && unit.end >= end);
  return { end: { unitId: unit.id, ...(unit.end === end ? {} : { prefix: unit.text.slice(0, end - unit.start) }) }, timing,
    startState: '按原文起态', endState: '按原文终态', boundary: '原文完整表演落点', visualNotes: [] };
};
const seconds = speechSeconds => ({ speechSeconds, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 });

test('the reported 15-second scene moves the entire final short line into the last clip', () => {
  const tape = buildSceneSourceTape(fixtures['2-1']);
  const cuts = [188, 362, 482, 494];
  const candidate = { segments: cuts.map((end, index) => segment(tape, end,
    { ...seconds([9.25, 10, 13.5, 2.5][index]), actionSeconds: [5.166666, 3.633334, 1.2, 0][index] })) };
  assert.ok(validateScenePlan(candidate, { tape, maxDurationSeconds: 15, groundedTiming: true }).issues.some(issue => issue.code === 'INCOMPLETE_DIALOGUE_BOUNDARY'));
  const calibrated = recalibrateScenePlanTimings(candidate, { tape, maxDurationSeconds: 15 });
  const packed = packScenePlan(calibrated.candidate, { tape, maxDurationSeconds: 15 });
  const checked = validateScenePlan(packed.candidate, { tape, maxDurationSeconds: 15, groundedTiming: true });
  assert.equal(checked.ok, true, JSON.stringify(checked.issues));
  const chunks = checked.plan.segments.map(item => tape.sourceText.slice(item.sourceStart, item.sourceEnd));
  assert.equal(chunks.join(''), tape.sourceText);
  const fullLine = '现在这个危险的情况，先活过这七天再说。';
  assert.equal(chunks.filter(chunk => chunk.includes(fullLine)).length, 1);
  assert.ok(!chunks.slice(0, -1).some(chunk => chunk.includes('现在这个危险的')));
  assert.equal(checked.plan.segments.at(-1).recommendedDurationSeconds, 5);
  assert.equal(checked.plan.segments.at(-2).completeDialoguePriority, true);
});

test('short turns stay atomic even at sentence punctuation; a genuinely long turn can split only at full sentences', () => {
  for (const maxDurationSeconds of [15, 30]) {
    const sourceText = '甲：先把门关上。再坐下，等他回来。';
    for (const prefix of ['甲：先把', '甲：先把门关上。', '甲：先把门关上。再坐下，'])
      assert.equal(directorSpeechBoundary({ sourceText, sourceEnd: prefix.length, maxDurationSeconds }).ok, false, prefix);
  }
  const sourceText = '甲：' + '好'.repeat(52) + '。' + '好'.repeat(40) + '？';
  assert.equal(directorSpeechBoundary({ sourceText, sourceEnd: 55, maxDurationSeconds: 15 }).ok, true);
  assert.equal(directorSpeechBoundary({ sourceText: sourceText.replace('。', '，'), sourceEnd: 55, maxDurationSeconds: 15 }).ok, false);
});

test('speaker name, OS/VO, direction and colon are inseparable from their first spoken word', () => {
  const sourceText = '△甲看他。\n魏今朝 OS（低声）：现在这个危险的情况，先活过这七天再说。';
  const start = sourceText.indexOf('魏今朝'), speechStart = sourceText.indexOf('现在');
  assert.equal(directorSpeechBoundary({ sourceText, sourceEnd: start, maxDurationSeconds: 15 }).ok, true);
  for (let sourceEnd = start + 1; sourceEnd <= speechStart; sourceEnd++)
    assert.equal(directorSpeechBoundary({ sourceText, sourceEnd, maxDurationSeconds: 15 }).ok, false, String(sourceEnd));
});

test('the warehouse scene is one 30-second video target while preserving its 32.5-second natural rehearsal', () => {
  const tape = buildSceneSourceTape(fixtures['4-5']);
  const facts = getDirectorSegmentTimingFacts({ sourceText: tape.sourceText });
  assert.equal(facts.speechCharacterCount, 130);
  assert.equal(facts.quickPerformanceSeconds, 32.5);
  assert.equal(facts.actionTimeline.unknownBeatCount, 0);
  const candidate = { segments: [segment(tape, 257, { ...seconds(20.75), actionSeconds: 8.5 }), segment(tape, tape.sourceText.length, { ...seconds(9.75), actionSeconds: 3.3 })] };
  const calibrated = recalibrateScenePlanTimings(candidate, { tape, maxDurationSeconds: 30 });
  const checked = validateScenePlan(calibrated.candidate, { tape, maxDurationSeconds: 30, groundedTiming: true });
  assert.equal(checked.ok, true, JSON.stringify(checked.issues));
  assert.equal(checked.plan.segments.length, 1);
  const result = checked.plan.segments[0];
  assert.equal(result.estimatedSeconds, 30); assert.equal(result.recommendedDurationSeconds, 30);
  assert.equal(result.naturalEstimatedSeconds, 32.5); assert.equal(result.timing.speechSeconds, 32.5);
  assert.equal(result.durationCompression.paceFactor, 1.0833);
  assert.equal(tape.sourceText.slice(result.sourceStart, result.sourceEnd), tape.sourceText);
});

test('whole-scene compression never applies to fifteen-second targets or natural durations over thirty-five', () => {
  for (const [count, cap] of [[132, 15], [144, 30]]) {
    const tape = buildSceneSourceTape('甲：' + '好'.repeat(count) + '。');
    const candidate = { segments: [segment(tape, tape.sourceText.length, seconds(count / 4))] };
    const calibrated = recalibrateScenePlanTimings(candidate, { tape, maxDurationSeconds: cap });
    assert.equal(calibrated.candidate.segments[0].durationCompression, undefined);
    assert.equal(validateScenePlan(calibrated.candidate, { tape, maxDurationSeconds: cap, groundedTiming: true }).ok, false);
  }
  const tape = buildSceneSourceTape('甲：' + '好'.repeat(120) + '。\n乙：' + '好'.repeat(40) + '。');
  const original = { segments: [segment(tape, tape.units[0].end, seconds(30)), segment(tape, tape.sourceText.length, seconds(10))] };
  const checked = validateScenePlan(recalibrateScenePlanTimings(original, { tape, maxDurationSeconds: 30 }).candidate, { tape, maxDurationSeconds: 30, groundedTiming: true });
  assert.equal(checked.ok, true); assert.deepEqual(checked.plan.segments.map(s => s.recommendedDurationSeconds), [30, 10]);
});

test('the authorized compression range includes exactly thirty-five seconds and no larger value', () => {
  for (const [count, expected] of [[120, false], [121, true], [140, true], [141, false]]) {
    const tape = buildSceneSourceTape('甲：' + '好'.repeat(count) + '。');
    const result = recalibrateScenePlanTimings({ segments: [segment(tape, tape.sourceText.length, seconds(count / 4))] }, { tape, maxDurationSeconds: 30 });
    assert.equal(Boolean(result.candidate.segments[0].durationCompression), expected, String(count));
    const checked = validateScenePlan(result.candidate, { tape, maxDurationSeconds: 30, groundedTiming: true });
    assert.equal(checked.ok, count <= 140, JSON.stringify(checked.issues));
  }
});

test('static warehouse details do not erase actors actively grabbing or throwing a prop', () => {
  const facts = getDirectorSegmentTimingFacts({ sourceText: '△仓库中央，甲抓起枪，目光阴狠。\n甲：谁在那里？' });
  assert.ok(facts.actionTimeline.actionSeconds > 0);
  const unknown = getDirectorSegmentTimingFacts({ sourceText: '△甲藏在房内开枪射击，然后缓慢搬运沉重货箱。' });
  assert.equal(unknown.actionTimeline.unknownBeatCount, 1);
});

async function compressedStoreFixture() {
  const inputText = '1-1：室内\n甲：' + '好'.repeat(130) + '。';
  const episode = { id: 'e', kind: 'episode', title: '第1集', content: inputText, prompts: [] };
  const project = { id: 'p', name: '时长回归', style: '真人电影级', aspectRatio: '9:16', episodes: [episode] };
  const skill = { id: 's', name: '测试Skill', content: '完整主文件' }, profile = { id: 'model', model: 'test-model', endpoint: 'https://example.invalid' };
  const context = { accountId: 'a', project, episode, sceneLabel: '1-1', inputText, maxDurationSeconds: 30, skill, profile };
  const state = { accountId: 'a', directorProjects: [project], skills: [skill], apiProfiles: [profile] };
  const snapshot = await createSceneSnapshot({ ...context, project, episode, inputText });
  const tape = buildSceneSourceTape(inputText);
  const candidate = recalibrateScenePlanTimings({ segments: [segment(tape, tape.sourceText.length, seconds(32.5))] }, { tape, maxDurationSeconds: 30 }).candidate;
  const checked = validateScenePlan(candidate, { tape, maxDurationSeconds: 30, groundedTiming: true });
  assert.equal(checked.ok, true);
  const plan = { id: 'plan', version: 1, ...snapshot, sourceText: tape.sourceText, sceneHeader: tape.sceneHeader, segments: [{ ...checked.plan.segments[0], id: 'seg1', index: 1 }] };
  const run = { id: 'run', commitKey: 'run:commit', snapshot, plan, checks: { audited: true }, promptIds: ['prompt1'], segmentDrafts: { seg1: { validated: true, prompt: { label: '1-1-1', content: '测试提示词' } } } };
  return { state, run };
}

test('durable results retain natural duration and compression metadata and reject invented exceptions', async () => {
  const { state, run } = await compressedStoreFixture();
  const saved = commitQuickSceneRun(state, run);
  assert.equal(saved.applied, true, saved.conflict);
  const prompt = saved.state.directorProjects[0].episodes[0].prompts[0];
  assert.equal(prompt.recommendedDurationSeconds, 30); assert.equal(prompt.naturalEstimatedSeconds, 32.5);
  assert.equal(prompt.durationCompression.paceFactor, 1.0833);
  for (const update of [{ naturalEstimatedSeconds: 36 }, { timing: seconds(36) }, { durationCompression: { ...run.plan.segments[0].durationCompression, paceFactor: 2 } }]) {
    const tampered = structuredClone(run); Object.assign(tampered.plan.segments[0], update);
    assert.equal(commitQuickSceneRun(state, tampered).applied, false, JSON.stringify(update));
  }
});

test('underfilled whole-turn boundaries can be durably committed and a flag cannot allow a half-turn cut', async () => {
  const { state, run } = await compressedStoreFixture();
  const inputText = '1-1：室内\n甲：' + '好'.repeat(80) + '。\n乙：' + '好'.repeat(80) + '。';
  const episode = { ...state.directorProjects[0].episodes[0], content: inputText };
  const project = { ...state.directorProjects[0], episodes: [episode] };
  const snapshot = await createSceneSnapshot({ accountId: state.accountId, project, episode, sceneLabel: '1-1', inputText,
    maxDurationSeconds: 30, skill: state.skills[0], profile: state.apiProfiles[0] });
  const tape = buildSceneSourceTape(inputText);
  const checked = validateScenePlan({ segments: [segment(tape, tape.units[0].end, seconds(20)), segment(tape, tape.sourceText.length, seconds(20))] }, { tape, maxDurationSeconds: 30, groundedTiming: true });
  assert.equal(checked.ok, true);
  const updatedRun = { ...run, snapshot, promptIds: ['prompt1', 'prompt2'], plan: { ...run.plan, ...snapshot, sourceText: tape.sourceText, sceneHeader: tape.sceneHeader,
    segments: checked.plan.segments.map((item, i) => ({ ...item, id: 'seg' + (i + 1) })) },
    segmentDrafts: { seg1: { validated: true, prompt: { label: '1-1-1', content: '甲的完整原话' } }, seg2: { validated: true, prompt: { label: '1-1-2', content: '乙的完整原话' } } } };
  const currentState = { ...state, directorProjects: [project] };
  assert.equal(commitQuickSceneRun(currentState, updatedRun).applied, true);
  const tampered = structuredClone(updatedRun);
  tampered.plan.segments[0].sourceEnd -= 10;
  tampered.plan.segments[1].sourceStart = tampered.plan.segments[0].sourceEnd;
  tampered.plan.segments[0].completeDialoguePriority = true;
  assert.equal(commitQuickSceneRun(currentState, tampered).applied, false);
});
