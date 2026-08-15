const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('无限画布应用（canvas-app）已随安装包打包', () => {
  assert.ok(fs.existsSync(path.join(root, 'canvas-app/index.html')), 'canvas-app/index.html 不存在，需要先构建 infinite-canvas 并复制到 canvas-app/');
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.build.files.includes('canvas-app/**/*'), 'package.json build.files 缺少 canvas-app/**/*');
});

test('canvas-app 使用相对资源路径与 hash 路由（file:// 下可运行）', () => {
  const html = read('canvas-app/index.html');
  assert.match(html, /src="\.\/assets\//, '资源必须是相对路径（VITE_BASE=./）');
  assert.doesNotMatch(html, /src="\/assets\//, '出现了绝对路径资源，file:// 协议下会白屏');
});

test('内嵌无限画布已同步上游 v0.15.1', () => {
  const assetsDir = path.join(root, 'canvas-app/assets');
  const source = fs.readdirSync(assetsDir).filter((name) => name.endsWith('.js')).map((name) => fs.readFileSync(path.join(assetsDir, name), 'utf8')).join('\n');
  assert.match(source, /v0\.15\.1/);
  assert.doesNotMatch(source, /const [A-Za-z_$][\w$]*="v0\.14\.0"/);
});

test('主进程提供 open-canvas-window，独立窗口通过 xzapp 协议加载 canvas-app', () => {
  const src = read('electron/main.cjs');
  assert.match(src, /ipcMain\.handle\('open-canvas-window'/);
  assert.match(src, /xzapp:\/\/canvas\/index\.html/);
  assert.match(src, /registerCanvasAppProtocol/);
  assert.match(src, /scheme:'xzapp'/);
  assert.match(src, /无限画布/);
});

test('preload 暴露 openCanvasWindow，画布内嵌在主界面右侧内容区', () => {
  assert.match(read('electron/preload.cjs'), /openCanvasWindow/);
  const app = read('src/App.jsx');
  assert.match(app, /className="canvas-embed" src="xzapp:\/\/canvas\/index\.html#\/canvas"/, '画布必须以内嵌 iframe 直接恢复到画布路由');
  assert.match(app, /\['canvas', Palette, '画布'\]/);
  assert.match(read('src/canvas.css'), /\.canvas-embed\{display:block;width:100%;height:100vh/);
});
