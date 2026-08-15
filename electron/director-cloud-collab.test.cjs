const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('导演项目卡提供制片专属协作管理，协作者也能看到云项目', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  const hub = read('src/v06/ProjectCardHub.jsx');
  assert.match(director, /directorCollabListProjects/);
  assert.match(director, /directorCollabCreateProject/);
  assert.match(director, /directorAddMember/);
  assert.match(director, /directorRemoveMember/);
  assert.match(director, /directorCollabSetLocked/);
  assert.match(hub, /管理协作|开启协作/);
});

test('云端项目锁定由服务端阻止全部内容编辑且只有制片可切换', () => {
  const fn = read('supabase/functions/xingzhou-api/index.ts');
  assert.match(fn, /project-lock/);
  assert.match(fn, /PROJECT_LOCK_SENTINEL/);
  assert.match(fn, /project_locked/);
  assert.match(fn, /m\.role!=='producer'/);
});

test('Electron 和 preload 暴露项目锁定与导演云端协作接口', () => {
  const main = read('electron/main.cjs');
  const preload = read('electron/preload.cjs');
  const service = read('electron/collab-service.cjs');
  for (const token of ['collab-set-project-locked', 'collabSetProjectLocked']) {
    assert.ok(main.includes(token) || preload.includes(token) || service.includes(token), `缺少 ${token}`);
  }
});

test('项目协作分镜提供只刷新导演提示词的同步操作', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /同步导演提示词/);
  assert.match(ui, /syncDirectorPrompts/);
  assert.match(ui, /cloudProjectId/);
});
