const test = require('node:test');
const assert = require('node:assert/strict');
const { handleAction } = require('../src/collab.cjs');

// 严格对照 Supabase 版 xingzhou-api 的返回契约。
// 客户端依赖：
//   cloudForProject: p.analysis_output === 导演项目本地ID
//   回收站:           project-list 每项带 deleted_at / purge_after
//   管理协作:         director-project-list 带 myRole / locked / collaborationLinked
const owner = { id: 'u1', username: 'boss', display_name: '制片', is_producer: true };

const DIRECTOR = '[DIRECTOR_PROJECT]';
const COLLAB = '[COLLAB_PROJECT]';

function repo(opts) {
  const o = opts || {};
  return {
    async listProjects() { return o.projects || []; },
    async listDirectorProjectRows() { return o.directorRows || []; },
    async listCollabLinks() { return o.links || []; },
    async findMembership(pid) { return { user_id: 'u1', role: 'producer' }; },
    async listMembers() { return [{ user_id: 'u1', username: 'boss', role: 'producer' }]; },
    async getProject() { return o.one || null; },
    async isProjectLocked() { return false; },
  };
}

test('project-list 每项必须带 deleted_at 与 purge_after，回收站才能渲染', async () => {
  const until = new Date(Date.now() + 2 * 86400000).toISOString();
  const rows = [
    { id: 'p1', owner_id: 'u1', name: '正常', genre: '题材\n' + COLLAB },
    { id: 'p2', owner_id: 'u1', name: '已删', genre: '题材\n' + COLLAB + '\n[RECYCLE_UNTIL:' + until + ']' },
  ];
  const r = await handleAction('project-list', {}, owner, repo({ projects: rows }));
  assert.equal(r.status, 200);
  const live = r.body.find((x) => x.id === 'p1');
  const dead = r.body.find((x) => x.id === 'p2');
  assert.equal(live.purge_after, null, '未删除项目 purge_after 应为 null');
  assert.equal(live.deleted_at, null);
  assert.equal(dead.purge_after, until, '删除项目必须回传恢复截止时间');
  assert.ok(dead.deleted_at, '删除项目必须有 deleted_at，客户端据此显示恢复按钮');
  assert.doesNotMatch(String(dead.genre), /RECYCLE_UNTIL|COLLAB_PROJECT/);
});

test('director-project-list 必须带 analysis_output / myRole / locked / collaborationLinked', async () => {
  const directorRows = [{ id: 'd1', owner_id: 'u1', name: '导演项目', genre: DIRECTOR, analysis_output: 'local-abc' }];
  const links = [{ id: 'c1', genre: COLLAB + '\n[COLLAB_SOURCE:local-abc]' }];
  const r = await handleAction('director-project-list', {}, owner, repo({ directorRows, links }));
  assert.equal(r.status, 200);
  const row = r.body[0];
  assert.equal(row.analysis_output, 'local-abc', 'analysis_output 必须是导演项目本地ID，客户端靠它匹配云端项目');
  assert.equal(row.myRole, 'producer');
  assert.equal(row.locked, false);
  assert.equal(row.collaborationLinked, true, '被项目协作引用时必须为 true');
});

test('未被项目协作引用时 collaborationLinked 为 false', async () => {
  const directorRows = [{ id: 'd1', owner_id: 'u1', name: '导演项目', genre: DIRECTOR, analysis_output: 'local-xyz' }];
  const r = await handleAction('director-project-list', {}, owner, repo({ directorRows, links: [] }));
  assert.equal(r.body[0].collaborationLinked, false);
});
