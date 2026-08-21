const test = require('node:test');
const assert = require('node:assert/strict');
const { handleAction } = require('../src/collab.cjs');

// 客户端用 project.myRole 决定显示哪些功能区（sectionsForRole）。
// 缺少该字段时会退化成只有『项目群』一个入口。
const owner = { id: 'u1', username: 'boss', display_name: '制片', is_producer: true };
const artist = { id: 'u2', username: 'art', display_name: '美术', is_producer: false };

function repo(members) {
  return {
    async getProject(id, uid) { return { id: 'p1', owner_id: 'u1', name: '项目' }; },
    async listProjects(uid) { return [{ id: 'p1', owner_id: 'u1', name: '项目' }]; },
    async listDirectorMembers() { return members; },
    async listMembers() { return members; },
  };
}

test('项目所有者读取项目时 myRole 必须是 producer', async () => {
  const r = await handleAction('project-get', { projectId: 'p1' }, owner, repo([]));
  assert.equal(r.status, 200);
  assert.equal(r.body.myRole, 'producer', '所有者必须拿到 producer 角色，否则功能区全部消失');
});

test('成员读取项目时 myRole 取成员表中的角色', async () => {
  const members = [{ user_id: 'u2', username: 'art', role: 'artist' }];
  const r = await handleAction('project-get', { projectId: 'p1' }, artist, repo(members));
  assert.equal(r.status, 200);
  assert.equal(r.body.myRole, 'artist');
});

test('项目列表每一项也要带 myRole', async () => {
  const r = await handleAction('project-list', {}, owner, repo([]));
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
  assert.equal(r.body[0].myRole, 'producer');
});
