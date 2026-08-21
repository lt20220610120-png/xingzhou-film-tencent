const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/server.cjs');

test('云端健康检查只返回公开状态，不返回密钥或数据库地址', async () => {
  const server = createServer({ API_SECRET: 'test-secret', DATABASE_URL: 'postgres://test', PORT: '0' });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'xingzhou-cloud-backend' });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
