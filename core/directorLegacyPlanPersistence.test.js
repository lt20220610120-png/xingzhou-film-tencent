import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickGenerationController } from './directorQuickGeneration.js';
import { createSceneSnapshot, commitQuickSceneRun, directorSceneInput } from './directorQuickStore.js';
import { buildSceneSourceTape, validateScenePlan } from './directorSegmentation.js';

function fixture(source, candidate) {
  const episode = { id: 'episode', title: '第1集', content: source };
  const project = { id: 'project', name: '旧付费草稿恢复', style: '真人电影集', aspectRatio: '9:16', episodes: [episode] };
  const skill = { id: 'skill', name: 'generic', content: '生成编号提示词' };
  const profile = { id: 'profile', model: 'mock' };
  let state = { accountId: 'account', directorProjects: [project], skills: [skill], apiProfiles: [profile] };
  const records = new Map(), calls = [];
  const request = { accountId: state.accountId, project, episode, sceneLabel: '1-1', inputText: source, maxDurationSeconds: 30, skill, profile };
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
    executeSkill: async ({ input }) => {
      const label = input.match(/规范编号：(\d+-\d+-\d+)/)[1]; calls.push(label);
      return `${label}\n本次新生成的完整提示词。`;
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
  assert.deepEqual(f.calls, ['1-1-2', 'audit']);
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
  assert.deepEqual(f.calls, ['plan', '1-1-1', 'audit']);
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
