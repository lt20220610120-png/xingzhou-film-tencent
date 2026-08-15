const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('行舟AI拖动边界以主导航右边缘为最小横坐标', () => {
  const app = read('src/App.jsx');
  assert.match(app, /getElementById\(['"]app-sidebar['"]\)/);
  assert.match(app, /sidebarRect\?\.right/);
  assert.match(app, /Math\.max\(minLeft/);
});

test('导演云刷新按钮进入标题工具栏而不是固定悬浮遮挡', () => {
  const ui = read('src/v06/DirectorWorkspace.jsx');
  const css = read('src/collab.css');
  assert.match(ui, /master-title-tools/);
  assert.match(ui, /刷新云端/);
  assert.doesNotMatch(css, /\.director-cloud-refresh\{position:fixed/);
});

test('设定和小传始终占据第一个分集槽，即使内容为空', () => {
  const parser = read('core/scriptImport.js');
  assert.match(parser, /kind:\s*'setting'/);
  assert.match(parser, /episodes:\s*\[\{\s*title:\s*'设定和小传'/);
});

test('设定和小传使用纯文本编辑器，不进入场景导演器', () => {
  const ui = read('src/v06/DirectorWorkspace.jsx');
  assert.match(ui, /SettingEditor/);
  assert.match(ui, /activeEpisode\.kind === 'setting'/);
  assert.match(ui, /episodeNumber/);
});

test('总剧本编辑区域采用全宽工作区与更大高度', () => {
  const css = read('src/collab.css');
  assert.match(css, /\.director-master\{max-width:none/);
  assert.match(css, /\.director-master \.master-editor\{min-height:calc\(100vh - 150px\)/);
});

test('全局视觉定义海洋主题设计令牌及航线签名元素', () => {
  const css = read('src/ocean-theme.css');
  assert.match(css, /--ocean-abyss/);
  assert.match(css, /--ocean-foam/);
  assert.match(css, /\.content::before/);
  assert.match(css, /prefers-reduced-motion/);
});
