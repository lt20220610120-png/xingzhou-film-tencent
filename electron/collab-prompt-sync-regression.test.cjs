const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('项目协作创建时持久保存导演项目来源ID', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /collabCreateProject\(\{ name: dp\.name, directorProjectId/);
});

test('项目协作列表继续包含有导演来源ID的普通协作项目', () => {
  const fn = read('supabase/functions/xingzhou-api/index.ts');
  assert.match(fn, /COLLAB_PROJECT_SENTINEL/);
  assert.match(fn, /isCollabProject/);
  assert.doesNotMatch(fn, /\.eq\('analysis_output',''\)/);
});

test('同步导演提示词可读取本机或云端项目并支持手动重关联', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /directorCollabListProjects/);
  assert.match(ui, /sourceProject/);
  assert.match(ui, /DirectorProjectPicker/);
  assert.doesNotMatch(ui, /本机导演工作台中没有找到该项目/);
});

test('同步无法自动匹配时打开选择弹框而不是显示英文内部错误', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /setLinkPickerOpen\(true\)/);
  assert.match(ui, /只读关联/);
});
