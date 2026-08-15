import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssetGenerationJobs } from './collabStore.js';

test('按集批量生成默认全选并支持按类别筛选', () => {
  const assets = [
    { id: 'c1', category: 'character', episodes: [1] },
    { id: 's1', category: 'scene', episodes: [1] },
    { id: 'p1', category: 'prop', episodes: [1] },
    { id: 'c2', category: 'character', episodes: [2] },
  ];
  assert.deepEqual(buildAssetGenerationJobs(assets, 1, ['character', 'scene', 'prop']).map((a) => a.id), ['c1', 's1', 'p1']);
  assert.deepEqual(buildAssetGenerationJobs(assets, 1, ['character']).map((a) => a.id), ['c1']);
});
