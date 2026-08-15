const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('本地导演项目刷新后以函数式合并加载，不能被启动时旧 state 覆盖', () => {
  const app = read('src/App.jsx');
  assert.match(app, /mergePersistedState\(current, directorProjects \? \{/);
  assert.doesNotMatch(app, /api\.saveState\(state\);/);
});

test('导演页固定分组为工作台、内容创作者剧本库和云端，不显示全部项目与未分组', () => {
  const hub = read('src/v06/ProjectCardHub.jsx');
  assert.match(hub, /director-workbench/);
  assert.match(hub, /director-library/);
  assert.match(hub, /\{!isDirector && <button[^\n]*>全部项目<\/button>\}/);
});

test('导演云项目自动进入云端，本地项目不会因云列表缺失而消失', () => {
  const cloud = read('core/directorCloudProjects.js');
  assert.match(cloud, /groupId:\s*'director-cloud'/);
  assert.doesNotMatch(cloud, /localProjects\.filter\(\(project\)\s*=>\s*!project\.cloudProjectId/);
});

test('项目协作开启后导演卡通过导演项目来源ID进入云端固定分组', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /api\.collabListProjects/);
  assert.match(director, /project\.director_project_id/);
  assert.match(director, /collaborationProjectId/);
  assert.match(director, /groupId:\s*'director-cloud'/);
});

test('分组工具栏为操作区保留独立布局，重命名与删除按钮不重叠', () => {
  const css = read('src/v100-compat.css');
  assert.match(css, /\.group-actions\{[^}]*min-width:max-content/);
  assert.match(css, /\.group-actions button\{[^}]*white-space:nowrap/);
});