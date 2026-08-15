const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('项目协作已删除项目只出现在最近删除，不占用正常项目网格', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /projects\.filter\(\(p\) => !p\.deleted_at\)\.map/);
  assert.match(ui, /<DeletedProjects projects=\{projects\.filter\(\(p\) => p\.deleted_at\)\}/);
  assert.doesNotMatch(ui, /collab-project-card\$\{p\.deleted_at/);
});

test('项目卡主页移除不必要的长副标题', () => {
  const hub = read('src/v06/ProjectCardHub.jsx');
  const collab = read('src/v06/CollabWorkspace.jsx');
  assert.doesNotMatch(hub, /<h1>\{title\}<\/h1><p>\{subtitle\}<\/p>/);
  assert.doesNotMatch(collab, /<h1>项目协作<\/h1>\s*<p>制片开启项目/);
});

test('海洋视觉令牌包含水光焦散、玻璃边缘和安全文字区', () => {
  const css = read('src/ocean-theme.css');
  assert.match(css, /--sea-caustic/);
  assert.match(css, /--glass-edge/);
  assert.match(css, /ocean-caustic/);
  assert.match(css, /text-safe/);
});
