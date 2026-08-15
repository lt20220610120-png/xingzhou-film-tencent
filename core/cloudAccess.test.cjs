const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hashPassword,
  verifyPassword,
  digestInvite,
  generateInviteCode,
  validateRegistration,
  inviteGrants,
  unlockGrants,
  publicUser,
} = require('./cloudAccess.cjs');

test('注册校验：账号、密码、邮箱、身份都必须合法', () => {
  const ok = { username: 'staff01', password: 'secret88', confirmPassword: 'secret88', email: 'a@b.com', requestedRole: 'creator' };
  assert.doesNotThrow(() => validateRegistration(ok));
  assert.throws(() => validateRegistration({ ...ok, username: 'x' }), /3–24 位/);
  assert.throws(() => validateRegistration({ ...ok, password: '123' }), /至少需要 6 位/);
  assert.throws(() => validateRegistration({ ...ok, confirmPassword: 'other66' }), /两次输入的密码不一致/);
  assert.throws(() => validateRegistration({ ...ok, email: 'not-an-email' }), /有效的邮箱/);
  assert.throws(() => validateRegistration({ ...ok, requestedRole: 'boss' }), /有效的工作身份/);
});

test('密码哈希可验证且错误密码被拒绝', () => {
  const stored = hashPassword('secret88');
  assert.equal(verifyPassword('secret88', stored), true);
  assert.equal(verifyPassword('wrong-one', stored), false);
});

test('单身份邀请码只开通对应身份，身份不匹配报错', () => {
  const invite = { kind: 'role', role: 'director', disabled: false };
  assert.deepEqual(inviteGrants(invite, 'director'), { roles: ['director'], isAdmin: false });
  assert.throws(() => inviteGrants(invite, 'creator'), /不适用于内容创作者/);
});

test('全权限与管理员邀请码开通双身份，管理员额外获得管理权限', () => {
  assert.deepEqual(inviteGrants({ kind: 'full' }, 'creator'), { roles: ['creator', 'director'], isAdmin: false });
  assert.deepEqual(inviteGrants({ kind: 'admin' }, 'director'), { roles: ['creator', 'director'], isAdmin: true });
});

test('解锁码不能用于注册，普通身份码不能用于解锁', () => {
  assert.throws(() => inviteGrants({ kind: 'unlock' }, 'creator'), /不能用于注册/);
  assert.throws(() => unlockGrants({ kind: 'role', role: 'creator' }), /身份解锁码/);
  assert.deepEqual(unlockGrants({ kind: 'unlock' }), { roles: ['creator', 'director'] });
});

test('停用或超过使用次数的邀请码不可用', () => {
  assert.throws(() => inviteGrants({ kind: 'full', disabled: true }, 'creator'), /无效或已停用/);
  assert.throws(() => inviteGrants({ kind: 'full', max_uses: 1, used_count: 1 }, 'creator'), /无效或已停用/);
});

test('邀请码生成带前缀且摘要与大小写无关', () => {
  const code = generateInviteCode('role', 'creator');
  assert.match(code, /^XZC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.match(generateInviteCode('unlock'), /^XZKEY-/);
  assert.match(generateInviteCode('full'), /^XZFULL-/);
  assert.equal(digestInvite(code.toLowerCase()), digestInvite(code));
});

test('publicUser 不泄露密码哈希并标记管理员与封禁状态', () => {
  const row = { id: '1', username: 'boss', email: 'boss@x.com', password_hash: 'salt:hash', roles: ['director', 'creator'], active_role: 'director', is_admin: true, banned: false, created_at: 'now' };
  const safe = publicUser(row);
  assert.equal(safe.password_hash, undefined);
  assert.equal(safe.passwordHash, undefined);
  assert.deepEqual(safe.roles, ['creator', 'director']);
  assert.equal(safe.isAdmin, true);
  assert.equal(safe.banned, false);
});
