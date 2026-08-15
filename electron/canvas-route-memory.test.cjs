const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('画布 iframe 记住最近编辑路由并在下次进入时恢复', () => {
  const app = read('src/App.jsx');
  const html = read('canvas-app/index.html');
  assert.match(app, /xz-canvas-last-route/);
  assert.match(app, /canvasRoute/);
  assert.match(app, /addEventListener\('message'/);
  assert.match(html, /postMessage/);
});
