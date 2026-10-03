import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickGenerationController } from './directorQuickGeneration.js';

const baseline = '影像基准=数字电影；镜组=35mm T2.8；采样=24fps 180° EI800；WB=5600K；主光=窗光5600K 方位角90° 仰角45°；补光=墙反射5600K；K:F=2:1；影调=Rec.709 白位90IRE';
const fastPrompt = (label, declarations, sounds) => `${label}
【基础设定】
人物：甲和乙在场。
场景：夜，内，书房。
道具：灯与金项链。
音色：甲，青年声线；乙，成年声线；系统，电子声。
限制：禁止字幕、水印、Logo和无意义UI；无需背景音乐。
【整体视听】
画幅与风格：9:16，真人电影集。
光影基调：${baseline}
节奏与环境声：正常节奏，室内风声。
【连续台词】
${declarations}
【画面内容】
${sounds.map((sound, index) => `分镜${String(index + 1).padStart(2, '0')}｜比重约${100 / sounds.length}%
景别：手部特写。
机位：侧方拍摄。
运镜：固定观察。
表演与动作：甲把金项链放进包里。
光影：窗光落在甲的手背与金项链上。
声音：${sound}`).join('\n')}
【人物起止与运动轨迹】
甲：在桌旁 → 把金项链放进包里 → 仍在桌旁。
`;

const thirdOutput = fastPrompt('1-1-3', [
  'D01｜甲｜现场对白｜分镜01内说完：『我搜到项链了。』',
  'D02｜系统｜内心VO｜分镜01内说完：『任务完成。』',
].join('\n'), ['D01在画外讲述；衣料轻响。', 'D02系统VO在画外响起；环境声。']);

function fixture() {
  const source = '1-1 景：书房 夜 内\n甲：先把灯关了。\n乙：已经关好了。\n甲OS：我搜到项链了。\n△甲把金项链放进包里。\n系统 VO：任务完成。';
  const episode = { id: 'episode', title: '第1集', kind: 'episode', content: source };
  const project = { id: 'project', style: '真人电影集', aspectRatio: '9:16', episodes: [episode] };
  const skill = { id: 'skill', name: 'fixture', content: `${fastPrompt('1-1-1', 'D01｜甲｜现场对白｜分镜01内说完：『先把灯关了。』', ['D01说完。'])}\n同场光影基调逐字复用。` };
  const profile = { id: 'profile', model: 'mock' };
  const request = { accountId: 'account', project, episode, inputText: source, sceneLabel: '1-1', skill, profile, maxDurationSeconds: 30 };
  const records = new Map(), calls = [], commits = [], progress = [];
  const candidate = { segments: [
    { end: { unitId: 'u1' }, timing: { speechSeconds: 30, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: '灯亮', endState: '灯灭', boundary: '切乙', visualNotes: [] },
    { end: { unitId: 'u2' }, timing: { speechSeconds: 30, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: '灯灭', endState: '灯保持熄灭', boundary: '切手部', visualNotes: [] },
    { end: { unitId: 'u5' }, timing: { speechSeconds: 10, actionSeconds: 2, overlapSeconds: 2, transitionSeconds: 0 }, startState: '甲拿着项链', endState: '项链已入包', boundary: 'scene-end', visualNotes: [] },
  ] };
  const controller = createQuickGenerationController({
    maxQualityAttempts: 1,
    getContext: () => ({ ...request, permissions: { canGenerate: true } }),
    checkpoints: {
      save: async ({ run }) => records.set(run.id, structuredClone(run)),
      list: async () => [...records.values()].map(run => structuredClone(run)),
      load: async ({ runId }) => structuredClone(records.get(runId)),
    },
    executeText: async ({ messages }) => {
      const audit = messages[0].content.includes('核对'); calls.push(audit ? 'audit' : 'plan');
      return JSON.stringify(audit ? { ok: true, issues: [] } : candidate);
    },
    executeSkill: async ({ expectedLabels }) => {
      calls.push('whole-scene');
      return { output: expectedLabels.map(label => label === '1-1-3' ? thirdOutput : fastPrompt(label, label === '1-1-1'
        ? 'D01｜甲｜现场对白｜分镜01内说完：『先把灯关了。』'
        : 'D01｜乙｜现场对白｜分镜01内说完：『已经关好了。』', ['D01开始并结束。'])).join('\n\n') };
    },
    commitProgress: async run => { progress.push(structuredClone(run)); return { applied: true }; },
    commitRun: async run => { commits.push(structuredClone(run)); return { applied: true }; },
  });
  return { controller, records, calls, commits, progress, request };
}

test('all three clips finish and publish when the third has mixed OS and sound-range formatting failures', async () => {
  const f = fixture();
  const run = await f.controller.start(f.request);
  assert.equal(run.phase, 'completed', JSON.stringify(run.errors));
  assert.deepEqual(f.calls, ['plan', 'whole-scene', 'audit']);
  assert.equal(f.progress.length, 3);
  assert.equal(f.commits.length, 1);
  assert.equal(run.processingVersion, 8);
  const third = run.segmentDrafts[run.plan.segments[2].id];
  assert.equal(third.validated, true);
  assert.deepEqual(third.localRepairs, ['DIALOGUE_MODE_CHANGED', 'MISSING_DIALOGUE_CONTINUATION']);
  assert.match(third.prompt.content, /D01｜甲｜内心VO/);
  assert.match(third.prompt.content, /D02｜系统｜场外声音｜分镜02开始并在分镜02结束/);
  assert.match(third.prompt.content, /表演与动作：甲把金项链放进包里。/);
});

test('version 3 failed paid third clip is repaired on resume without generating any accepted clip again', async () => {
  const before = fixture();
  const complete = await before.controller.start(before.request);
  const legacy = structuredClone(complete);
  const thirdId = legacy.plan.segments[2].id;
  legacy.processingVersion = 3;
  legacy.phase = 'needs-review';
  legacy.checks = { audited: false, ranges: {} };
  legacy.segmentDrafts[thirdId].prompt.content = thirdOutput;
  legacy.segmentDrafts[thirdId].validated = false;
  legacy.segmentDrafts[thirdId].issues = [{ code: 'DIALOGUE_MODE_CHANGED' }, { code: 'MISSING_DIALOGUE_CONTINUATION' }];
  legacy.segmentQualityFailures[thirdId] = 3;
  const restored = fixture();
  restored.records.set(legacy.id, legacy);
  await restored.controller.restore();
  const done = await restored.controller.resume(legacy.id);
  assert.equal(done.phase, 'completed', JSON.stringify(done.errors));
  assert.deepEqual(restored.calls, ['audit']);
  assert.deepEqual(done.promptIds, complete.promptIds);
  assert.equal(Object.values(done.segmentDrafts).filter(draft => draft.validated).length, 3);
  assert.equal(restored.progress.length, 1);
  assert.equal(restored.commits.length, 1);
});

test('same-version rejected paid draft repairs shot percentages locally without resetting its plan or billing another Skill request', async () => {
  const before = fixture();
  const complete = await before.controller.start(before.request);
  const saved = structuredClone(complete);
  const thirdId = saved.plan.segments[2].id;
  saved.phase = 'needs-review';
  saved.checks = { audited: false, ranges: {} };
  saved.segmentDrafts[thirdId].prompt.content = thirdOutput.replaceAll('比重约50%', '比重约45%');
  saved.segmentDrafts[thirdId].validated = false;
  saved.segmentDrafts[thirdId].issues = [{ code: 'INVALID_SHOT_WEIGHTS' }, { code: 'DIALOGUE_MODE_CHANGED' }, { code: 'MISSING_DIALOGUE_CONTINUATION' }];
  saved.segmentQualityFailures[thirdId] = 3;
  const restored = fixture();
  restored.records.set(saved.id, saved);
  await restored.controller.restore();
  const done = await restored.controller.resume(saved.id);
  assert.equal(done.phase, 'completed', JSON.stringify(done.errors));
  assert.equal(done.processingVersion, 8);
  assert.deepEqual(restored.calls, ['audit']);
  assert.deepEqual(done.plan, complete.plan);
  assert.deepEqual(done.promptIds, complete.promptIds);
  assert.equal(Object.values(done.segmentDrafts).filter(draft => draft.validated).length, 3);
  assert.ok(done.segmentDrafts[thirdId].localRepairs.includes('INVALID_SHOT_WEIGHTS'));
  assert.equal(restored.progress.length, 1);
});

test('parser upgrade recovers an earlier complete paid response when the last repair corrupted dialogue', async () => {
  const before = fixture(), complete = await before.controller.start(before.request);
  const saved = structuredClone(complete), thirdId = saved.plan.segments[2].id;
  saved.processingVersion = 7;
  saved.phase = 'needs-review'; saved.checks = { audited: false, ranges: {} };
  saved.segmentDrafts[thirdId].prompt.content = saved.segmentDrafts[thirdId].prompt.content.replace('我搜到项链了。', '我拿到钱了。');
  saved.segmentDrafts[thirdId].validated = false;
  saved.segmentDrafts[thirdId].issues = [{ code: 'DIALOGUE_TEXT_CHANGED' }];
  saved.wholeSceneIssues = [{ code: 'DIALOGUE_TEXT_CHANGED' }];
  saved.wholeSceneResponses.push({output:complete.segmentDrafts[complete.plan.segments[0].id].prompt.content,complete:true,planId:saved.plan.id,requestGroupId:'later-incomplete-repair'});
  saved.processedWholeSceneResponseIndex=saved.wholeSceneResponses.length-1;
  const restored = fixture(); restored.records.set(saved.id, saved);
  await restored.controller.restore(); const done = await restored.controller.resume(saved.id);
  assert.equal(done.phase, 'completed', JSON.stringify(done.errors));
  assert.deepEqual(restored.calls, ['audit']);
  assert.deepEqual(done.promptIds, complete.promptIds);
  assert.equal(done.segmentDrafts[thirdId].prompt.content, complete.segmentDrafts[thirdId].prompt.content);
});
