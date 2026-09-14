const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('IP 备用入口使用随包证书和固定指纹，不关闭全局 TLS 校验', () => {
  const source = fs.readFileSync(path.join(__dirname, 'cloud-access-service.cjs'), 'utf8');
  assert.match(source, /requestPinnedHttps/);
  assert.match(source, /rejectUnauthorized:\s*true/);
  assert.match(source, /servername:\s*''/);
  assert.match(source, /IP_TLS_CERT_FINGERPRINT/);
  assert.doesNotMatch(source, /NODE_TLS_REJECT_UNAUTHORIZED/);
});
