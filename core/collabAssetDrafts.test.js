import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetDraftStore } from './collabAssetDrafts.js';

const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};

test('手动草稿跨重建保留，并按账号、项目和资产隔离', () => {
  const disk = storage(); const store = createAssetDraftStore(disk, 'user');
  store.write('p', 'a', '手动编辑的门厅');
  assert.equal(createAssetDraftStore(disk, 'user').read('p', 'a').content, '手动编辑的门厅');
  assert.equal(createAssetDraftStore(disk, 'other').read('p', 'a'), null);
  assert.equal(store.read('other', 'a'), null);
  assert.equal(store.read('p', 'other'), null);
});

test('保存失败保留 AI 或手动草稿，重试只调用保存接口', async () => {
  const store = createAssetDraftStore(storage(), 'user');
  store.write('p', 'a', 'AI 修改后的老房子');
  await assert.rejects(store.save({ collabUpdateAsset: async () => { throw Error('offline'); } }, 'p', 'a', 'AI 修改后的老房子'));
  assert.equal(store.read('p', 'a').pending, true);
  let payload;
  await store.save({ collabUpdateAsset: async p => { payload = p; return p.updates; } }, 'p', 'a', store.read('p', 'a').content);
  assert.deepEqual(payload, { projectId: 'p', assetId: 'a', updates: { description: 'AI 修改后的老房子' } });
  assert.equal(store.read('p', 'a').pending, false);
});

test('并发保存按顺序执行，旧响应不能抹掉后续输入', async () => {
  const store = createAssetDraftStore(storage(), 'user'); const calls = [];
  let finish;
  const api = { collabUpdateAsset: async p => { calls.push(p.updates.description); if (calls.length === 1) await new Promise(r => { finish = r; }); return p.updates; } };
  store.write('p', 'a', '旧修改');
  const first = store.save(api, 'p', 'a', '旧修改');
  await new Promise(r => setImmediate(r));
  store.write('p', 'a', '最新修改');
  const second = store.save(api, 'p', 'a', '最新修改');
  finish(); await first;
  assert.equal(store.read('p', 'a').content, '最新修改');
  await second;
  assert.deepEqual(calls, ['旧修改', '最新修改']);
});

test('保存后云端刷新完成前批量生图仍能读取最新内容', async () => {
  const store = createAssetDraftStore(storage(), 'user');
  store.write('p', 'a', '最新修改');
  await store.save({ collabUpdateAsset: async () => ({ description: '最新修改' }) }, 'p', 'a', '最新修改');
  store.reconcile('p', { id: 'a', description: '旧描述' });
  assert.equal(store.read('p', 'a').content, '最新修改');
  store.reconcile('p', { id: 'a', description: '最新修改' });
  assert.equal(store.read('p', 'a'), null);
});

test('后台刷新不能覆盖未保存草稿，包括空字符串', () => {
  const store = createAssetDraftStore(storage(), 'user');
  store.write('p', 'a', '');
  store.reconcile('p', { id: 'a', description: '云端旧描述', updated_at: new Date().toISOString() });
  assert.equal(store.read('p', 'a').content, '');
});
