import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScenePromptRecords, splitNumberedPromptOutput } from './directorCreative.js';

test('Skill完整输出按中文全角（1）（2）（3）拆成独立提示词', () => {
  const output = `（1）\n【基础设定】\n第一条完整内容\n（2）\n【基础设定】\n第二条完整内容\n（3）\n【基础设定】\n第三条完整内容`;
  assert.deepEqual(splitNumberedPromptOutput(output), [
    { label: '1', content: '【基础设定】\n第一条完整内容' },
    { label: '2', content: '【基础设定】\n第二条完整内容' },
    { label: '3', content: '【基础设定】\n第三条完整内容' },
  ]);
});

test('兼容半角(1)、混合括号、行首空格以及编号后同行正文', () => {
  const output = `  (1) 第一条（约10秒）\n （2） 第二条\n(3）\n第三条`;
  assert.deepEqual(splitNumberedPromptOutput(output).map(item => item.content), [
    '第一条（约10秒）', '第二条', '第三条',
  ]);
});

test('编号前的说明不生成额外卡片，无编号输出保留为一张完整卡片', () => {
  const numbered = splitNumberedPromptOutput('以下为完整结果：\n（1）\n第一条\n（2）\n第二条');
  assert.equal(numbered.length, 2);
  assert.match(numbered[0].content, /以下为完整结果/);
  assert.deepEqual(splitNumberedPromptOutput('【基础设定】\n唯一完整提示词'), [
    { label: '1', content: '【基础设定】\n唯一完整提示词' },
  ]);
});

test('按行首集-场景-序号分割完整输出并在每条正文第一行保留序号', () => {
  const output = `1-1-1\n【基础设定】\n第一条完整内容\n\n1-1-2\n【基础设定】\n第二条完整内容`;
  assert.deepEqual(splitNumberedPromptOutput(output), [
    { label: '1-1-1', content: '1-1-1\n【基础设定】\n第一条完整内容' },
    { label: '1-1-2', content: '1-1-2\n【基础设定】\n第二条完整内容' },
  ]);
});

test('场景提示词记录直接采用Agent给出的完整序号，正文仍保留同一序号', () => {
  const parts = splitNumberedPromptOutput('2-1-1\n第一条\n2-1-2\n第二条\n2-1-3\n第三条');
  const records = buildScenePromptRecords({ sceneLabel: '2-1', parts, now: 123 });
  assert.deepEqual(records.map(({ label, content }) => ({ label, content })), [
    { label: '2-1-1', content: '2-1-1\n第一条' },
    { label: '2-1-2', content: '2-1-2\n第二条' },
    { label: '2-1-3', content: '2-1-3\n第三条' },
  ]);
});

test('正文中的日期和普通连字符数字不触发拆分', () => {
  const output = `1-1-1\n画面发生于2026-08-03，不应再次拆分。\n镜头比例为1-1。`;
  assert.deepEqual(splitNumberedPromptOutput(output), [
    { label: '1-1-1', content: output },
  ]);
});

test('兼容模型常见Markdown标题和加粗编号，并拆出全部卡片', () => {
  const output = `### 1-1-1\n【基础设定】\n第一条\n\n**1-1-2**\n【基础设定】\n第二条`;
  const parts = splitNumberedPromptOutput(output);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map(part => part.label), ['1-1-1', '1-1-2']);
  assert.equal(parts[0].content, '### 1-1-1\n【基础设定】\n第一条');
  assert.equal(parts[1].content, '**1-1-2**\n【基础设定】\n第二条');
});

test('拆分只切边界，不改写Agent每条提示词原文', () => {
  const output = '1-1-1\r\n【基础设定】\r\n第一条  \r\n\r\n1-1-2\r\n【基础设定】\r\n第二条';
  assert.deepEqual(splitNumberedPromptOutput(output), [
    { label: '1-1-1', content: '1-1-1\r\n【基础设定】\r\n第一条  ' },
    { label: '1-1-2', content: '1-1-2\r\n【基础设定】\r\n第二条' },
  ]);
});

test('任意集数场景均按完整三级编号拆分', () => {
  const output = '5-2-1\n一\n5-2-2\n二\n5-2-3\n三';
  assert.deepEqual(splitNumberedPromptOutput(output).map(part => part.label), ['5-2-1', '5-2-2', '5-2-3']);
});
