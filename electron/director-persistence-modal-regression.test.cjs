const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('导演本地项目必须使用独立的导演工作台项目目录', () => {
  const main = read('electron/main.cjs');
  assert.match(main, /function directorProjectsDir\(dir=getDataDir\(\)\)/);
  assert.match(main, /导演工作台的项目/);
  assert.match(main, /director-projects\.json/);
  assert.match(main, /oldDirectorFile/);
});

test('导演工作台状态保存不能用空的旧 masterDraft 覆盖已导入剧本', () => {
  const ui = read('src/v06/DirectorWorkspace.jsx');
  assert.match(ui, /value=\{masterDraft !== '' \? masterDraft : selectedProject\.masterScript \|\| ''\}/);
  assert.match(ui, /const sourceDraft = masterDraft\.trim\(\) \? masterDraft : selectedProject\.masterScript \|\| ''/);
});

test('分组弹窗使用 body portal 并居中覆盖视口', () => {
  const hub = read('src/v06/ProjectCardHub.jsx');
  const css = read('src/v100-compat.css');
  assert.match(hub, /createPortal\(/);
  assert.match(css, /\.group-dialog-veil\{[^}]*align-items:center/);
  assert.match(css, /\.group-dialog-veil\{[^}]*position:fixed/);
});

test('分组操作区始终给重命名和删除按钮独立不压缩空间', () => {
  const css = read('src/v100-compat.css');
  assert.match(css, /\.group-actions\{[^}]*min-width:max-content/);
  assert.match(css, /\.group-actions button\{[^}]*flex:0 0 auto/);
});

test('danger-link 绝对定位只允许作用在项目协作卡片内，不得污染导演分组工具栏', () => {
  const css = read('src/collab.css');
  assert.doesNotMatch(css, /(?<!\.collab-project-card )\.danger-link\{[^}]*position:absolute/);
  assert.match(css, /\.collab-project-card \.danger-link\{[^}]*position:absolute/);
});

test('删除单个本地导演项目不能连带清空其他本地项目', () => {
  const ui = read('src/v06/DirectorWorkspace.jsx');
  assert.match(ui, /p\.id !== id && \(!target\?\.cloudProjectId \|\| p\.cloudProjectId !== target\.cloudProjectId\)/);
  assert.doesNotMatch(ui, /p\.id !== id && p\.cloudProjectId !== target\?\.cloudProjectId\)/);
});

test('上传/导入新项目后必须同步 masterDraft，防止保存总剧本时串台或清空', () => {
  const ui = read('src/v06/DirectorWorkspace.jsx');
  const uploads = ui.match(/setMasterDraft\(newProject\.masterScript \|\| ''\)/g) || [];
  assert.ok(uploads.length >= 2, '上传与剧本库导入两条路径都要重置 masterDraft');
});

test('导演项目文件保存缩水前必须先落备份，加载时可从备份恢复', () => {
  const main = read('electron/main.cjs');
  assert.match(main, /\.backup\.json/);
  assert.match(main, /next\.length<prev\.length/);
});
