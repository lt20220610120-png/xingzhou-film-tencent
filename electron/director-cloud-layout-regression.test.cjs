const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('云端管理页跨越导演工作台外层网格，不再被放入235px左侧栏', () => {
  const css = read('src/ocean-theme.css');
  assert.match(css, /\.director-shell>\.director-cloud-manager\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(css, /\.director-cloud-manager\s*\{[^}]*width:\s*100%/);
});

test('云端管理页采用完整宽度标题栏和可伸缩项目列表，而不是固定窄列', () => {
  const css = read('src/ocean-theme.css');
  const jsx = read('src/v06/DirectorWorkspace.jsx');
  assert.match(jsx, /director-cloud-manager/);
  assert.match(jsx, /director-cloud-list/);
  assert.match(css, /\.director-cloud-manager>header\s*\{[^}]*display:flex/);
  assert.match(css, /\.director-cloud-list\s*\{[^}]*width:\s*100%/);
  assert.match(css, /\.director-cloud-row\s*\{[^}]*grid-template-columns:\s*48px\s+minmax\(0,1fr\)\s+auto/);
});

test('窄屏云端管理页保留横向可读布局并允许项目卡横向滚动', () => {
  const css = read('src/ocean-theme.css');
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*director-cloud-manager/);
  assert.match(css, /director-cloud-list[^}]*overflow-x:\s*auto/);
});

test('发布版本已升级而不是复用旧版本', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const atLeast = (v, base) => {
    const a = v.split('.').map(Number); const b = base.split('.').map(Number);
    for (let i = 0; i < 3; i++) { if (a[i] > b[i]) return true; if (a[i] < b[i]) return false; }
    return true;
  };
  assert.ok(atLeast(pkg.version, '1.8.4'), `package.json 版本 ${pkg.version} 不得低于 1.8.4`);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
});
