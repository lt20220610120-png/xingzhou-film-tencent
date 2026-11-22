const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('导演协作与项目协作使用分离的云端动作和列表', () => {
  const fn = read('cloud-backend/src/collab.cjs');
  const service = read('electron/collab-service.cjs');
  assert.match(fn, /director-project-create/);
  assert.match(fn, /director-project-list/);
  assert.match(fn, /DIRECTOR_SENTINEL/);
  assert.match(service, /listDirectorProjects/);
  assert.match(service, /createDirectorProject/);
});

test('同一导演项目开启协作幂等，不会每次邀请创建新项目', () => {
  const repository = read('cloud-backend/src/repository-extras.cjs');
  const create = repository.match(/async createDirectorProject\([\s\S]*?(?=\n    async )/)?.[0] || '';
  assert.match(create, /pg_advisory_xact_lock/);
  assert.match(create, /analysis_output=\$2/);
  assert.match(create, /row=prior\[0\][\s\S]*row \|\|= .*client\.query\(sql/);
});

test('导演工作台邀请成员只追加或踢出，不重置已有成员', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /directorListMembers/);
  assert.match(director, /directorAddMember/);
  assert.match(director, /directorRemoveMember/);
});

test('导演云项目支持手动刷新并拉取完整云端项目内容', () => {
  const director=read('src/v06/DirectorWorkspace.jsx');
  assert.match(director,/directorCollabGetProject/);
  assert.match(director,/reconcileDirectorCloudProjects/);
  // The shared save coordinator is covered by directorCloudSync behavior tests.
  assert.doesNotMatch(director,/updates: \{ episodes: mergedEpisodes \}/);
});

test('项目协作删除记录回收时间并保留三天恢复窗口', () => {
  const repository = read('cloud-backend/src/repository-extras.cjs');
  const remove = repository.match(/async softDeleteProject\([\s\S]*?(?=\n    async )/)?.[0] || '';
  assert.match(remove, /3\s*\*\s*86400000/);
  assert.match(remove, /deleted_at=now\(\),purge_after=\$2/);
  assert.match(repository, /async purgeExpiredProjects[\s\S]*purge_after <= now\(\)/);
});
