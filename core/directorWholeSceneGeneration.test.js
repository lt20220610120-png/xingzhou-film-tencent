import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickGenerationController } from './directorQuickGeneration.js';

const baseline = '影像基准=数字电影；镜组=35mm T2.8；采样=24fps 180° EI800；WB=5600K；主光=窗光5600K 方位角90° 仰角45°；补光=墙反射5600K；K:F=2:1；影调=Rec.709 白位90IRE';
const fastPrompt = (label, { light = baseline, action = '甲按开关，乙看着熄灭的灯。' } = {}) => `${label}
【基础设定】
人物：甲和乙在书房。
场景：夜，内，书房。
道具：台灯。
音色：甲，青年声线；乙，成年声线。
限制：禁止字幕、水印、Logo和无意义UI；无需背景音乐。
【整体视听】
画幅与风格：9:16，真人电影级。
光影基调：${light}
节奏与环境声：简洁节奏，室内风声。
【连续台词】
D01｜${label.endsWith('-1') ? '甲' : '乙'}｜现场对白｜分镜01内说完：『${label.endsWith('-1') ? '先关灯。' : '已经关好了。'}』
【画面内容】
分镜01｜比重约100%
景别：手部特写。
机位：侧方拍摄。
运镜：固定观察。
表演与动作：${action}
光影：窗光落在甲的手背与开关上。
声音：D01开始并结束；开关轻响。
【人物起止与运动轨迹】
甲：桌旁 → 关闭台灯 → 仍在桌旁。
乙：桌旁 → 看着台灯 → 仍在桌旁。`;
const fullOutput = options => ['1-1-1', '1-1-2'].map(label => fastPrompt(label, options?.[label])).join('\n\n');

function fixture({ records = new Map(), skillOutput = () => fullOutput(), onSave = () => {}, maxQualityAttempts = 2 } = {}) {
  const source = '1-1 景：书房 夜 内\n甲：先关灯。\n乙：已经关好了。';
  const episode = { id: 'episode', title: '第1集', kind: 'episode', content: source };
  const project = { id: 'project', style: '真人电影级', aspectRatio: '9:16', episodes: [episode] };
  const skill = { id: 'skill', name: 'fixture', content: fastPrompt('1-1-1') + '\n同场光影基调逐字复用。' };
  const profile = { id: 'model', model: 'mock' };
  const request = { accountId: 'account', project, episode, inputText: source, sceneLabel: '1-1', skill, profile, maxDurationSeconds: 30 };
  const calls = [], snapshots = [], progress = [], commits = [];
  const controller = createQuickGenerationController({
    maxQualityAttempts,
    getContext: () => ({ ...request, permissions: { canGenerate: true } }),
    checkpoints: {
      save: async ({ run }) => { records.set(run.id, structuredClone(run)); snapshots.push(structuredClone(run)); onSave(run); },
      list: async () => [...records.values()].map(run => structuredClone(run)),
      load: async ({ runId }) => structuredClone(records.get(runId)),
    },
    executeText: async ({ messages }) => {
      const kind = messages[0].content.includes('核对') ? 'audit' : 'plan'; calls.push({ kind });
      return JSON.stringify(kind === 'audit' ? { ok: true, issues: [] } : { segments: [
        { end: { unitId: 'u1' }, timing: { speechSeconds: 30, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: '灯亮', endState: '灯灭', boundary: '切乙', visualNotes: [] },
        { end: { unitId: 'u2' }, timing: { speechSeconds: 10, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: '灯灭', endState: '灯灭', boundary: 'scene-end', visualNotes: [] },
      ] });
    },
    executeSkill: async payload => { calls.push({ kind: 'skill', payload }); return skillOutput(payload, calls.filter(call => call.kind === 'skill').length); },
    commitProgress: async run => { progress.push(structuredClone(run)); return { applied: true }; },
    commitRun: async run => { commits.push(structuredClone(run)); return { applied: true }; },
  });
  return { controller, request, records, calls, snapshots, progress, commits };
}

test('one whole Skill reply is durably checkpointed before independently validating and publishing both cards', async () => {
  const f = fixture();
  const done = await f.controller.start(f.request);
  assert.equal(done.phase, 'completed', JSON.stringify(done.errors));
  assert.deepEqual(f.calls.map(call => call.kind), ['plan', 'skill', 'audit']);
  const payload = f.calls.find(call => call.kind === 'skill').payload;
  assert.deepEqual(payload.expectedLabels, ['1-1-1', '1-1-2']);
  assert.deepEqual(payload.input.match(/^（\d+）$/gm), ['（1）', '（2）']);
  assert.ok(payload.input.includes('甲：先关灯。'));
  assert.ok(payload.input.includes('乙：已经关好了。'));
  const savedRaw = f.snapshots.find(run => run.wholeSceneResponses?.some(response => response.complete));
  assert.equal(Object.keys(savedRaw.segmentDrafts).length, 0);
  assert.equal(savedRaw.wholeSceneResponses[0].output, fullOutput());
  assert.equal(f.progress.length, 2);
  assert.equal(done.sharedBaseline, baseline);
  assert.equal(done.wholeSceneResponses.length, 1);
  assert.equal(f.commits.length, 1);
});

test('restart after paid whole reply was saved but before splitting requires zero new Skill calls', async () => {
  let crash = true;
  const before = fixture({ onSave: run => { if (crash && run.wholeSceneResponses?.some(response => response.complete) && !Object.keys(run.segmentDrafts).length) { crash = false; throw new Error('crash-after-raw-save'); } } });
  const interrupted = await before.controller.start(before.request);
  assert.equal(interrupted.phase, 'failed');
  assert.equal(interrupted.wholeSceneResponses[0].output, fullOutput());
  const resumed = fixture({ records: before.records, skillOutput: () => { throw new Error('paid-output-must-not-regenerate'); } });
  await resumed.controller.restore();
  const done = await resumed.controller.resume(interrupted.id);
  assert.equal(done.phase, 'completed', JSON.stringify(done.errors));
  assert.deepEqual(resumed.calls.map(call => call.kind), ['audit']);
  assert.deepEqual(done.promptIds, interrupted.promptIds);
  assert.equal(Object.values(done.segmentDrafts).filter(draft => draft.validated).length, 2);
});

test('cached complete bounded retry supersedes earlier partial in its request chain after restart', async () => {
  let crash = true;
  const before = fixture({
    skillOutput: (_payload, count) => {
      if (count === 1) throw Object.assign(new Error('输出被截断'), { partialText: fastPrompt('1-1-1', { action: '甲抬手摸到台灯开关。' }) + '\n\n1-1-2\n【基础设定】\n人物：' });
      return fullOutput();
    },
    onSave: run => { if (crash && run.wholeSceneResponses?.some(response => response.complete) && !Object.keys(run.segmentDrafts).length) { crash = false; throw new Error('crash-after-retried-full-save'); } },
  });
  const interrupted = await before.controller.start(before.request);
  assert.equal(interrupted.phase, 'failed');
  assert.equal(before.calls.filter(call => call.kind === 'skill').length, 2);
  assert.equal(interrupted.wholeSceneResponses.length, 2);
  assert.equal(interrupted.wholeSceneResponses[0].complete, false);
  assert.equal(interrupted.wholeSceneResponses[0].requestGroupId, interrupted.wholeSceneResponses[1].requestGroupId);
  const resumed = fixture({ records: before.records, skillOutput: () => { throw new Error('cached-complete-must-not-regenerate'); } });
  await resumed.controller.restore();
  const done = await resumed.controller.resume(interrupted.id);
  assert.equal(done.phase, 'completed', JSON.stringify(done.errors));
  assert.deepEqual(resumed.calls.map(call => call.kind), ['audit']);
  assert.equal(done.segmentDrafts[done.plan.segments[0].id].prompt.content, fastPrompt('1-1-1'));
  assert.deepEqual(done.wholeSceneIssues, []);
  assert.equal(done.wholeSceneQualityFailures || 0, 0);
  assert.equal(done.wholeSceneResponses.length, 2);
});

test('wrong numbered second block never silently becomes the expected card and repairs with whole scene', async () => {
  const f = fixture({ skillOutput: (payload, count) => count === 1
    ? fastPrompt('1-1-1') + '\n\n' + fastPrompt('1-1-3')
    : payload.expectedLabels.map(label => payload.preservedPrompts.find(prompt => prompt.label === label)?.content || fastPrompt(label)).join('\n\n') });
  const done = await f.controller.start(f.request);
  assert.equal(done.phase, 'completed', JSON.stringify(done.errors));
  const repair = f.calls.filter(call => call.kind === 'skill')[1].payload;
  assert.deepEqual(repair.expectedLabels, ['1-1-1', '1-1-2']);
  assert.deepEqual(repair.preservedPrompts, [{ label: '1-1-1', content: fastPrompt('1-1-1') }]);
  assert.match(repair.beforeUserMessages[0].content, /MISSING_SCENE_PROMPT/);
  assert.deepEqual(repair.input.match(/^（\d+）$/gm), ['（1）', '（2）']);
  assert.equal(done.segmentDrafts[done.plan.segments[1].id].prompt.label, '1-1-2');
});

test('inconsistent whole lighting retries within a fixed budget while retaining accepted first card', async () => {
  const f = fixture({ skillOutput: () => fullOutput({ '1-1-2': { light: baseline.replace('EI800', 'EI1600') } }) });
  const failed = await f.controller.start(f.request);
  assert.equal(failed.phase, 'needs-review');
  assert.equal(f.calls.filter(call => call.kind === 'skill').length, 2);
  assert.equal(f.commits.length, 0);
  const first = failed.segmentDrafts[failed.plan.segments[0].id];
  assert.equal(first.validated, true);
  assert.equal(first.prompt.content, fastPrompt('1-1-1'));
  assert.equal(failed.segmentDrafts[failed.plan.segments[1].id].validated, false);
  assert.ok(failed.wholeSceneIssues.some(issue => issue.code === 'BASELINE_CHANGED'));
  assert.deepEqual(f.calls.filter(call => call.kind === 'skill')[1].payload.preservedPrompts, [{ label: '1-1-1', content: first.prompt.content }]);
});

test('repair preserves accepted local card even when the model unnecessarily rewrites its copy', async () => {
  const f=fixture({skillOutput:(_payload,count)=>count===1
    ? fullOutput({'1-1-2':{light:baseline.replace('EI800','EI1600')}})
    : fullOutput({'1-1-1':{action:'甲再次看了一眼灯。'}})});
  const done=await f.controller.start(f.request);
  assert.equal(done.phase,'completed',JSON.stringify(done.errors));
  assert.equal(done.segmentDrafts[done.plan.segments[0].id].prompt.content,fastPrompt('1-1-1'));
  assert.equal(done.segmentDrafts[done.plan.segments[1].id].validated,true);
  assert.equal(f.calls.filter(call=>call.kind==='skill').length,2);
});
