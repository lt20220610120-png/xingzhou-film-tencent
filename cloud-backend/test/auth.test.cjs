const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../src/password.cjs');
const { login } = require('../src/auth.cjs');

test('登录成功返回公开账号和会话令牌，不返回密码哈希', async () => {
  const passwordHash = hashPassword('correct-password');
  const result = await login({ username: 'Alice', password: 'correct-password' }, {
    findUser: async () => ({ id: 'u1', username: 'alice', display_name: 'Alice', email: 'a@example.com', password_hash: passwordHash, roles: ['creator'], active_role: 'creator', is_admin: false, is_producer: false, banned: false }),
    createSession: async () => 'session-token',
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.token, 'session-token');
  assert.equal(result.body.account.username, 'alice');
  assert.equal(Object.hasOwn(result.body.account, 'password_hash'), false);
});

test('错误密码和不存在账号统一返回 401', async () => {
  const repository = { findUser: async () => null, createSession: async () => 'unused' };
  assert.equal((await login({ username: 'missing', password: 'bad' }, repository)).status, 401);
  const hash = hashPassword('right');
  const wrong = await login({ username: 'alice', password: 'bad' }, { findUser: async () => ({ username: 'alice', password_hash: hash, banned: false }), createSession: async () => 'unused' });
  assert.equal(wrong.status, 401);
});

test('数据库异常返回 503，不伪装成密码错误', async () => {
  const result = await login({ username: 'alice', password: 'bad' }, { findUser: async () => { throw new Error('db unavailable'); } });
  assert.deepEqual(result, { status: 503, body: { error: '账号服务暂时不可用' } });
});
