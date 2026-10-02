import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneSourceTape, validateScenePlan } from './directorSegmentation.js';
import { buildSegmentationMessages, buildSegmentSkillRequest, buildSceneAuditMessages } from './directorSegmentationMessages.js';
import { executeSkillWithAi } from './skillExecution.js';

const tape = buildSceneSourceTape('1-1 景：书房 夜 内\n甲：灯已经关了。\n乙：我听见了。');
const snapshot = { sceneLabel: '1-1', style: '真人电影集', aspectRatio: '9:16', maxDurationSeconds: 30, settingText: '甲乙都在书房；灯是旧台灯。' };
const plan = { ...validateScenePlan({ segments: tape.units.map((unit, index) => ({ end: { unitId: unit.id }, timing: { speechSeconds: index ? 10 : 30, actionSeconds: 0, overlapSeconds: 0, transitionSeconds: 0 }, startState: { lamp: index ? 'off' : 'on' }, endState: { lamp: 'off' }, boundary: { type: 'speaker-change' }, visualNotes: [] })) }, { tape, maxDurationSeconds: 30 }).plan, sceneLabel: '1-1' };

test('planning reads project settings, duration, full source and complete indexed anchors', () => {
  const messages = buildSegmentationMessages({ snapshot, tape });
  assert.match(messages[0].content, /分段/);
  const full = messages.map(message => message.content).join('\n');
  for (const text of ['真人电影集', '9:16', '30', '甲乙都在书房', '灯已经关了', '我听见了', 'u1', 'u2', '0.85', 'overlapSeconds']) assert.ok(full.includes(text), text);
  for (const text of ['speechCharacterCount', '4字/秒', '3字/秒', '2～3秒', '10～13', '短', '10秒', '30+10', '不能把每个动词都串行']) assert.ok(full.includes(text), text);
  const repair = buildSegmentationMessages({ snapshot, tape, validationIssues: [{ code: 'DURATION_EXCEEDED', segmentIndex: 1, message: '超时' }] });
  assert.match(repair.at(-1).content, /DURATION_EXCEEDED/);
});

test('single Skill submission has one current bracket; reference holds whole scene and previous fixed lighting', async () => {
  const request = buildSegmentSkillRequest({ snapshot, tape, plan, segment: plan.segments[1], sharedBaseline: 'EI800；灯源基准', previousPrompt: { label: '1-1-1', content: '前条完整正文\n甲关灯，灯已熄灭。' } });
  assert.deepEqual(request.input.match(/^[（(]\d+[）)]$/gm), ['（2）']);
  assert.match(request.input, /1-1-2/);
  assert.match(request.input, /建议生成时长[：:]\s*10/);
  assert.match(request.input, /乙：我听见了/);
  const reference = request.beforeUserMessages.map(message => message.content).join('\n');
  for (const text of ['只读', '甲：灯已经关了', '前条完整正文', 'EI800', 'off']) assert.ok(reference.includes(text), text);
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
