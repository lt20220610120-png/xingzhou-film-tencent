import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDirectorDialogues, sourceDialogues, countDialogueCharacters, normalizeDialogueText, normalizeDialogueMode } from './directorDialogue.js';

const plain = rows => rows.map(({ speaker, speech, mode }) => ({ speaker, speech, mode }));

test('cast and scene metadata never become spoken text', () => {
  const source = '1-1 景：楼道 清晨 内\n人：林甲、陈乙、系统\n人物：林甲、陈乙\n△陈乙走进楼道。\n林甲（低声）：钥匙在这里。\n△陈乙伸手接过。';
  assert.deepEqual(plain(parseDirectorDialogues(source)), [{ speaker: '林甲', speech: '钥匙在这里。', mode: null }]);
});

test('attached and separated OS/VO or parenthetical voice annotations retain speaker identity', () => {
  const source = '林甲OS：别紧张。\n林甲 OS（深呼吸）：我能办好。\n林甲OS（坚定）：现在就走。\n系统 VO：已找到钥匙。\n陈乙（V.O.）：这里好安静。\n陈乙（场外，着急）：等等我！';
  assert.deepEqual(plain(parseDirectorDialogues(source)), [
    { speaker: '林甲', speech: '别紧张。', mode: '内心VO' },
    { speaker: '林甲', speech: '我能办好。', mode: '内心VO' },
    { speaker: '林甲', speech: '现在就走。', mode: '内心VO' },
    { speaker: '系统', speech: '已找到钥匙。', mode: '场外声音' },
    { speaker: '陈乙', speech: '这里好安静。', mode: '场外声音' },
    { speaker: '陈乙', speech: '等等我！', mode: '场外声音' },
  ]);
});

test('explicit thoughts remain distinct from audible system and off-screen voices', () => {
  for (const mode of ['OS', 'O.S.', '内心VO', '内心 V.O.', '心声']) assert.equal(normalizeDialogueMode(mode), '内心VO');
  for (const mode of ['VO', 'V.O.', '系统VO', '场外声音', '旁白']) assert.equal(normalizeDialogueMode(mode), '场外声音');
  assert.deepEqual(plain(parseDirectorDialogues('甲（内心 V.O.）：我找到了。\n警察 VO：站住！')), [
    { speaker: '甲', speech: '我找到了。', mode: '内心VO' },
    { speaker: '警察', speech: '站住！', mode: '场外声音' },
  ]);
});

test('multiline continuation survives blank lines and stops before marked action', () => {
  const source = '林甲：钥匙在这里，\n\n拿去吧。\n△陈乙伸手。\n陈乙：谢谢。';
  const rows = parseDirectorDialogues(source);
  assert.deepEqual(plain(rows), [{ speaker: '林甲', speech: '钥匙在这里，\n拿去吧。', mode: null }, { speaker: '陈乙', speech: '谢谢。', mode: null }]);
  for (const row of rows) assert.equal(row.ranges.map(range => source.slice(range.start, range.end)).join('\n'), row.speech);
});

test('literal quotes and colons in speech do not create fictitious speakers', () => {
  for (const speech of ['我告诉你，答案：在这里。', '他说：“陈乙：等等。”我就停下了。', '听好了：现在就走。']) {
    assert.deepEqual(plain(parseDirectorDialogues(`反打镜头，林甲（认真）：${speech}`)), [{ speaker: '林甲', speech, mode: null }]);
  }
  assert.deepEqual(plain(parseDirectorDialogues('林甲：走吧。陈乙：等我。')), [{ speaker: '林甲', speech: '走吧。', mode: null }, { speaker: '陈乙', speech: '等我。', mode: null }]);
  assert.deepEqual(plain(parseDirectorDialogues('△陈乙点头，林甲（低声）：走吧。')), [{ speaker: '林甲', speech: '走吧。', mode: null }]);
  assert.equal(parseDirectorDialogues('△提示：纸上写着钥匙的位置。').length, 0);
});

test('partial ranges inherit the speaker and voice from whole source and exclude adjacent speech', () => {
  const sourceText = '林甲OS：先放下杯子，然后把窗关上。\n△林甲走向窗边。\n陈乙：我来帮你。';
  const sourceStart = sourceText.indexOf('然后');
  const sourceEnd = sourceText.indexOf('\n△');
  assert.deepEqual(plain(sourceDialogues({ sourceText, sourceStart, sourceEnd, text: sourceText.slice(sourceStart, sourceEnd) })), [{ speaker: '林甲', speech: '然后把窗关上。', mode: '内心VO' }]);
});

test('speech offsets exclude wrapper quotes and remain UTF-16 offsets with supplementary characters', () => {
  const source = '林甲：「看那只𠮷字玩偶。」';
  const row = parseDirectorDialogues(source)[0];
  assert.equal(row.speech, '看那只𠮷字玩偶。');
  assert.equal(source.slice(row.speechStart, row.speechEnd), row.speech);
  assert.equal(countDialogueCharacters(row.speech), 7);
  assert.equal(countDialogueCharacters('你好！123、A B…'), 7);
});

test('ordinary Latin actor names and source typography remain lexical content', () => {
  assert.deepEqual(plain(parseDirectorDialogues('Carlos：Ready?')), [{ speaker: 'Carlos', speech: 'Ready?', mode: null }]);
  assert.equal(normalizeDialogueText('“好了：走吧！”'), normalizeDialogueText('『好了:走吧!』'));
  assert.notEqual(normalizeDialogueText('好，走吧。'), normalizeDialogueText('好，停下。'));
  assert.notEqual(normalizeDialogueText('真的吗？'), normalizeDialogueText('真的吗！'));
});

test('announcement fields after full stops remain the original system speech and source offsets', () => {
  const source = '4-5 景：仓库 深夜 内\n人：马库斯、小弟甲、魏今朝、系统\n系统 VO：发现魔教头目马库斯。主线任务：七日内拔除魔窟。\n系统 VO：失败后，宿主与魏姝皆难逃魔爪。完成奖励：声望三百，属性点零点五，护道锦囊。\n魏今朝 OS：想动我姐？那就别怪我先下手。';
  const rows = parseDirectorDialogues(source);
  assert.deepEqual(plain(rows), [
    { speaker: '系统', mode: '场外声音', speech: '发现魔教头目马库斯。主线任务：七日内拔除魔窟。' },
    { speaker: '系统', mode: '场外声音', speech: '失败后，宿主与魏姝皆难逃魔爪。完成奖励：声望三百，属性点零点五，护道锦囊。' },
    { speaker: '魏今朝', mode: '内心VO', speech: '想动我姐？那就别怪我先下手。' },
  ]);
  for (const row of rows) assert.equal(source.slice(row.speechStart, row.speechEnd), row.speech);
  const first = rows[0];
  assert.deepEqual(plain(sourceDialogues({ sourceText: source, sourceStart: first.speechStart, sourceEnd: first.speechEnd })), [plain(rows)[0]]);
});

test('spoken field categories work without a cast list and across continuation lines', () => {
  const source = '系统 VO：领取成功。支线目标：打开门。\n完成条件：找到钥匙。额外奖励：声望十点。\n甲：我知道了。';
  assert.deepEqual(plain(parseDirectorDialogues(source)), [
    { speaker: '系统', mode: '场外声音', speech: '领取成功。支线目标：打开门。\n完成条件：找到钥匙。额外奖励：声望十点。' },
    { speaker: '甲', mode: null, speech: '我知道了。' },
  ]);
});

test('cast and independently identified actors permit genuine inline speaker changes', () => {
  const source = '人：系统、甲、乙\n系统 VO：你们好。甲：我来了。\n乙：已经到了。\n甲：跟上。旁白 VO：两人走出门。\n旁白 VO：街灯亮着。';
  assert.deepEqual(plain(parseDirectorDialogues(source)), [
    { speaker: '系统', mode: '场外声音', speech: '你们好。' },
    { speaker: '甲', mode: null, speech: '我来了。' },
    { speaker: '乙', mode: null, speech: '已经到了。' },
    { speaker: '甲', mode: null, speech: '跟上。' },
    { speaker: '旁白', mode: '场外声音', speech: '两人走出门。' },
    { speaker: '旁白', mode: '场外声音', speech: '街灯亮着。' },
  ]);
  assert.deepEqual(plain(parseDirectorDialogues('人：结果、甲\n甲：到了。结果：开门。')), [
    { speaker: '甲', mode: null, speech: '到了。' },
    { speaker: '结果', mode: null, speech: '开门。' },
  ]);
});

test('source speaker header offsets include direction, voice marker, colon and leading speech whitespace', () => {
  const source = '人：甲、乙\n甲 OS（低声）： 先开门。乙（认真）：好了。';
  const rows = parseDirectorDialogues(source);
  assert.deepEqual(rows.map(row => source.slice(row.headerStart, row.headerEnd)), ['甲 OS（低声）： ', '乙（认真）：']);
  for (const row of rows) assert.equal(row.headerEnd, row.speechStart);
});

test('a minor inline speaking role omitted from the cast list remains a real actor', () => {
  assert.deepEqual(plain(parseDirectorDialogues('人：甲、乙\n甲：你好。护士：换药了。乙：好的。')), [
    { speaker: '甲', speech: '你好。', mode: null },
    { speaker: '护士', speech: '换药了。', mode: null },
    { speaker: '乙', speech: '好的。', mode: null },
  ]);
});
