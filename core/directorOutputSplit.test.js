import test from 'node:test';
import assert from 'node:assert/strict';
import { splitNumberedPromptOutput } from './directorCreative.js';

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
