const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mirrorFor } = require('./update-manifest.cjs');

test('更新主源必须是实时的 raw 地址，不能用带缓存的 CDN', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
  const line = src.split('\n').find((l) => l.includes('const UPDATE_MANIFEST_URL'));
  assert.ok(line, '缺少 UPDATE_MANIFEST_URL');
  assert.match(line, /raw\.githubusercontent\.com/);
  assert.doesNotMatch(line, /cdn\.jsdelivr\.net/);
});

test('raw 主源能推导出 CDN 镜像作为备用', () => {
  const m = mirrorFor('https://raw.githubusercontent.com/o/r/main/latest.json');
  assert.equal(m, 'https://cdn.jsdelivr.net/gh/o/r@main/latest.json');
});
