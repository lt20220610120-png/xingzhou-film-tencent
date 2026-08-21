const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('./cloud-config.public.cjs');

test('客户端云端地址必须使用 HTTPS，禁止明文 HTTP', () => {
  assert.match(config.EDGE_FUNCTION_URL, /^https:\/\//);
  assert.match(config.SUPABASE_URL, /^https:\/\//);
  assert.doesNotMatch(config.EDGE_FUNCTION_URL, /^http:\/\//);
});

test('云端地址使用正式域名而不是裸 IP', () => {
  assert.match(config.EDGE_FUNCTION_URL, /xingzhoufilm\.cn/);
  assert.doesNotMatch(config.EDGE_FUNCTION_URL, /\d+\.\d+\.\d+\.\d+/);
});

test('公开配置不包含任何服务端密钥', () => {
  const raw = JSON.stringify(config);
  assert.doesNotMatch(raw, /SECRET|secret|PASS|password|AKID/);
  assert.equal(config.PUBLISHABLE_KEY, '');
});
