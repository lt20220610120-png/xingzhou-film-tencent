import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssetRevisionMessages } from './collabStore.js';

test('修改提示词优先传入用户意见，再提供原始内容', () => {
  const messages = buildAssetRevisionMessages({
    instruction: '改成夜景，并强化霓虹反光',
    originalContent: '现代城市街道，白天。',
    category: 'scene',
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[1].content, /修改意见[\s\S]*改成夜景，并强化霓虹反光[\s\S]*原始提示词[\s\S]*现代城市街道，白天。/);
  assert.match(messages[0].content, /只输出修改后的完整提示词/);
});

test('修改提示词拒绝空修改意见', () => {
  assert.throws(
    () => buildAssetRevisionMessages({ instruction: '   ', originalContent: '原内容', category: 'prop' }),
    /修改意见不能为空/,
  );
});
