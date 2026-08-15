const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('旧版或损坏本地状态不能让 normalizeState 直接崩溃', () => {
  const store = read('core/projectStore.js');
  assert.match(store, /const arrayKeys = \[/);
  assert.match(store, /'directorGroups'/);
  assert.match(store, /'directorProjects'/);
  assert.match(store, /if \(!Array\.isArray\(merged\[key\]\)\) merged\[key\] = \[\]/);
});

test('账号会话缺少 roles 时仍能进入安全的身份选择页', () => {
  const app = read('src/App.jsx');
  assert.match(app, /Array\.isArray\(savedAccount\.roles\)/);
  assert.match(app, /roles: Array\.isArray\(savedAccount\.roles\) \? savedAccount\.roles : \[\]/);
});

test('生产 renderer 有错误边界，不会把异常渲染成永久白屏', () => {
  const app = read('src/App.jsx');
  const main = read('src/main.jsx');
  assert.match(app, /class RenderErrorBoundary extends React\.Component/);
  assert.match(app, /重新加载工作区/);
  assert.match(main, /RenderErrorBoundary/);
});

test('生产包在 app ready 前禁用硬件加速，规避用户显卡驱动导致 renderer 白屏', () => {
  const main = read('electron/main.cjs');
  const disableAt = main.indexOf('app.disableHardwareAcceleration()');
  const readyAt = main.indexOf('app.whenReady()');
  assert.ok(disableAt >= 0 && readyAt > disableAt);
  assert.match(main, /render-process-gone/);
  assert.match(main, /did-fail-load/);
});
