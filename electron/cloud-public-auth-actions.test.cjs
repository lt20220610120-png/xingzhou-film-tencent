const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const server = fs.readFileSync(path.join(__dirname, '..', 'cloud-backend/src/server.cjs'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'cloud-backend/schema.sql'), 'utf8');
const { recover } = require('../cloud-backend/src/auth.cjs');
const { hashEmailCode } = require('../cloud-backend/src/email-code.cjs');

test('腾讯云网关在会话鉴权前支持邮箱验证码、注册与找回', () => {
  const authGate = server.indexOf('const user = await repository.findBySession');
  assert.ok(authGate > 0);
  for (const action of ['send-email-code', 'register', 'recover']) {
    const index = server.search(new RegExp("action\\s*===\\s*'" + action + "'"));
    assert.ok(index > -1 && index < authGate, action + ' 必须在会话鉴权前处理');
  }
  assert.match(server.slice(0, authGate), /licensePending[\s\S]*registerAndRedeem/);
});

test('账号表初始化脚本包含登录查询所需的制片人字段', () => {
  assert.match(schema, /is_producer\s+boolean\s+not null\s+default false/i);
});

test('找回管理员账号时同时核对账号名与已验证邮箱', async () => {
  const repository = {
    findEmailCode: async () => ({ code_hash: hashEmailCode('12345678'), expires_at: '2099-01-01' }),
    findUser: async username => username === 'director' ? { username, email: 'owner@example.test' } : null,
    deleteEmailCode: async email => assert.equal(email, 'owner@example.test'),
  };
  const payload = { username: 'Director', email: 'owner@example.test', emailCode: '12345678' };
  assert.equal((await recover({ ...payload, email: 'other@example.test' }, repository)).status, 404);
  assert.equal((await recover({ ...payload, username: 'other' }, repository)).status, 404);
  assert.equal((await recover(payload, repository)).body.username, 'director');
});
