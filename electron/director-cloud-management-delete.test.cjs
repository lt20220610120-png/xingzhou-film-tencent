const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('导演工作台删除确认弹框通过 document.body portal 居中', () => {
  const dialog = read('src/v06/DeleteConfirm.jsx');
  assert.match(dialog, /createPortal/);
  assert.match(dialog, /document\.body/);
  assert.match(dialog, /delete-confirm-veil/);
});

test('导演云端管理提供独立删除动作，不调用项目协作删除动作', () => {
  const fn = read('supabase/functions/xingzhou-api/index.ts');
  const service = read('electron/collab-service.cjs');
  const main = read('electron/main.cjs');
  const preload = read('electron/preload.cjs');
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(fn, /director-project-delete/);
  assert.match(service, /deleteDirectorProject/);
  assert.match(main, /director-collab-delete-project/);
  assert.match(preload, /directorCollabDeleteProject/);
  assert.match(director, /directorCollabDeleteProject/);
  assert.doesNotMatch(director, /collabDeleteProject/);
});

test('导演工作台明确区分本地项目与受邀协作项目', () => {
  const hub = read('src/v06/ProjectCardHub.jsx');
  const cloud = read('core/directorCloudProjects.js');
  assert.match(cloud, /cloudRole/);
  assert.match(hub, /协作/);
  assert.match(hub, /cloud-collab-badge/);
  assert.match(hub, /canDeleteProject\(project\)/);
});

test('导演云端删除不会删除项目协作项目', () => {
  const fn = read('supabase/functions/xingzhou-api/index.ts');
  const directorDelete = fn.match(/if\(action==='director-project-delete'[\s\S]{0,1800}/)?.[0] || '';
  assert.match(directorDelete, /collab_projects/);
  assert.match(directorDelete, /analysis_output/);
  assert.match(directorDelete, /director_project_not_found/);
  assert.doesNotMatch(directorDelete, /action==='project-delete'/);
});
