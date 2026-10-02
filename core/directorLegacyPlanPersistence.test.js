import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickGenerationController } from './directorQuickGeneration.js';
import { createSceneSnapshot, commitQuickSceneRun, directorSceneInput } from './directorQuickStore.js';
import { buildSceneSourceTape, validateScenePlan } from './directorSegmentation.js';

function fixture(source, candidate, { maxDurationSeconds = 30 } = {}) {
  const episode = { id: 'episode', title: '第1集', content: source };
  const project = { id: 'project', name: '旧付费草稿恢复', style: '真人电影集', aspectRatio: '9:16', episodes: [episode] };
  const skill = { id: 'skill', name: 'generic', content: '生成编号提示词' };
  const profile = { id: 'profile', model: 'mock' };
  let state = { accountId: 'account', directorProjects: [project], skills: [skill], apiProfiles: [profile] };
  const records = new Map(), calls = [];
  const request = { accountId: state.accountId, project, episode, sceneLabel: '1-1', inputText: source, maxDurationSeconds, skill, profile };
  const getContext = () => {
    const project = state.directorProjects[0], episode = project.episodes[0];
    return { ...request, project, episode, inputText: directorSceneInput(project, episode, '1-1'), permissions: { canGenerate: true } };
  };
  const commit = async (run, partial) => {
    const result = commitQuickSceneRun(state, run, { partial });
    state = result.state;
    return result;
  };
  const controller = createQuickGenerationController({
    groundedTiming: true, maxQualityAttempts: 1, getContext,
    checkpoints: {
      save: async ({ run }) => records.set(run.id, structuredClone(run)),
      list: async () => [...records.values()].map(run => structuredClone(run)),
      load: async ({ runId }) => structuredClone(records.get(runId)),
    },
    executeText: async ({ messages }) => {
      const audit = messages[0].content.includes('核对'); calls.push(audit ? 'audit' : 'plan');
      return JSON.stringify(audit ? { ok: true, issues: [] } : candidate);
    },
    executeSkill: async ({ expectedLabels, preservedPrompts = [] }) => {
      calls.push('whole-scene');
      return expectedLabels.map(label => preservedPrompts.find(prompt => prompt.label === label)?.content || `${label}\n本次新生成的完整提示词。`).join('\n\n');
    },
    commitProgress: run => commit(run, true), commitRun: run => commit(run, false),
  });
  return { request, controller, records, calls, get state() { return state; }, set state(value) { state = value; } };
}

async function seedPartial(f, source, timings) {
  const snapshot = await createSceneSnapshot(f.request), tape = buildSceneSourceTape(source);
  const candidate = { segments: timings.map((speechSeconds, index) => ({
    end: { unitId: tape.units[index].id }, timing: { speechSeconds, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 },
    startState: '原文起点', endState: '原文终点', boundary: '原文衔接', visualNotes: [],
  })) };
  // The real older release had already approved this plan and saved its first
  // paid card. Seed it through the real store, without bypassing commit checks.
  const checked = validateScenePlan(candidate, { tape, maxDurationSeconds: 30 });
  assert.equal(checked.ok, true);
  const plan = {
    ...checked.plan, id: 'plan-legacy', version: 1, sceneLabel: snapshot.sceneLabel,
    sourceHash: snapshot.sourceHash, settingsHash: snapshot.settingsHash, skillHash: snapshot.skillHash, profileHash: snapshot.profileHash,
    rulesVersion: snapshot.rulesVersion, createdAt: '2026-10-01T00:00:00Z',
  };
  const run = {
    id: 'legacy', kind: 'scene', processingVersion: 3, snapshot, plan, phase: 'failed', commitKey: 'legacy',
    promptIds: plan.segments.map((_, i) => `paid-${i + 1}`),
    segmentDrafts: { [plan.segments[0].id]: { prompt: { label: '1-1-1', content: '1-1-1\n原来已经付费保存的提示词。' }, validated: true, baseline: '' } },
    checks: { audited: false, ranges: {} }, errors: [{ code: 'FAILED', message: '旧请求中断' }],
    segmentQualityFailures: {}, auditRepairIndexes: [], revision: 1,
  };
  const partial = commitQuickSceneRun(f.state, run, { partial: true });
  assert.equal(partial.applied, true, partial.conflict);
  f.state = partial.state; f.records.set(run.id, structuredClone(run));
  return run;
}

test('same-partition legacy resume keeps the published plan immutable and commits remaining cards through the real store', async () => {
  const source = `1-1 景：屋内 日 内\n甲：${'甲'.repeat(120)}。\n乙：${'乙'.repeat(40)}。`;
  const f = fixture(source, null), legacy = await seedPartial(f, source, [30, 10]);
  const publishedJson = JSON.stringify(f.state.directorProjects[0].episodes[0].quickScenePlans[0]);
  await f.controller.restore(); const done = await f.controller.resume(legacy.id);
  assert.equal(done.phase, 'completed', JSON.stringify(done.errors));
  assert.deepEqual(f.calls, ['whole-scene', 'audit']);
  assert.deepEqual(done.promptIds, legacy.promptIds);
  const project = f.state.directorProjects[0], episode = project.episodes[0];
  assert.equal(JSON.stringify(episode.quickScenePlans[0]), publishedJson);
  assert.deepEqual(episode.prompts.map(prompt => prompt.id), ['paid-1', 'paid-2']);
  assert.equal(episode.prompts[0].content, legacy.segmentDrafts[legacy.plan.segments[0].id].prompt.content);
  assert.equal(episode.prompts.every(prompt => prompt.sceneAuditStatus === 'passed'), true);
  assert.equal(project.promptHistory.length, 2);
});

test('a shorter legacy scene gets a fresh merged plan ID while preserving its previous paid card and plan history', async () => {
  const source = `1-1 景：屋内 日 内\n甲：${'甲'.repeat(40)}。\n乙：${'乙'.repeat(40)}。`;
  const tape = buildSceneSourceTape(source);
  const candidate = { segments: [{ end: { unitId: tape.units.at(-1).id }, timing: { speechSeconds: 20, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: '原文起点', endState: '原文终点', boundary: 'scene-end', visualNotes: [] }] };
  const f = fixture(source, candidate), legacy = await seedPartial(f, source, [30, 10]);
  const publishedJson = JSON.stringify(f.state.directorProjects[0].episodes[0].quickScenePlans[0]);
  await f.controller.restore(); const done = await f.controller.resume(legacy.id);
  assert.equal(done.phase, 'completed', JSON.stringify(done.errors));
  assert.deepEqual(f.calls, ['plan', 'whole-scene', 'audit']);
  assert.equal(done.plan.segments.length, 1); assert.equal(done.plan.segments[0].recommendedDurationSeconds, 20);
  assert.notEqual(done.plan.id, legacy.plan.id); assert.notEqual(done.plan.id, 'plan-legacy');
  assert.equal(done.promptIds.length, 1); assert.equal(done.promptIds.includes('paid-1'), false);
  assert.equal(done.previousDrafts[0].prompt.content, legacy.segmentDrafts[legacy.plan.segments[0].id].prompt.content);
  const project = f.state.directorProjects[0], episode = project.episodes[0];
  assert.equal(JSON.stringify(episode.quickScenePlans[0]), publishedJson);
  assert.equal(episode.quickScenePlans.length, 2); assert.equal(episode.activeQuickScenePlanIds['1-1'], done.plan.id);
  assert.equal(episode.prompts.find(prompt => prompt.id === 'paid-1').content, legacy.segmentDrafts[legacy.plan.segments[0].id].prompt.content);
  assert.equal(project.promptHistory.length, 2);
});

test('version 4 unfinished 30-plus-short-tail plan upgrades to the authorized single 30-second target with fresh IDs and preserved paid history', async () => {
  const source = `1-1 景：屋内 日 内\n甲：${'甲'.repeat(90)}。\n乙：${'乙'.repeat(40)}。`;
  const tape = buildSceneSourceTape(source);
  const candidate = { segments: [{ end: { unitId: tape.units.at(-1).id }, timing: { speechSeconds: 32.5, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: '甲在桌边', endState: '乙收句', boundary: 'scene-end', visualNotes: [] }] };
  const f = fixture(source, candidate), legacy = await seedPartial(f, source, [30, 10]);
  legacy.processingVersion = 4;
  f.records.set(legacy.id, structuredClone(legacy));
  const paid = structuredClone(f.state.directorProjects[0].episodes[0].prompts[0]);
  await f.controller.restore(); const done = await f.controller.resume(legacy.id);
  assert.equal(done.phase, 'completed', JSON.stringify(done.errors));
  assert.equal(done.processingVersion, 6);
  assert.equal(done.plan.segments.length, 1);
  assert.equal(done.plan.segments[0].recommendedDurationSeconds, 30);
  assert.equal(done.plan.segments[0].naturalEstimatedSeconds, 32.5);
  assert.equal(done.plan.segments[0].durationCompression.paceFactor, 1.0833);
  assert.notEqual(done.plan.id, legacy.plan.id);
  assert.equal(done.plan.segments.some(segment => legacy.plan.segments.some(old => old.id === segment.id)), false);
  assert.equal(done.promptIds.some(id => legacy.promptIds.includes(id)), false);
  assert.deepEqual(done.previousPlans, [legacy.plan]);
  assert.equal(done.previousDrafts[0].prompt.content, paid.content);
  assert.deepEqual(f.state.directorProjects[0].episodes[0].prompts.find(prompt => prompt.id === paid.id), paid);
  assert.equal(f.state.directorProjects[0].promptHistory.length, 2);
  assert.deepEqual(f.calls, ['plan', 'whole-scene', 'audit']);
});

test('version 4 interrupted 15-second plan cannot reuse a half-sentence boundary and keeps its prior paid card unchanged', async () => {
  const finalSpeech = '现在这个危险的情况，先活过这七天再说。';
  const source = `1-1 景：走廊 清晨 内\n甲：${'甲'.repeat(55)}。\n乙：${finalSpeech}`;
  const tape = buildSceneSourceTape(source), cut = tape.sourceText.indexOf('情况');
  const candidate = { segments: [
    { end: { unitId: 'u1' }, timing: { speechSeconds: 13.75, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: '甲交代', endState: '甲收句', boundary: '切乙', visualNotes: [] },
    { end: { unitId: 'u2' }, timing: { speechSeconds: 4.25, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: '乙等待', endState: '乙说完整句', boundary: 'scene-end', visualNotes: [] },
  ] };
  const f = fixture(source, candidate, { maxDurationSeconds: 15 });
  const snapshot = await createSceneSnapshot(f.request);
  // This intentionally represents JSON already approved by v2.4.13. It
  // cannot be seeded through today's store, which must reject this old cut.
  const plan = { id: 'plan-old-cut', version: 1, sceneLabel: '1-1', sourceText: tape.sourceText, sourceSnapshot: source, sceneHeader: tape.sceneHeader,
    sourceHash: snapshot.sourceHash, settingsHash: snapshot.settingsHash, skillHash: snapshot.skillHash, profileHash: snapshot.profileHash,
    maxDurationSeconds: 15, rulesVersion: snapshot.rulesVersion, createdAt: '2026-10-02T00:00:00Z', segments: [
      { id: 'old-1', index: 1, sourceStart: 0, sourceEnd: cut, estimatedSeconds: 15, recommendedDurationSeconds: 15,
        timing: { speechSeconds: 15, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: '甲讲话', endState: '乙说半句', boundary: '旧词语边界', visualNotes: [] },
      { id: 'old-2', index: 2, sourceStart: cut, sourceEnd: tape.sourceText.length, estimatedSeconds: 3, recommendedDurationSeconds: 3,
        timing: { speechSeconds: 3, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: '乙续句', endState: '乙收句', boundary: 'scene-end', visualNotes: [] },
    ] };
  const paid = { id: 'paid-old-cut', label: '1-1-1', content: '1-1-1\n旧版已经付费并保存的前半句提示词。', generationRunId: 'old-cut', segmentId: 'old-1', segmentationPlanId: plan.id, sceneAuditStatus: 'pending' };
  f.state.directorProjects[0].episodes[0].quickScenePlans = [structuredClone(plan)];
  f.state.directorProjects[0].episodes[0].prompts = [structuredClone(paid)];
  f.state.directorProjects[0].promptHistory = [structuredClone(paid)];
  const run = { id: 'old-cut', kind: 'scene', processingVersion: 4, snapshot, plan, phase: 'failed', commitKey: 'old-cut', promptIds: [paid.id, 'paid-unfinished'],
    segmentDrafts: { 'old-1': { prompt: { label: paid.label, content: paid.content }, validated: true } }, checks: { audited: false, ranges: {} }, errors: [], segmentQualityFailures: {}, auditRepairIndexes: [], revision: 1 };
  f.records.set(run.id, run);
  await f.controller.restore(); const done = await f.controller.resume(run.id);
  assert.equal(done.phase, 'completed', JSON.stringify(done.errors));
  assert.equal(done.processingVersion, 6);
  assert.equal(done.plan.segments.length, 2);
  assert.equal(done.plan.segments[0].sourceEnd, tape.units[0].end);
  assert.equal(tape.sourceText.slice(done.plan.segments[1].sourceStart, done.plan.segments[1].sourceEnd), `乙：${finalSpeech}`);
  assert.equal(done.plan.segments.some(segment => segment.id === 'old-1' || segment.id === 'old-2'), false);
  assert.deepEqual(done.previousPlans, [plan]);
  assert.equal(done.previousDrafts[0].prompt.content, paid.content);
  assert.deepEqual(f.state.directorProjects[0].episodes[0].prompts.find(prompt => prompt.id === paid.id), paid);
  assert.equal(f.state.directorProjects[0].promptHistory.length, 3);
  assert.deepEqual(f.calls, ['plan', 'whole-scene', 'audit']);
});
