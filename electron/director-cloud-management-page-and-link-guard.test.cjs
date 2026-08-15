const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('导演工作台提供独立云端管理页面入口和返回操作', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /云端管理/);
  assert.match(director, /DirectorCloudManager/);
  assert.match(director, /cloudManagerOpen/);
  assert.match(director, /返回导演工作台/);
});

test('云端管理页把仍被项目协作读取的导演项目虚化并禁用删除', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /collaborationLinked/);
  assert.match(director, /director-cloud-row\$\{collaborationLinked/);
  assert.match(director, /disabled=\{collaborationLinked\}/);
  assert.match(director, /请先到“项目协作”删除/);
});

test('服务端标记活跃项目协作占用，回收站项目不再阻止导演云删除', () => {
  const fn = read('supabase/functions/xingzhou-api/index.ts');
  const list = fn.match(/if\(action==='director-project-list'[\s\S]*?return json\(canonical\);/)?.[0] || '';
  const remove = fn.match(/if\(action==='director-project-delete'[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(list, /collabSource/);
  assert.match(list, /collaborationLinked/);
  assert.match(list, /recycleUntil/);
  assert.match(remove, /director_project_in_use/);
  assert.match(remove, /recycleUntil/);
});

test('旧导演云记录即使缺少类型标记也可按稳定导演项目ID删除', () => {
  const fn = read('supabase/functions/xingzhou-api/index.ts');
  const remove = fn.match(/if\(action==='director-project-delete'[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(remove, /analysis_output/);
  assert.doesNotMatch(remove, /!String\(p\.genre\|\|''\)\.includes\(DIRECTOR_PROJECT_SENTINEL\)/);
});

test('普通项目卡不再直接删除已上云导演项目，统一进入云端管理', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /canDeleteProject=\{\(project\) => !project\.cloudProjectId\}/);
  assert.match(director, /canDeleteProject, onOpenCloudManager/);
});
