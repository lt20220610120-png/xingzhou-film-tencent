import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneSourceTape, validateScenePlan } from './directorSegmentation.js';
import { buildSegmentationMessages, buildWholeSceneSkillRequest, buildSceneAuditMessages } from './directorSegmentationMessages.js';
import { executeSkillWithAi } from './skillExecution.js';
import { buildWholeSceneSubmission } from './directorCreative.js';

const tape = buildSceneSourceTape('1-1 景：书房 夜 内\n甲：灯已经关了。\n乙：我听见了。');
const snapshot = { sceneLabel: '1-1', style: '真人电影集', aspectRatio: '9:16', maxDurationSeconds: 30, settingText: '甲乙都在书房；灯是旧台灯。' };
const plan = { ...validateScenePlan({ segments: tape.units.map((unit, index) => ({ end: { unitId: unit.id }, timing: { speechSeconds: index ? 10 : 30, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: { lamp: index ? 'off' : 'on' }, endState: { lamp: 'off' }, boundary: { type: 'speaker-change' }, visualNotes: [] })) }, { tape, maxDurationSeconds: 30 }).plan, sceneLabel: '1-1' };

test('planning reads project settings, duration, full source and complete indexed anchors', () => {
  const messages = buildSegmentationMessages({ snapshot, tape });
  assert.match(messages[0].content, /分段/);
  const full = messages.map(message => message.content).join('\n');
  for (const text of ['真人电影级', '9:16', '30', '甲乙都在书房', '灯已经关了', '我听见了', 'u1', 'u2', '0.85', 'overlapSeconds']) assert.ok(full.includes(text), text);
  for (const text of ['speechCharacterCount', '4字/秒', '3字/秒', '2～3秒', '10～13', '短', '10秒', '30+10', '不能把每个动词都串行']) assert.ok(full.includes(text), text);
  const repair = buildSegmentationMessages({ snapshot, tape, validationIssues: [{ code: 'DURATION_EXCEEDED', segmentIndex: 1, message: '超时' }] });
  assert.match(repair.at(-1).content, /DURATION_EXCEEDED/);
});

test('planning and its repair contract prioritize complete turns and only split an overlong turn at sentence endings', () => {
  const messages = buildSegmentationMessages({ snapshot: { ...snapshot, maxDurationSeconds: 15 }, tape, validationIssues: [{ code: 'INCOMPLETE_DIALOGUE_BOUNDARY', message: '当前计划截断短讲话' }] });
  const full = messages.map(message => message.content).join('\n');
  for (const text of ['完整讲话优先于填满视频', '必须整段保留', '整体移至下一条', '只有一次讲话本身超过最高时长', '已有完整句号', '不在逗号', '不可被切开', 'naturalEstimatedSeconds', 'durationCompression']) assert.ok(full.includes(text), text);
  assert.match(messages.at(-1).content, /禁止移入半句/);
  assert.match(messages.at(-1).content, /允许前条不足85%/);
  assert.ok(!full.includes('长独白可在语义/词语边界拆原话'));
  assert.ok(!full.includes('下一小节的前半内容移入前条'));
  assert.ok(!full.includes('切在 Unicode 与词语边界'));
});

test('whole-scene Skill receives every bracket and complete attachments with fixed baseline and preserved paid content', async () => {
  const indexedPlan = { ...plan, segments: plan.segments.map((segment, index) => ({ ...segment, id: `segment-${index + 1}` })) };
  const firstContent = '前条完整正文\n甲关灯，灯已熄灭。';
  const request = buildWholeSceneSkillRequest({ snapshot, tape, plan: indexedPlan, sharedBaseline: 'EI800；灯源基准', drafts: { 'segment-1': { validated: true, prompt: { label: '1-1-1', content: firstContent } } }, validationIssues: [{ code: 'MISSING_SCENE_PROMPT' }], repairAttempt: 1 });
  assert.deepEqual(request.input.match(/^[（(]\d+[）)]$/gm), ['（1）', '（2）']);
  assert.deepEqual(request.expectedLabels, ['1-1-1', '1-1-2']);
  assert.deepEqual(request.preservedPrompts, [{ label: '1-1-1', content: firstContent }]);
  assert.equal(request.repairAttempt, 1);
  assert.match(request.input, /甲：灯已经关了/);
  assert.match(request.input, /乙：我听见了/);
  const reference = request.beforeUserMessages.map(message => message.content).join('\n');
  for (const text of ['只读', '前条完整正文', 'EI800', 'MISSING_SCENE_PROMPT', '原样保留']) assert.ok(reference.includes(text), text);
  for (const text of ['整场', '一次输出全部', '"recommendedDurationSeconds":10']) assert.ok(request.input.includes(text), text);
  for (const text of ['originalDialogues', 'startState', 'endState', 'visualNotes', 'segments', 'capacityIssue']) assert.ok(!request.input.includes(text) && !reference.includes(text), text);
  assert.ok(!reference.includes('只输出下一条'));
  assert.equal(request.maxOutputTokens, 16384);
  const skill = { id: 's', name: 'name-with-v8', content: '主文件完整内容', files: Array.from({ length: 5 }, (_, index) => ({ path: `references/${index}.md`, content: `FILE-${index}-FULL` })) };
  let captured;
  await executeSkillWithAi({ api: { aiChat: async args => { captured = args; return '完成'; } }, state: { skills: [skill], apiProfiles: [{ id: 'p', model: 'chosen' }] }, skillId: 's', ...request });
  for (let index = 0; index < 5; index += 1) assert.match(captured.messages[1].content, new RegExp(`FILE-${index}-FULL`));
  assert.equal(captured.messages.at(-1).content, request.input);
});

test('audit explicitly scopes adjacent range and requests verifiable source evidence', () => {
  const messages = buildSceneAuditMessages({ snapshot, tape, plan, prompts: [{ label: '1-1-1', content: '前条关灯' }, { label: '1-1-2', content: '后条灯亮了' }], range: [1, 2] });
  assert.match(messages[0].content, /核对/);
  const text = messages.map(message => message.content).join('\n');
  for (const needle of ['segmentIndex', 'sourceQuote', '灯亮了', '灯已经关了', '光源', '状态']) assert.ok(text.includes(needle), needle);
  assert.throws(() => buildSceneAuditMessages({ snapshot, tape, plan, prompts: [], range: [3] }), /范围/);
});

test('partial audit window does not repeatedly send distant entire scene or output', () => {
  const longTape = buildSceneSourceTape('甲：第一段。\n乙：第二段。\n甲：远端不应重复的原话。');
  const longPlan = { segments: longTape.units.map((unit, index) => ({ index: index + 1, sourceStart: unit.start, sourceEnd: unit.end })) };
  const messages = buildSceneAuditMessages({ snapshot, tape: longTape, plan: longPlan, prompts: [{ label: '1-1-1', content: '第一条' }, { label: '1-1-2', content: '第二条' }, { label: '1-1-3', content: '第三条远端' }], range: [1, 2] });
  const input = messages.at(-1).content;
  assert.ok(!input.includes('远端不应重复'));
  assert.ok(!input.includes('第三条远端'));
  assert.ok(input.includes('第一段'));
  assert.ok(input.includes('第二段'));
});

test('Skill reads exact original voices directly; parser tables remain exclusive to verification', () => {
  const source = '1-1 景：书房 夜 内\n人：系统、甲\n系统 VO：发现目标。主线任务：找到钥匙。完成奖励：声望三百，属性点零点五。\n甲 OS：先开门。';
  const scene = buildSceneSourceTape(source);
  const segment = { id: 'segment', index: 1, sourceStart: 0, sourceEnd: scene.sourceText.length, recommendedDurationSeconds: 30 };
  const currentPlan = { segments: [segment] };
  const request = buildWholeSceneSkillRequest({ snapshot, tape: scene, plan: currentPlan });
  const table = [
    { speaker: '系统', mode: '场外声音', speech: '发现目标。主线任务：找到钥匙。完成奖励：声望三百，属性点零点五。' },
    { speaker: '甲', mode: '内心VO', speech: '先开门。' },
  ];
  assert.equal(request.beforeUserMessages.length, 0);
  assert.ok(request.input.includes(scene.sourceText));
  assert.ok(!request.input.includes('originalDialogues'));
  assert.ok(!/^[（(]\d+[）)]$/m.test(request.input), 'single short scene uses the same unmarked submission as manual mode');
  const audit = buildSceneAuditMessages({ snapshot, tape: scene, plan: currentPlan, prompts: [{ label: '1-1-1', content: '正文' }] });
  assert.ok(audit.at(-1).content.includes(JSON.stringify(table)));
});

test('a compressed whole scene preserves natural timing while Skill and audit use the 30-second video target', () => {
  const segment = { ...plan.segments[0], sourceStart: 0, sourceEnd: tape.sourceText.length, recommendedDurationSeconds: 30, naturalEstimatedSeconds: 33,
    durationCompression: { version: 1, kind: 'whole-scene-30-second-fast-pace', targetDurationSeconds: 30, naturalEstimatedSeconds: 33, paceFactor: 1.1 } };
  const compressedPlan = { segments: [segment] };
  const request = buildWholeSceneSkillRequest({ snapshot, tape, plan: compressedPlan });
  const reference = request.input;
  assert.match(reference, /"naturalEstimatedSeconds":33/);
  assert.match(reference, /"targetDurationSeconds":30/);
  assert.match(reference, /保留所有台词/);
  const audit = buildSceneAuditMessages({ snapshot, tape, plan: compressedPlan, prompts: [{ label: '1-1-1', content: '正文' }] });
  assert.match(audit.at(-1).content, /不能仅因自然估时大于30秒判失败/);
  assert.ok(audit.at(-1).content.includes('"naturalEstimatedSeconds":33'));
});

test('auto numbered submission matches manual generation input apart from its duration recommendation', () => {
  const numbered = `${tape.sceneHeader}\n（1）\n${tape.sourceText.slice(plan.segments[0].sourceStart, plan.segments[0].sourceEnd).trim()}\n\n（2）\n${tape.sourceText.slice(plan.segments[1].sourceStart, plan.segments[1].sourceEnd).trim()}`;
  const request = buildWholeSceneSkillRequest({ snapshot: { ...snapshot, settingText: '' }, tape, plan });
  const manualInput = buildWholeSceneSubmission({ sourceText: numbered, expectedLabels: request.expectedLabels });
  assert.ok(request.input.includes(manualInput), 'both routes give the Skill identical complete numbered scene and submission instructions');
});

test('whole-scene output budget matches the provider ceiling without trimming source or Skill attachments', () => {
  const largePlan = { segments: Array.from({ length: 12 }, (_, index) => ({ ...plan.segments[index % 2], id: `s-${index}`, index: index + 1 })) };
  const request = buildWholeSceneSkillRequest({ snapshot, tape, plan: largePlan });
  assert.equal(request.maxOutputTokens, 32768);
  assert.equal(request.expectedLabels.length, 12);
  assert.deepEqual(request.input.match(/^[（(]\d+[）)]$/gm), Array.from({ length: 12 }, (_, index) => `（${index + 1}）`));
});
