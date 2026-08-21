const test = require('node:test');
const assert = require('node:assert/strict');
const { handleAction } = require('../src/collab.cjs');

// 对照 Supabase 版 xingzhou-api 的返回契约，防止客户端拿到错误结构而崩溃。
const owner = { id: 'u1', username: 'boss', display_name: '制片', is_producer: true };

function repo() {
  return {
    async getProject() { return { id: 'p1', owner_id: 'u1', name: '项目', genre: '题材\n[COLLAB_PROJECT]\n[COLLAB_SOURCE:dir-9]' }; },
    async listProjects() { return [{ id: 'p1', owner_id: 'u1', name: '项目', genre: '题材\n[COLLAB_PROJECT]' }]; },
    async listMembers() { return [{ user_id: 'u1', username: 'boss', role: 'producer' }]; },
    async findMembership() { return { user_id: 'u1', role: 'producer' }; },
    async isProjectLocked() { return false; },
    async getStatsBundle() { return { members: [{ user_id: 'u1' }], activity: [{ action: 'x' }], media: [{ kind: 'asset-image' }] }; },
    async listAssets() { return [{ id: 'a1', name: '资产' }]; },
    async listAssetImages() { return [{ id: 'm1', asset_id: 'a1', object_path: 'k', filename: 'f', mime: 'image/png' }]; },
  };
}

test('stats-get 必须返回 members / activity / media 三个数组', async () => {
  const r = await handleAction('stats-get', { projectId: 'p1' }, owner, repo());
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.members), 'members 必须是数组');
  assert.ok(Array.isArray(r.body.activity), 'activity 必须是数组');
  assert.ok(Array.isArray(r.body.media), 'media 必须是数组');
});

test('项目返回值剥离内部标记并给出 director_project_id', async () => {
  const r = await handleAction('project-get', { projectId: 'p1' }, owner, repo());
  assert.equal(r.status, 200);
  assert.equal(r.body.director_project_id, 'dir-9');
  assert.doesNotMatch(String(r.body.genre), /COLLAB_PROJECT|COLLAB_SOURCE/);
  assert.equal(r.body.myRole, 'producer');
});

test('资产列表附带 images 数组（kind=asset-image）', async () => {
  const r = await handleAction('assets-list', { projectId: 'p1' }, owner, repo());
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body[0].images));
  assert.equal(r.body[0].images.length, 1);
});
