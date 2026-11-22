const test = require('node:test');
const assert = require('node:assert/strict');
const { mirrorFor } = require('./update-manifest.cjs');
const { TRUSTED_MANIFEST_URL } = require('./update-trust.cjs');

test('更新主源必须是实时的 raw 地址，不能用带缓存的 CDN', () => {
  assert.equal(new URL(TRUSTED_MANIFEST_URL).hostname, 'raw.githubusercontent.com');
  assert.match(TRUSTED_MANIFEST_URL, /\/main\/latest\.json$/);
});

test('raw 主源能推导出 CDN 镜像作为备用', () => {
  const m = mirrorFor('https://raw.githubusercontent.com/o/r/main/latest.json');
  assert.equal(m, 'https://cdn.jsdelivr.net/gh/o/r@main/latest.json');
});
