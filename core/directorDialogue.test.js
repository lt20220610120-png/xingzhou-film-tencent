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
