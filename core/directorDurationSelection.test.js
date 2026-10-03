import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDurationLimit, buildSceneSourceTape, validateScenePlan } from './directorSegmentation.js';
import { createSceneSnapshot, snapshotMatchesContext, commitQuickSceneRun } from './directorQuickStore.js';
import { packScenePlan } from './directorPlanPacking.js';
import { recalibrateScenePlanTimings, validateDirectorSegmentTiming } from './directorTiming.js';
import { buildSegmentationMessages, buildWholeSceneSkillRequest, buildSceneAuditMessages } from './directorSegmentationMessages.js';

const segment = (unitId, seconds) => ({ end: { unitId }, timing: { speechSeconds: seconds, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: '原文起态', endState: '原文终态', boundary: '完整讲话结束', visualNotes: [] });
const contextFor = selection => {
  const episode = { id: 'e', kind: 'episode', title: '第1集', content: `1-1：室内\n甲：${'我'.repeat(140)}。`, prompts: [] };
  const project = { id: 'p', style: '真人电影集', aspectRatio: '9:16', episodes: [episode] };
  const skill = { id: 's', name: '导演', content: '完整Skill' };
  const profile = { id: 'm', model: 'fixture', provider: 'openai' };
  return { accountId: 'account', project, episode, skill, profile, sceneLabel: '1-1', inputText: episode.content, maxDurationSeconds: selection };
};

test('automatic duration has a 35-second cap and selections retain every explicit integer through 35', () => {
  assert.equal(assertDurationLimit(0), 35);
  for (let seconds = 1; seconds <= 35; seconds++) assert.equal(assertDurationLimit(seconds), seconds);
  for (const invalid of [-1, 36, 1.5, NaN, Infinity, '0', null]) assert.throws(() => assertDurationLimit(invalid));
});

test('snapshots persist automatic zero and distinguish its fingerprint from an explicit 35-second selection', async () => {
  const autoContext = contextFor(0);
  const auto = await createSceneSnapshot(autoContext);
  const explicit = await createSceneSnapshot({ ...autoContext, maxDurationSeconds: 35 });
  const persisted = JSON.parse(JSON.stringify(auto));
  assert.equal(persisted.maxDurationSeconds, 0);
  assert.notEqual(auto.settingsHash, explicit.settingsHash);
  assert.equal(await snapshotMatchesContext(persisted, autoContext), true);
  assert.equal(await snapshotMatchesContext(persisted, { ...autoContext, maxDurationSeconds: 35 }), false);
  for (const invalid of [-1, 36]) await assert.rejects(createSceneSnapshot({ ...autoContext, maxDurationSeconds: invalid }));
  const legacy = await createSceneSnapshot({ ...autoContext, maxDurationSeconds: 30 });
  const original = JSON.stringify(legacy);
  assert.equal(await snapshotMatchesContext(legacy, { ...autoContext, maxDurationSeconds: 30 }), true);
  assert.equal(JSON.stringify(legacy), original);
});

test('automatic and explicit 35 allow a full 35-second clip while rejecting over-limit and zero-duration clips', () => {
  const tape = buildSceneSourceTape(`甲：${'我'.repeat(140)}。`);
  for (const selection of [0, 35]) {
    const options = { tape, maxDurationSeconds: selection, groundedTiming: true };
    const full = validateScenePlan({ segments: [segment('u1', 35)] }, options);
    assert.equal(full.ok, true, JSON.stringify(full.issues));
    assert.equal(full.plan.maxDurationSeconds, selection);
    assert.equal(full.plan.segments[0].recommendedDurationSeconds, 35);
    assert.equal(full.plan.segments[0].durationCompression, undefined);
    const exceeded = validateScenePlan({ segments: [segment('u1', 35.01)] }, options);
    assert.ok(exceeded.issues.some(issue => issue.code === 'DURATION_EXCEEDED'));
    const zero = validateScenePlan({ segments: [segment('u1', 0)] }, options);
    assert.ok(zero.issues.some(issue => issue.code === 'INVALID_TIMING'));
  }
  assert.ok(validateScenePlan({ segments: [segment('u1', 35)] }, { tape, maxDurationSeconds: 34 }).issues.some(issue => issue.code === 'DURATION_EXCEEDED'));
});

test('grounded timing uses the automatic 35-second capacity rather than a zero-second capacity', () => {
  const sourceText = `甲：${'我'.repeat(140)}。`;
  const result = validateDirectorSegmentTiming({ sourceText, sourceStart: 0, sourceEnd: sourceText.length, timing: segment('u1', 35).timing, maxDurationSeconds: 0 });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
});

test('automatic packing covers a long scene with positive clips capped at 35 seconds', () => {
  const tape = buildSceneSourceTape(Array.from({ length: 6 }, (_, i) => `${i % 2 ? '乙' : '甲'}：${'我'.repeat(70)}。`).join('\n'));
  const candidate = { segments: tape.units.map(unit => segment(unit.id, 17.5)) };
  for (const selection of [0, 35]) {
    const packed = packScenePlan(candidate, { tape, maxDurationSeconds: selection });
    const checked = validateScenePlan(packed.candidate, { tape, maxDurationSeconds: selection, groundedTiming: true });
    assert.equal(checked.ok, true, JSON.stringify(checked.issues));
    assert.deepEqual(checked.plan.segments.map(item => item.recommendedDurationSeconds), [35, 35, 35]);
    assert.equal(checked.plan.segments.map(item => tape.sourceText.slice(item.sourceStart, item.sourceEnd)).join(''), tape.sourceText);
  }
});

test('automatic rehearsal merges a natural 33-second scene without the explicit 30-second compression exception', () => {
  const tape = buildSceneSourceTape(`甲：${'我'.repeat(66)}。\n乙：${'我'.repeat(66)}。`);
  const candidate = { segments: tape.units.map(unit => segment(unit.id, 16.5)) };
  const recalibrated = recalibrateScenePlanTimings(candidate, { tape, maxDurationSeconds: 0 });
  assert.equal(recalibrated.candidate.segments.length, 1);
  const checked = validateScenePlan(recalibrated.candidate, { tape, maxDurationSeconds: 0, groundedTiming: true });
  assert.equal(checked.ok, true, JSON.stringify(checked.issues));
  assert.equal(checked.plan.segments[0].recommendedDurationSeconds, 33);
  assert.equal(checked.plan.segments[0].durationCompression, undefined);
});

test('atomic saving retains automatic selection zero with a real positive recommendation and rejects clips above 35', async () => {
  const context = contextFor(0);
  const snapshot = await createSceneSnapshot(context);
  const tape = buildSceneSourceTape(context.inputText);
  const checked = validateScenePlan({ segments: [segment('u1', 35)] }, { tape, maxDurationSeconds: 0, groundedTiming: true });
  assert.equal(checked.ok, true, JSON.stringify(checked.issues));
  const plan = { ...checked.plan, ...snapshot, id: 'plan' };
  const run = { id: 'run', commitKey: 'run:commit', snapshot, plan, promptIds: ['prompt'], checks: { audited: true }, segmentDrafts: { 'segment-1': { validated: true, prompt: { label: '1-1-1', content: '完整提示词' } } } };
  const state = { accountId: 'account', directorProjects: [context.project], skills: [context.skill], apiProfiles: [context.profile] };
  const saved = commitQuickSceneRun(state, JSON.parse(JSON.stringify(run)));
  assert.equal(saved.applied, true, saved.conflict);
  const prompt = saved.state.directorProjects[0].episodes[0].prompts[0];
  assert.equal(prompt.maxDurationSeconds, 0);
  assert.equal(prompt.recommendedDurationSeconds, 35);
  assert.equal(saved.state.directorProjects[0].episodes[0].quickScenePlans[0].maxDurationSeconds, 0);
  const exceeded = { ...run, plan: { ...plan, segments: [{ ...plan.segments[0], estimatedSeconds: 35.01, recommendedDurationSeconds: 36, timing: segment('u1', 35.01).timing }] } };
  assert.equal(commitQuickSceneRun(state, exceeded).applied, false);
});

test('planner, whole-scene Skill and audit requests explain automatic estimation with a real 35-second cap', () => {
  const snapshot = { sceneLabel: '1-1', maxDurationSeconds: 0, style: '真人电影集', aspectRatio: '9:16' };
  const tape = buildSceneSourceTape('1-1：室内\n甲：你好。');
  const plan = { segments: [{ id: 'segment-1', index: 1, sourceStart: 0, sourceEnd: tape.sourceText.length, recommendedDurationSeconds: 1 }] };
  const request = buildWholeSceneSkillRequest({ snapshot, tape, plan });
  const messages = buildSegmentationMessages({ snapshot, tape });
  const audit = buildSceneAuditMessages({ snapshot, tape, plan, prompts: [{ label: '1-1-1', content: '正文' }] });
  for (const text of [messages.map(item => item.content).join('\n'), request.input, audit.map(item => item.content).join('\n')]) {
    assert.match(text, /自动/);
    assert.match(text, /最高视频时长：35 秒/);
    assert.doesNotMatch(text, /最高视频时长：0 秒|本次 0\.\.0 秒/);
  }
  assert.match(messages[0].content, /本次 30\.\.35 秒/);
});
