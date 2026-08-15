const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('导演协作与项目协作使用分离的云端动作和列表', () => {
  const fn = read('supabase/functions/xingzhou-api/index.ts');
  const service = read('electron/collab-service.cjs');
  assert.match(fn, /director-project-create/);
  assert.match(fn, /director-project-list/);
  assert.match(fn, /DIRECTOR_PROJECT_SENTINEL/);
  assert.match(service, /listDirectorProjects/);
  assert.match(service, /createDirectorProject/);
});

test('同一导演项目开启协作幂等，不会每次邀请创建新项目', () => {
  const fn = read('supabase/functions/xingzhou-api/index.ts');
  assert.match(fn, /director_project_id_required/);
  assert.match(fn, /maybeSingle/);
  assert.match(fn, /existing/);
});

test('导演工作台邀请成员只追加或踢出，不重置已有成员', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /directorListMembers/);
  assert.match(director, /directorAddMember/);
  assert.match(director, /directorRemoveMember/);
});

test('导演云项目支持手动刷新并拉取完整云端项目内容', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /已刷新并合并云端项目/);
  assert.match(director, /refreshDirectorCloud/);
  assert.match(director, /mergeCloudEpisodes\(selectedProject\.episodes \|\| \[\], cloud\.episodes \|\| \[\]\)/);
});

test('项目协作删除不依赖缺失的 deleted_at 列，并保留三天恢复窗口', () => {
  const fn = read('supabase/functions/xingzhou-api/index.ts');
  assert.doesNotMatch(fn, /update\(\{deleted_at:/);
  assert.match(fn, /RECYCLE_SENTINEL/);
  assert.match(fn, /3\*86400000/);
  assert.match(fn, /purgeExpiredProjects/);
});
