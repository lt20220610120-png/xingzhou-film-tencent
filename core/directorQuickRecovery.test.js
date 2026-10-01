import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickGenerationController } from './directorQuickGeneration.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const waitFor = async predicate => {
  for (let index = 0; index < 100; index += 1) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 2)); }
  throw new Error('test fixture never reached expected stage');
};

function makeFixture({ textHook, skillHook, saveHook } = {}) {
  const source = '1-1 景：书房 夜 内\n甲：先把灯关了。\n乙：已经关好了。';
  const episode = { id: 'episode', title: '第1集', kind: 'episode', content: source };
  const project = { id: 'project', style: '真人电影集', aspectRatio: '9:16', episodes: [episode] };
  const skill = { id: 'skill', name: 'generic-fixture', content: '按照用户指定编号生成镜头提示词。' };
  const profile = { id: 'profile', model: 'mock' };
  const candidate = { segments: [
    { end: { unitId: 'u1' }, timing: { speechSeconds: 28, actionSeconds: 2, overlapSeconds: 0, transitionSeconds: 0 }, startState: '甲在灯旁', endState: '灯已熄灭', boundary: '切乙反应', visualNotes: [] },
    { end: { unitId: 'u2' }, timing: { speechSeconds: 8, actionSeconds: 2, overlapSeconds: 0, transitionSeconds: 0 }, startState: '灯已熄灭', endState: '灯保持熄灭', boundary: 'scene-end', visualNotes: [] },
  ] };
  let accountId = 'account';
  let currentSource = source;
  const records = new Map(), calls = [], commits = [], saves = [];
  const request = { accountId, project, episode, sceneLabel: '1-1', inputText: source, skill, profile, maxDurationSeconds: 30 };
  const deps = {
    getContext: () => ({ accountId, project, episode, inputText: currentSource, skill, profile, permissions: { canGenerate: true } }),
    checkpoints: {
      list: async () => [...records.values()].map(value => structuredClone(value)),
      load: async ({ runId }) => structuredClone(records.get(runId)),
      save: async ({ run }) => { const copy = structuredClone(run); saves.push(copy); await saveHook?.(copy, saves.length); records.set(run.id, copy); },
    },
    executeText: async payload => {
      const type = payload.messages[0].content.includes('核对') ? 'audit' : 'plan';
      const call = { type, payload }; calls.push(call);
      const override = await textHook?.(call, calls, candidate);
      return override ?? JSON.stringify(type === 'plan' ? candidate : { ok: true, issues: [] });
    },
    executeSkill: async payload => {
      const label = payload.input.match(/规范编号：(\d+-\d+-\d+)/)?.[1];
      const call = { type: 'skill', label, payload }; calls.push(call);
      const override = await skillHook?.(call, calls);
      return { output: override ?? `${label}\n【画面内容】\n自然镜头与对应原话。` };
    },
    commitRun: async run => { commits.push(structuredClone(run)); return { applied: true }; },
  };
  return { controller: createQuickGenerationController(deps), deps, calls, commits, saves, records, request, candidate, changeAccount: () => { accountId = 'other'; }, changeSource: value => { currentSource = value; } };
}

test('pause and resume before old response returns keeps fixed IDs and ignores old response', async () => {
  const pending = deferred(); let first = true;
  const fixture = makeFixture({ skillHook: async call => { if (call.label === '1-1-1' && first) { first = false; return pending.promise; } } });
  const oldTask = fixture.controller.start(fixture.request);
  await waitFor(() => fixture.calls.some(call => call.type === 'skill'));
  const run = fixture.controller.entries()[0];
  const ids = [...run.promptIds];
  await fixture.controller.stop(run.id);
  const completed = await fixture.controller.resume(run.id);
  assert.equal(completed.phase, 'completed');
  assert.deepEqual(completed.promptIds, ids);
  pending.resolve('9-9-9\n这个晚回包不得写入');
  await oldTask;
  assert.equal(fixture.commits.length, 1);
  assert.ok(!JSON.stringify(fixture.commits[0]).includes('晚回包'));
});

test('stop during the initial durable checkpoint does not start a model request afterward', async () => {
  const pending = deferred();
  const fixture = makeFixture({ saveHook: async (run, number) => { if (number === 1) await pending.promise; } });
  const started = fixture.controller.start(fixture.request);
  await waitFor(() => fixture.saves.length === 1);
  const run = fixture.controller.entries()[0];
  const stopped = fixture.controller.stop(run.id);
  pending.resolve();
  await stopped;
  await started;
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.controller.get(run.id).phase, 'paused');
});

test('restored validated-plan input reuses saved planning response without billing planning twice', async () => {
  const fixture = makeFixture();
  const complete = await fixture.controller.start(fixture.request);
  const paused = fixture.saves.find(run => run.phase === 'validating-plan');
  assert.ok(paused.lastPlanningOutput);
  const restored = makeFixture();
  restored.records.set(paused.id, { ...paused, phase: 'paused' });
  await restored.controller.restore();
  const done = await restored.controller.resume(paused.id);
  assert.equal(done.phase, 'completed');
  assert.equal(restored.calls.filter(call => call.type === 'plan').length, 0);
  assert.deepEqual(done.plan.segments.map(segment => segment.recommendedDurationSeconds), [30, 10]);
  assert.equal(done.id, complete.id);
});

test('first lighting baseline and accepted draft survive interrupted second request', async () => {
  let failed = false;
  const fixture = makeFixture({ skillHook: async call => {
    if (call.label === '1-1-2') { failed = true; throw new Error('模拟断网'); }
    return `${call.label}\n【整体视听】\n光影基调：测试固定基准\n镜头：甲关闭灯。`;
  } });
  const interrupted = await fixture.controller.start(fixture.request);
  assert.equal(interrupted.phase, 'failed'); assert.equal(failed, true);
  assert.equal(interrupted.sharedBaseline, '测试固定基准');
  const resumed = makeFixture({ skillHook: async call => `${call.label}\n光影基调：测试固定基准\n乙在灯灭后回答。` });
  resumed.records.set(interrupted.id, structuredClone(interrupted));
  await resumed.controller.restore();
  const done = await resumed.controller.resume(interrupted.id);
  assert.equal(done.phase, 'completed');
  assert.deepEqual(done.promptIds, interrupted.promptIds);
  assert.equal(resumed.calls.filter(call => call.type === 'skill' && call.label === '1-1-1').length, 0);
  assert.match(resumed.calls.find(call => call.type === 'skill').payload.beforeUserMessages[0].content, /测试固定基准/);
});

test('changed source or account while waiting prevents committing any late response', async () => {
  for (const change of ['source', 'account']) {
    const pending = deferred();
    const fixture = makeFixture({ skillHook: async () => pending.promise });
    const task = fixture.controller.start(fixture.request);
    await waitFor(() => fixture.calls.some(call => call.type === 'skill'));
    if (change === 'source') fixture.changeSource('1-1 景：书房 夜 内\n甲已经退出。'); else fixture.changeAccount();
    pending.resolve('1-1-1\n旧场景结果');
    const run = await task;
    assert.equal(run.phase, change === 'source' ? 'stale' : 'paused');
    assert.equal(fixture.commits.length, 0);
  }
});

test('semantic audit repairs a failed segment once and never loops indefinitely', async () => {
  const fixture = makeFixture({ textHook: async call => call.type === 'audit' ? JSON.stringify({ ok: false, issues: [{ code: 'STATE_RESET', segmentIndex: 1, message: '灯状态需要复核', evidence: { sourceQuote: '灯关了' } }] }) : undefined });
  const run = await fixture.controller.start(fixture.request);
  assert.equal(run.phase, 'needs-review');
  assert.equal(fixture.commits.length, 0);
  assert.equal(fixture.calls.filter(call => call.type === 'audit').length, 2);
  assert.equal(fixture.calls.filter(call => call.type === 'skill' && call.label === '1-1-1').length, 2);
});
