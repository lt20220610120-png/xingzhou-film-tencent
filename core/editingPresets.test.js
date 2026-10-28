import test from 'node:test';
import assert from 'node:assert/strict';

test('默认剪辑设定按国内剧生成竖条人名条与单行字幕规则', async () => {
  const {defaultEditingInstruction} = await import('./editingPresets.js');
  const text = defaultEditingInstruction({editMarket: 'domestic', tailFrameMode: 'default'});
  assert.match(text, /国内剧人名条/);
  assert.match(text, /竖条/);
  assert.match(text, /一行不超过 8 个字/);
  assert.match(text, /定格.*2 秒/);
  assert.match(text, /至少使用两首/);
});

test('默认剪辑设定按海外剧生成横条人名条与两行字幕规则', async () => {
  const {defaultEditingInstruction} = await import('./editingPresets.js');
  const text = defaultEditingInstruction({editMarket: 'overseas', tailFrameMode: 'custom'});
  assert.match(text, /海外剧人名条/);
  assert.match(text, /海外横条/);
  assert.match(text, /最多两行/);
  assert.match(text, /指定尾帧文件/);
});

test('自定义剪辑设定不会被默认规则覆盖', async () => {
  const {effectiveEditingInstruction} = await import('./editingPresets.js');
  assert.equal(effectiveEditingInstruction({editPreset: 'custom', editInstruction: '只输出无字幕版'}), '只输出无字幕版');
});
