const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('总剧本解析把第一集前内容归入设定和小传，并保持各集边界', () => {
  const source = read('core/scriptImport.js');
  assert.match(source, /设定和小传/);
  assert.match(source, /parseMasterScript/);
});

test('总剧本编辑器拥有保存按钮与大尺寸编辑区域', () => {
  const source = read('src/v06/DirectorWorkspace.jsx');
  assert.match(source, /保存总剧本/);
  assert.match(source, /parseMasterScript/);
  assert.match(source, /master-editor/);
});

test('添加集数使用填写内容的对话框并保存到总剧本', () => {
  const source = read('src/v06/DirectorWorkspace.jsx');
  assert.match(source, /添加第.*集/);
  assert.match(source, /newEpisodeContent/);
  assert.match(source, /masterScript/);
});

test('删除导演分集只删除工作台分集，不改总剧本', () => {
  const source = read('core/projectStore.js');
  assert.match(source, /deleteDirectorEpisode/);
  assert.match(source, /masterScript/);
});

test('保存按钮和添加到 AI 对话位于总剧本编辑器右上工具栏', () => {
  const source = read('src/v06/DirectorWorkspace.jsx');
  assert.match(source, /master-editor-toolbar/);
  assert.match(source, /添加到 AI 对话/);
});
