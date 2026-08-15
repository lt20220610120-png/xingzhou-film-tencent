const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAccount,
  authenticateAccount,
  unlockAdditionalRole,
  grantedRoles,
} = require('./accessControl.cjs');

const invites = [
  { digest: 'creator-code', kind: 'role', role: 'creator' },
  { digest: 'director-code', kind: 'role', role: 'director' },
  { digest: 'owner-code', kind: 'full' },
  { digest: 'unlock-code', kind: 'unlock' },
];
const digestInvite = (value) => `${value}-code`;

test('角色邀请码只开通注册时选择的对应工作台', () => {
  const account = createAccount({ username: 'staff01', password: 'secret88', requestedRole: 'director', inviteCode: 'director' }, { invites, digestInvite });
  assert.deepEqual(grantedRoles(account), ['director']);
  assert.equal(account.activeRole, 'director');
  assert.equal(account.password, undefined);
  assert.notEqual(account.passwordHash, 'secret88');
});

test('角色不匹配的邀请码不能注册另一个工作台', () => {
  assert.throws(
    () => createAccount({ username: 'staff01', password: 'secret88', requestedRole: 'creator', inviteCode: 'director' }, { invites, digestInvite }),
    /邀请码不适用于内容创作者/,
  );
});

test('全权限邀请码注册后同时开通两个工作台', () => {
  const account = createAccount({ username: 'owner', password: 'secret88', requestedRole: 'creator', inviteCode: 'owner' }, { invites, digestInvite });
  assert.deepEqual(grantedRoles(account), ['creator', 'director']);
});

test('二层解锁邀请码为单角色账号增加另一个工作台', () => {
  const account = createAccount({ username: 'staff01', password: 'secret88', requestedRole: 'director', inviteCode: 'director' }, { invites, digestInvite });
  const unlocked = unlockAdditionalRole(account, { inviteCode: 'unlock' }, { invites, digestInvite });
  assert.deepEqual(grantedRoles(unlocked), ['creator', 'director']);
});

test('普通角色邀请码不能充当二层解锁邀请码', () => {
  const account = createAccount({ username: 'staff01', password: 'secret88', requestedRole: 'director', inviteCode: 'director' }, { invites, digestInvite });
  assert.throws(() => unlockAdditionalRole(account, { inviteCode: 'creator' }, { invites, digestInvite }), /需要身份解锁邀请码/);
});

test('账号密码可以验证，错误密码被拒绝', () => {
  const account = createAccount({ username: 'staff01', password: 'secret88', requestedRole: 'creator', inviteCode: 'creator' }, { invites, digestInvite });
  assert.equal(authenticateAccount(account, 'staff01', 'secret88'), true);
  assert.equal(authenticateAccount(account, 'staff01', 'wrong-one'), false);
});
