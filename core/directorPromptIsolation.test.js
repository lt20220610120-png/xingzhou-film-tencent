import test from 'node:test';
import assert from 'node:assert/strict';
import { promptsForScene } from './directorCreative.js';

test('提示词列表严格按当前集当前场景隔离，旧数据也不会串到其他集', () => {
  const mixed = [
    { label: '1-1-1', sceneLabel: '1-1', content: '第一集第一场' },
    { label: '1-2-1', sceneLabel: '1-2', content: '第一集第二场' },
    { label: '2-1-1', sceneLabel: '2-1', content: '第二集第一场' },
    { label: '1-1-2', content: '旧数据第一集第一场' },
  ];
  assert.deepEqual(promptsForScene(mixed, '2-1').map(item => item.label), ['2-1-1']);
  assert.deepEqual(promptsForScene(mixed, '1-1').map(item => item.label), ['1-1-1', '1-1-2']);
  assert.deepEqual(promptsForScene(mixed, '2-2'), []);
});
