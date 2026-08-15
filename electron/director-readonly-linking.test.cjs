const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('项目协作同步提示词不得向导演工作台写入或创建项目', () => {
  const collab = read('src/v06/CollabWorkspace.jsx');
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.doesNotMatch(collab, /setState\s*\(/);
  assert.doesNotMatch(collab, /directorCollabCreateProject/);
  assert.doesNotMatch(director, /directorProjects:\s*\[\.\.\.cloudProjects/);
});

test('导演云项目列表把受邀项目加入工作台，并按云项目ID去重', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /reconcileDirectorCloudProjects/);
  assert.match(director, /candidate\.cloudProjectId === project\.cloudProjectId/);
});

test('找不到或无法唯一确定导演项目时打开选择弹框而非显示错误', () => {
  const collab = read('src/v06/CollabWorkspace.jsx');
  assert.match(collab, /DirectorProjectPicker/);
  assert.match(collab, /setLinkPickerOpen\(true\)/);
  assert.doesNotMatch(collab, /同步失败，请刷新导演工作台云项目后重试/);
});

test('选择导演项目后只持久化关联并读取提示词', () => {
  const collab = read('src/v06/CollabWorkspace.jsx');
  const service = read('electron/collab-service.cjs');
  const edge = read('supabase/functions/xingzhou-api/index.ts');
  assert.match(collab, /collabLinkDirector/);
  assert.match(service, /project-link-director/);
  assert.match(edge, /project-link-director/);
  assert.match(edge, /COLLAB_SOURCE/);
});

test('导演项目选择弹框显示项目、集数和提示词统计', () => {
  const collab = read('src/v06/CollabWorkspace.jsx');
  assert.match(collab, /重新关联导演项目/);
  assert.match(collab, /条提示词/);
  assert.match(collab, /选择并同步/);
});

test('海洋主题覆盖核心工作台、弹框、表格、聊天和管理界面', () => {
  const css = read('src/ocean-theme.css');
  for (const selector of ['.card-page','.director-shell','.collab-shell','.canvas-workspace','.skill-library','.api-library','.admin-panel','.global-ai','.modal','.admin-table']) assert.match(css, new RegExp(selector.replace('.', '\\.')));
  assert.match(css, /--ocean-violet/);
  assert.match(css, /ocean-caustics/);
});
