import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyPromptContract, validateGeneratedSegment, parseSceneAudit } from './directorPromptValidation.js';

const baseline = '影像基准=数字电影；镜组=35mm T2.8；采样=24fps 180° EI800；WB=5600K；主光=窗光5600K 方位角90° 仰角45°；补光=墙反射5600K；K:F=2:1；影调=Rec.709 白位90IRE';
const prompt = ({ label = '1-1-1', speech = '我来关灯。', speaker = '甲', light = baseline, sound = '甲的D01开始并结束。', camera = '侧方拍摄。' } = {}) => `${label}
【基础设定】
人物：甲和乙在场，甲持灯绳，乙坐在书桌旁。
场景：夜，内，书房。
道具：旧台灯一盏，起点亮。
音色：甲，青年声线。
限制：禁止字幕、水印、Logo和无意义UI；无需背景音乐。
【整体视听】
画幅与风格：9:16，真人电影集。
光影基调：${light}
光源事件：甲关灯，终态灯灭。
节奏与环境声：正常节奏，室内风声。
【连续台词】
${speech ? `D01｜${speaker}｜现场对白｜分镜01开始并在分镜01结束：『${speech}』` : '无'}
【画面内容】
分镜01｜比重约100%
景别：甲手部特写。
机位：${camera}
运镜：固定观察。
表演与动作：甲关灯。
光影：窗外街灯照在甲的手背，台灯熄灭后阴影加深。
声音：${speech ? sound : '关灯开关声。'}
【人物起止与运动轨迹】
甲：手持灯绳 → 分镜01关灯 → 手放下，灯灭。
乙：坐在书桌旁 → 分镜01听甲说话 → 仍坐着。
`;

test('contract detection uses content structure, never a mutable Skill name', () => {
  const content = ['【基础设定】', '【整体视听】', '【连续台词】', '【画面内容】', '【人物起止与运动轨迹】', '景别：机位：运镜：表演与动作：光影：声音：', '光影基调同场逐字复用。D01'].join('\n');
  assert.equal(identifyPromptContract({ name: 'renamed', content }), 'fast-v8');
  assert.equal(identifyPromptContract({ name: 'video-prompt-fast-v8-2', content: '把文本变为另一种格式' }), 'generic');
  assert.equal(identifyPromptContract({ content: '主规则', files: [{ path: 'rules.md', content }] }), 'fast-v8');
});

test('one exact output is accepted, arbitrary analysis/multiple/wrong identifiers rejected', () => {
  const args = { expectedLabel: '1-1-1', source: '甲：我来关灯。', contract: 'fast-v8' };
  assert.equal(validateGeneratedSegment({ ...args, output: prompt() }).ok, true);
  for (const output of ['', '我先分析这个场景，然后再写提示词。', `分析：需要关灯。\n${prompt()}`, `${prompt()}\n${prompt({ label: '1-1-2' })}`, prompt({ label: '2-1-1' }), '1-1-1\n分析：这段适合近景。']) assert.equal(validateGeneratedSegment({ ...args, output }).ok, false, output.slice(0, 50));
});

test('legacy one bracket uniquely maps current prompt; generic support remains explicit', () => {
  const result = validateGeneratedSegment({ output: '（2）\n夜间甲收回手，乙侧过脸。', expectedLabel: '1-1-2', source: '乙侧过脸。', contract: 'generic' });
  assert.equal(result.ok, true);
  assert.equal(result.prompt.label, '1-1-2');
  assert.equal(result.capabilities.dialogue, 'semantic-audit');
  assert.equal(validateGeneratedSegment({ output: '（1）\n有正文', expectedLabel: '1-1-2', source: '正文', contract: 'generic' }).ok, false);
  assert.equal(validateGeneratedSegment({ output: '1-1-1', expectedLabel: '1-1-1', source: '正文', contract: 'generic' }).ok, false);
});

test('five ordered blocks, six nonempty shot rows and weights are validated', () => {
  const args = { expectedLabel: '1-1-1', source: '甲：我来关灯。', contract: 'fast-v8' };
  for (const output of [prompt().replace('【连续台词】', '【别的区块】'), prompt().replace('光影：窗外街灯照在甲的手背，台灯熄灭后阴影加深。', ''), prompt().replace('比重约100%', '比重约50%'), prompt().replace('景别：甲手部特写。', '景别：甲手部特写。\n景别：甲脸部特写。'), prompt().replace('【基础设定】', '先考虑一下人物。\n【基础设定】'), prompt({ camera: '侧方拍摄。\n为了同时看清乙。' })]) assert.equal(validateGeneratedSegment({ ...args, output }).ok, false);
});

test('baseline is shared except whitespace; source events are not mistaken for baseline changes', () => {
  const args = { expectedLabel: '1-1-1', source: '甲：我来关灯。', contract: 'fast-v8', sharedBaseline: baseline };
  assert.equal(validateGeneratedSegment({ ...args, output: prompt({ light: baseline.replaceAll('；', '； ') }) }).ok, true);
  const changed = validateGeneratedSegment({ ...args, output: prompt({ light: baseline.replace('EI800', 'EI1600') }) });
  assert.ok(changed.issues.some(issue => issue.code === 'BASELINE_CHANGED'));
  assert.equal(validateGeneratedSegment({ ...args, output: prompt() }).baseline, baseline);
});

test('dialogue words, order, speaker and duplicate declarations checked without treating repeated names as speech', () => {
  const args = { expectedLabel: '1-1-1', source: '甲：我来关灯。', contract: 'fast-v8' };
  for (const output of [prompt({ speech: '我去关灯。' }), prompt({ speech: '我来关灯。我来关灯。' }), prompt({ speaker: '乙' }), prompt({ speech: '' }), prompt().replace('【画面内容】', 'D02｜甲｜现场对白｜分镜01开始并结束：『我来关灯。』\n【画面内容】')]) assert.equal(validateGeneratedSegment({ ...args, output }).ok, false);
  assert.equal(validateGeneratedSegment({ ...args, output: prompt().replace('人物：甲和乙在场', '人物：甲、甲和乙在场') }).ok, true);
});

test('dialogue extraction handles inline speaker and source VO mode', () => {
  const inline = validateGeneratedSegment({ output: prompt(), expectedLabel: '1-1-1', source: '反打镜头，甲（低声）：我来关灯。', contract: 'fast-v8' });
  assert.equal(inline.ok, true, JSON.stringify(inline.issues));
  const wrongVoice = validateGeneratedSegment({ output: prompt(), expectedLabel: '1-1-1', source: '甲（V.O.）：我来关灯。', contract: 'fast-v8' });
  assert.ok(wrongVoice.issues.some(issue => issue.code === 'DIALOGUE_MODE_CHANGED'));
});

test('long speech suffix cannot repeat or fill in words assigned to the preceding segment', () => {
  const args = { expectedLabel: '1-1-1', source: '然后说明结果。', contract: 'fast-v8' };
  assert.equal(validateGeneratedSegment({ ...args, output: prompt({ speech: '然后说明结果。' }) }).ok, true);
  for (const speech of ['先说明原因，然后说明结果。', '然后说明结果。然后说明结果。', '然后说明。']) {
    const result = validateGeneratedSegment({ ...args, output: prompt({ speech }) });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some(issue => issue.code === 'DIALOGUE_OUTSIDE_SOURCE'));
  }
});

test('colon inside original speech is kept as dialogue rather than misread as another speaker', () => {
  for (const speech of ['我告诉你，答案：不。', '他说：“乙：不好。”然后就走了。', '听好了：不要再开灯。']) {
    const result = validateGeneratedSegment({ expectedLabel: '1-1-1', source: `甲：${speech}`, contract: 'fast-v8', output: prompt({ speech }) });
    assert.equal(result.ok, true, JSON.stringify(result.issues));
  }
});

test('audit accepts explicit no issues and rejects malformed conclusions/references/evidence', () => {
  const sourceText = '甲关灯。\n乙在黑暗中回应。';
  const plan = { sourceText, segments: [{ index: 1, sourceStart: 0, sourceEnd: 6 }, { index: 2, sourceStart: 6, sourceEnd: sourceText.length }] };
  assert.deepEqual(parseSceneAudit('```json\n{"ok":true,"issues":[]}\n```', { plan, range: [1, 2] }), { ok: true, issues: [] });
  const genuine = parseSceneAudit({ ok: false, issues: [{ code: 'LIGHT_RESET', segmentIndex: 2, message: '后条把熄灭的灯重新开启', evidence: { sourceQuote: '黑暗中', promptQuote: '台灯亮着' } }] }, { plan, range: [1, 2] });
  assert.equal(genuine.ok, false);
  assert.equal(genuine.issues[0].code, 'LIGHT_RESET');
  for (const output of ['', '{"ok":true,', { issues: [] }, { ok: false, issues: [] }, { ok: true, issues: [{ code: 'X', segmentIndex: 2, message: '问题', evidence: '黑暗中' }] }, { ok: false, issues: [{ code: 'X', segmentIndex: 3, message: '问题', evidence: '黑暗中' }] }, { ok: false, issues: [{ code: 'X', segmentIndex: 2, message: '问题', evidence: '不存在的原文' }] }]) {
    const result = parseSceneAudit(output, { plan, range: [1, 2] });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some(issue => issue.code.startsWith('INVALID_AUDIT')));
  }
});
