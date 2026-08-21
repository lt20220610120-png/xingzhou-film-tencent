const test = require('node:test');
const assert = require('node:assert/strict');
const { readConfig } = require('../src/config.cjs');

test('云端服务要求 API_SECRET，且不把服务端配置暴露给客户端', () => {
  assert.throws(() => readConfig({}), /API_SECRET/);
  const config = readConfig({ API_SECRET: 'test-secret', DATABASE_URL: 'postgres://test', PORT: '4310' });
  assert.equal(config.port, 4310);
  assert.equal(config.apiSecret, 'test-secret');
  assert.equal(config.databaseUrl, 'postgres://test');
});
