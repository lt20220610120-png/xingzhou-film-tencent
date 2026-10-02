import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyPromptContract, validateGeneratedSegment, validateAndRepairGeneratedSegment, repairGeneratedDialogueModes, repairGeneratedDialogueContinuations, repairGeneratedShotWeights, parseSceneAudit, splitWholeScenePromptOutput } from './directorPromptValidation.js';

const baseline = '影像基准=数字电影；镜组=35mm T2.8；采样=24fps 180° EI800；WB=5600K；主光=窗光5600K 方位角90° 仰角45°；补光=墙反射5600K；K:F=2:1；影调=Rec.709 白位90IRE';

test('whole-scene splitter maps exact canonical and legacy bracket IDs without renumbering an invalid reply', () => {
  const expectedLabels = ['2-1-1', '2-1-2'];
  const canonical = splitWholeScenePromptOutput({ output: '```text\n## 2-1-1\n第一条。\n\n**2-1-2**\n第二条。\n```', expectedLabels });
  assert.deepEqual(canonical.issues, []);
  assert.deepEqual(canonical.prompts.map(item => item.label), expectedLabels);
  assert.match(canonical.prompts[1].content, /第二条/);
  const brackets = splitWholeScenePromptOutput({ output: '（1）\n第一条。\n（2）\n第二条。', expectedLabels });
  assert.deepEqual(brackets.issues, []);
  assert.deepEqual(brackets.prompts.map(item => item.label), expectedLabels);
  for (const output of ['2-1-1\n第一条。\n2-1-3\n错误第三条。', '（1）\n第一条。\n（3）\n错误第三条。']) {
    const invalid = splitWholeScenePromptOutput({ output, expectedLabels });
    assert.deepEqual(invalid.prompts.map(item => item.label), ['2-1-1']);
    assert.ok(invalid.issues.some(item => item.code === 'MISSING_SCENE_PROMPT'));
    assert.ok(invalid.issues.some(item => item.code === 'INVALID_SCENE_LABEL'));
  }
});

test('whole-scene duplicate and reversed IDs fail even when the detected item count matches', () => {
  const expectedLabels = ['2-1-1', '2-1-2'];
  const duplicate = splitWholeScenePromptOutput({ output: '2-1-1\n第一条。\n2-1-1\n重复条。', expectedLabels });
  assert.deepEqual(duplicate.prompts, []);
  assert.ok(duplicate.issues.some(item => item.code === 'INVALID_SCENE_LABEL'));
  assert.ok(duplicate.issues.some(item => item.code === 'MISSING_SCENE_PROMPT'));
  const reversed = splitWholeScenePromptOutput({ output: '2-1-2\n第二条。\n2-1-1\n第一条。', expectedLabels });
  assert.ok(reversed.issues.some(item => item.code === 'INVALID_SCENE_ORDER'));
  assert.deepEqual(reversed.prompts.map(item => item.label), ['2-1-2', '2-1-1']);
});

test('truncated whole-scene output only exposes prior complete blocks, never its last unfinished block', () => {
  const result = splitWholeScenePromptOutput({ output: '2-1-1\n第一条完整内容。\n2-1-2\n【基础设定】\n人物：', expectedLabels: ['2-1-1', '2-1-2'], complete: false });
  assert.deepEqual(result.prompts, [{ label: '2-1-1', content: '2-1-1\n第一条完整内容。' }]);
  assert.ok(result.issues.some(item => item.code === 'TRUNCATED_SCENE_OUTPUT'));
  const empty = splitWholeScenePromptOutput({ output: '', expectedLabels: ['2-1-1'] });
  assert.deepEqual(empty.prompts, []);
  assert.equal(empty.issues[0].code, 'EMPTY_SCENE_OUTPUT');
});
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

test('system mission and reward headings are literal audible dialogue, not fictitious actor labels', () => {
  const speech = '发现魔教头目马库斯。主线任务：七日内拔除魔窟。完成奖励：声望三百，属性点零点五。';
  const args = { expectedLabel: '1-1-1', source: `人：魏今朝、系统\n系统 VO：${speech}`, contract: 'fast-v8' };
  const output = prompt({ speaker: '系统', speech }).replace('｜现场对白｜', '｜场外声音｜');
  const checked = validateAndRepairGeneratedSegment({ ...args, output });
  assert.equal(checked.ok, true, JSON.stringify(checked.issues));
  assert.deepEqual(checked.repairs, []);
  assert.equal(checked.output, output);
  for (const changed of [
    output.replace('主线任务：', ''),
    output.replace('完成奖励：', ''),
    output.replace('声望三百，属性点零点五', '声望300，属性点0.5'),
    output.replace('七日内拔除魔窟。', '七日内拔除魔窟。七日内拔除魔窟。'),
    output.replace('｜系统｜', '｜魏今朝｜'),
  ]) {
    const rejected = validateAndRepairGeneratedSegment({ ...args, output: changed });
    assert.equal(rejected.ok, false);
    assert.ok(rejected.issues.some(issue => ['DIALOGUE_TEXT_CHANGED', 'DIALOGUE_SPEAKER_CHANGED'].includes(issue.code)));
  }
});

test('scene metadata is not counted as dialogue and attached OS keeps the actor identity', () => {
  const args = { expectedLabel: '1-1-1', contract: 'fast-v8' };
  assert.equal(validateGeneratedSegment({ ...args, source: '1-1 景：书房 夜 内\n人：甲、乙\n△甲伸手。\n甲：我来关灯。', output: prompt() }).ok, true);
  const output = prompt().replace('｜现场对白｜', '｜内心VO｜');
  assert.equal(validateGeneratedSegment({ ...args, source: '甲OS（犹豫）：我来关灯。', output }).ok, true);
});

test('multiline speech and legal wrappers remain exact while real omissions are rejected', () => {
  const args = { expectedLabel: '1-1-1', contract: 'fast-v8', source: '甲：我来\n\n关灯。' };
  assert.equal(validateGeneratedSegment({ ...args, output: prompt() }).ok, true);
  assert.equal(validateGeneratedSegment({ ...args, output: prompt({ speech: '我来' }) }).ok, false);
  assert.equal(validateGeneratedSegment({ ...args, source: '甲：我来关灯。', output: prompt().replace('『我来关灯。』', '“我来关灯。”') }).ok, true);
});

test('range validation inherits voice and actor after an automatic cut in a long speech', () => {
  const sourceText = '甲OS：先说原因，然后说明结果。\n△甲合上书。';
  const sourceStart = sourceText.indexOf('然后');
  const sourceEnd = sourceText.indexOf('\n△');
  const args = { expectedLabel: '1-1-1', contract: 'fast-v8', source: { sourceText, sourceStart, sourceEnd, text: sourceText.slice(sourceStart, sourceEnd) } };
  const valid = prompt({ speech: '然后说明结果。' }).replace('｜现场对白｜', '｜内心 VO｜');
  assert.equal(validateGeneratedSegment({ ...args, output: valid }).ok, true);
  for (const output of [valid.replace('然后说明结果。', '说明结果。'), valid.replace('｜甲｜', '｜乙｜'), valid.replace('｜内心 VO｜', '｜现场对白｜')]) assert.equal(validateGeneratedSegment({ ...args, output }).ok, false);
});

test('dialogue declaration parser ignores quotation marks inside timing references', () => {
  const output = prompt({ speech: '很好。主动惩治恶徒同样能拿声望是吧？', speaker: '甲' })
    .replace('分镜01开始并在分镜01结束', '分镜01开始，在本段末尾停于“这哪是什么人间地狱，”处');
  const result = validateGeneratedSegment({ expectedLabel: '1-1-1', contract: 'fast-v8', source: '甲：很好。主动惩治恶徒同样能拿声望是吧？', output });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
});

test('outer dialogue quotes keep nested original quotes and ASCII wrappers intact',()=>{
  for(const [speech,open,close] of [['他说：“乙：你好。”然后离开。','“','”'],['先说原因，然后关灯。','"','"']]){
    const output=prompt({speech}).replace(`『${speech}』`,`${open}${speech}${close}`);
    const result=validateGeneratedSegment({expectedLabel:'1-1-1',contract:'fast-v8',source:`甲：${speech}`,output});
    assert.equal(result.ok,true,JSON.stringify(result.issues));
  }
});

test('missing sound continuation is restored from exact declared shot range without changing speech',()=>{
  const output=prompt({sound:'开关声。'});
  const repaired=repairGeneratedDialogueContinuations({output,source:'甲：我来关灯。'});
  assert.equal(validateGeneratedSegment({expectedLabel:'1-1-1',contract:'fast-v8',source:'甲：我来关灯。',output:repaired}).ok,true);
  assert.match(repaired,/D01开始并结束/);
  assert.equal(repairGeneratedDialogueContinuations({output,source:'乙：不同台词。'}),output);
});

test('continuation references written as cross-shot prose include every named shot', () => {
  const output = prompt().replace('分镜01开始并在分镜01结束', '分镜01开始，跨分镜02，在分镜02结束')
    .replace('分镜01｜比重约100%', '分镜01｜比重约50%')
    .replace('甲关灯。', '甲关灯。');
  // The compact fixture has only one shot, so the named second shot is
  // intentionally rejected as a missing shot rather than silently ignored.
  const result = validateGeneratedSegment({ expectedLabel:'1-1-1', source:'甲：我来关灯。', contract:'fast-v8', output });
  assert.ok(result.issues.some(issue => issue.code === 'INVALID_DIALOGUE_SHOT_REFERENCE'));
});

test('exact dialogue text can deterministically restore a changed OS/VO marker', () => {
  const output = prompt({ speech: '我来关灯。', speaker: '甲' });
  const repaired = repairGeneratedDialogueModes({ output, source: '甲OS：我来关灯。' });
  assert.equal(validateGeneratedSegment({ expectedLabel: '1-1-1', contract: 'fast-v8', source: '甲OS：我来关灯。', output: repaired }).ok, true);
});

const twoShotPrompt = ({ speech = '我来关灯。', declarations, firstSound = 'D01开始。', secondSound = '衣料轻响。' } = {}) => {
  const base = prompt({ speech });
  const pictureStart = base.indexOf('【画面内容】') + '【画面内容】'.length;
  const pictureEnd = base.indexOf('【人物起止与运动轨迹】');
  const shot = base.slice(pictureStart, pictureEnd).trim();
  const first = shot.replace('比重约100%', '比重约50%').replace(/^声音：.*$/mu, `声音：${firstSound}`);
  const second = shot.replace('分镜01', '分镜02').replace('比重约100%', '比重约50%').replace(/^声音：.*$/mu, `声音：${secondSound}`);
  return (base.slice(0, pictureStart) + `\n${first}\n${second}\n` + base.slice(pictureEnd))
    .replace(/【连续台词】\n[\s\S]*?(?=【画面内容】)/u, `【连续台词】\n${declarations || `D01｜甲｜现场对白｜分镜01开始并在分镜02结束：『${speech}』`}\n`);
};

test('mixed inner-voice and continuation formatting failures repair together while the action continues', () => {
  const source = '甲OS：我搜到项链了。\n△甲把金项链放进包里。';
  const output = twoShotPrompt({ speech: '我搜到项链了。' }).replaceAll('甲关灯。', '甲把金项链放进包里。');
  const args = { output, source, expectedLabel: '1-1-1', contract: 'fast-v8' };
  const initial = validateGeneratedSegment(args);
  assert.deepEqual(new Set(initial.issues.map(entry => entry.code)), new Set(['DIALOGUE_MODE_CHANGED', 'MISSING_DIALOGUE_CONTINUATION']));
  const repaired = validateAndRepairGeneratedSegment(args);
  assert.equal(repaired.ok, true, JSON.stringify(repaired.issues));
  assert.deepEqual(repaired.repairs, ['DIALOGUE_MODE_CHANGED', 'MISSING_DIALOGUE_CONTINUATION']);
  assert.match(repaired.output, /甲｜内心VO/);
  assert.match(repaired.output, /声音：衣料轻响。；D01继续并结束。/);
  assert.match(repaired.output, /表演与动作：甲把金项链放进包里。/);
});

test('a wrong declaration shot reconciles to the existing sound assignment without duplicating the voice', () => {
  const source = '甲OS：我来关灯。\n系统 VO：任务完成。';
  const output = twoShotPrompt({
    declarations: 'D01｜甲｜内心VO｜分镜01内说完：『我来关灯。』\nD02｜系统｜场外声音｜分镜01内说完：『任务完成。』',
    firstSound: 'D01内心VO说完；开关声。', secondSound: 'D02系统VO在画外响起；环境声。',
  });
  const checked = validateAndRepairGeneratedSegment({ output, source, expectedLabel: '1-1-1', contract: 'fast-v8' });
  assert.equal(checked.ok, true, JSON.stringify(checked.issues));
  assert.match(checked.output, /D02｜系统｜场外声音｜分镜02开始并在分镜02结束：『任务完成。』/);
  const soundRows = [...checked.output.matchAll(/^声音：([^\n]*)/gmu)].map(match => match[1]);
  assert.doesNotMatch(soundRows[0], /D02/);
  assert.match(soundRows[1], /D02/);
});

test('local formatting repairs never waive changed dialogue, speakers, or a different lighting baseline', () => {
  const source = '甲OS：我来关灯。';
  for (const output of [twoShotPrompt({ speech: '我去关灯。' }), twoShotPrompt().replace('D01｜甲｜', 'D01｜乙｜')]) {
    const checked = validateAndRepairGeneratedSegment({ output, source, expectedLabel: '1-1-1', contract: 'fast-v8' });
    assert.equal(checked.ok, false);
    assert.equal(checked.output, output);
    assert.ok(checked.issues.some(entry => ['DIALOGUE_TEXT_CHANGED', 'DIALOGUE_SPEAKER_CHANGED'].includes(entry.code)));
  }
  const changedLight = validateAndRepairGeneratedSegment({ output: twoShotPrompt(), source, expectedLabel: '1-1-1', contract: 'fast-v8', sharedBaseline: baseline.replace('EI800', 'EI1600') });
  assert.equal(changedLight.ok, false);
  assert.deepEqual(changedLight.issues.map(entry => entry.code), ['BASELINE_CHANGED']);
});

test('multiline original speech remains eligible for a guarded voice-marker repair', () => {
  const source = '甲OS：我来\n关灯。';
  const output = prompt().replace('『我来关灯。』', '『我来\n关灯。』');
  const checked = validateAndRepairGeneratedSegment({ output, source, expectedLabel: '1-1-1', contract: 'fast-v8' });
  assert.equal(checked.ok, true, JSON.stringify(checked.issues));
  assert.match(checked.output, /『我来\n关灯。』/);
});

test('positive shot percentages normalize to exactly 100 while preserving their relative proportions and all other text', () => {
  const output = twoShotPrompt({ secondSound: 'D01继续并结束。' })
    .replace('比重约50%', '比重约3%').replace('比重约50%', '比重约7%');
  const repaired = repairGeneratedShotWeights({ output });
  const weights = [...repaired.matchAll(/^分镜\d+｜比重约([\d.]+)%$/gmu)].map(match => Number(match[1]));
  assert.deepEqual(weights, [30, 70]);
  assert.equal(weights.reduce((sum, weight) => sum + weight, 0), 100);
  assert.equal(repaired.replace(/(比重约)[\d.]+%/gu, '$1WEIGHT%'), output.replace(/(比重约)[\d.]+%/gu, '$1WEIGHT%'));
  assert.equal(validateGeneratedSegment({ output: repaired, source: '甲：我来关灯。', expectedLabel: '1-1-1', contract: 'fast-v8' }).ok, true);
});

test('percentage normalization uses deterministic rounding that retains every positive shot', () => {
  const output = twoShotPrompt({ secondSound: 'D01继续并结束。' })
    .replace('比重约50%', '比重约8%').replace('比重约50%', '比重约7%');
  const repaired = repairGeneratedShotWeights({ output });
  assert.match(repaired, /比重约53\.333333%/);
  assert.match(repaired, /比重约46\.666667%/);
  assert.equal(repairGeneratedShotWeights({ output: repaired }), repaired);
});

test('weights, OS voice and continuation errors can repair together without changing the original dialogue', () => {
  const source = '甲OS：我来关灯。';
  const output = twoShotPrompt().replaceAll('比重约50%', '比重约45%');
  const checked = validateAndRepairGeneratedSegment({ output, source, expectedLabel: '1-1-1', contract: 'fast-v8' });
  assert.equal(checked.ok, true, JSON.stringify(checked.issues));
  assert.deepEqual(checked.repairs, ['DIALOGUE_MODE_CHANGED', 'MISSING_DIALOGUE_CONTINUATION', 'INVALID_SHOT_WEIGHTS']);
  assert.match(checked.output, /D01｜甲｜内心VO｜分镜01开始并在分镜02结束：『我来关灯。』/);
  assert.equal([...checked.output.matchAll(/比重约50%/gu)].length, 2);
});

test('missing, zero, negative or invalid shot weights and non-continuous shots are not fabricated', () => {
  const base = twoShotPrompt({ secondSound: 'D01继续并结束。' });
  for (const output of [
    base.replace('比重约50%', '比重约0%'),
    base.replace('比重约50%', '比重约-5%'),
    base.replace('比重约50%', '比重约NaN%'),
    base.replace('比重约50%', '比重约Infinity%'),
    base.replace('分镜02｜比重约50%', '分镜02｜'),
    base.replace('分镜02｜', '分镜03｜'),
    base.replace('分镜02｜', '分镜01｜'),
  ]) {
    assert.equal(repairGeneratedShotWeights({ output }), output);
    assert.equal(validateAndRepairGeneratedSegment({ output, source: '甲：我来关灯。', expectedLabel: '1-1-1', contract: 'fast-v8' }).ok, false);
  }
  assert.equal(validateGeneratedSegment({ output: base.replace('比重约50%', '比重约0%').replace('比重约50%', '比重约100%'), source: '甲：我来关灯。', expectedLabel: '1-1-1', contract: 'fast-v8' }).ok, false);
});

test('computed percentage repair does not waive invalid fields or changed source dialogue', () => {
  const base = twoShotPrompt({ secondSound: 'D01继续并结束。' }).replaceAll('比重约50%', '比重约45%');
  for (const output of [base.replace('『我来关灯。』', '『我去关灯。』'), base.replace('景别：甲手部特写。', '')]) {
    const checked = validateAndRepairGeneratedSegment({ output, source: '甲：我来关灯。', expectedLabel: '1-1-1', contract: 'fast-v8' });
    assert.equal(checked.ok, false);
    assert.ok(checked.repairs.includes('INVALID_SHOT_WEIGHTS'));
    assert.ok(checked.issues.some(entry => ['DIALOGUE_TEXT_CHANGED', 'INVALID_PROMPT_FIELD', 'INVALID_SHOT_FIELDS'].includes(entry.code)));
  }
});

test('redundant cast metadata and harmless dialogue typography are accepted, extra prose is rejected', () => {
  const args = { expectedLabel: '1-1-1', contract: 'fast-v8', source: '甲：我来关灯。' };
  assert.equal(validateGeneratedSegment({ ...args, output: prompt().replace('【连续台词】', '【连续台词】\n人物：甲、乙') }).ok, true);
  assert.equal(validateGeneratedSegment({ ...args, output: prompt().replace('『我来关灯。』', '「我来\n关灯.」') }).ok, true);
  assert.equal(validateGeneratedSegment({ ...args, output: prompt().replace('【连续台词】', '【连续台词】\n甲首先决定关灯。') }).ok, false);
  assert.equal(validateGeneratedSegment({ ...args, output: prompt().replace('分镜01开始并在分镜01结束', '分镜01至分镜02').replace('比重约100%', '比重约100%') }).ok, false);
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
