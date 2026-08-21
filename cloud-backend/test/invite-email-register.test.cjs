const test = require('node:test');
const assert = require('node:assert/strict');
const { register, sendEmailCode, unlock, recover } = require('../src/auth.cjs');
const { digestInvite, normalizeInviteCode } = require('../src/invites.cjs');
const { hashEmailCode } = require('../src/email-code.cjs');

function createMemoryRepo(seed = {}) {
  const users = [...(seed.users || [])];
  const invites = [...(seed.invites || [])];
  let emailCode = seed.emailCode || null;
  return {
    users, invites,
    get emailCode() { return emailCode; },
    async findUser(username) { return users.find((u) => u.username === username) || null; },
    async findEmail(email) { return users.find((u) => u.email === email) || null; },
    async countUsers() { return users.length; },
    async createUser(input) {
      const row = {
        id: `u${users.length + 1}`, username: input.username, display_name: input.displayName,
        email: input.email, password_hash: input.passwordHash, roles: input.roles,
        active_role: input.activeRole, is_admin: input.isAdmin, is_producer: input.isProducer,
        banned: false, created_at: new Date().toISOString(),
      };
      users.push(row);
      return row;
    },
    async createSession(userId, rawToken) { return rawToken; },
    async findInviteByDigest(digest) { return invites.find((i) => i.digest === digest) || null; },
    async consumeInvite(id) { const found = invites.find((i) => i.id === id); found.used_count += 1; return found; },
    async saveEmailCode(email, codeHash, expiresAt) { emailCode = { email, code_hash: codeHash, expires_at: expiresAt }; },
    async findEmailCode(email) { return emailCode && emailCode.email === email ? emailCode : null; },
    async deleteEmailCode(email) { if (emailCode?.email === email) emailCode = null; },
    async addRole(userId, role) {
      const found = users.find((u) => u.id === userId);
      if (!found.roles.includes(role)) found.roles.push(role);
      return found;
    },
    async updatePassword() { return true; },
  };
}

const futureIso = () => new Date(Date.now() + 5 * 60000).toISOString();
const validCode = '12345678';

function inviteRow(overrides) {
  const code = overrides.code;
  return { id: overrides.id || 'i1', code, digest: digestInvite(code), kind: overrides.kind, role: overrides.role ?? null, max_uses: overrides.max_uses ?? 1, used_count: overrides.used_count ?? 0, disabled: overrides.disabled === true };
}

const basePayload = {
  username: 'director01', displayName: '行舟', email: 'boss@example.com',
  password: 'Xingzhou-123', emailCode: validCode, requestedRole: 'director',
};

test('注册必须提供邀请码，缺少邀请码时明确报错', async () => {
  const repo = createMemoryRepo({ emailCode: { email: 'boss@example.com', code_hash: hashEmailCode(validCode), expires_at: futureIso() } });
  const result = await register({ ...basePayload, inviteCode: '' }, repo);
  assert.equal(result.status, 400);
  assert.match(result.body.error, /邀请码/);
});

test('注册必须先通过邮箱验证码校验', async () => {
  const repo = createMemoryRepo({ invites: [inviteRow({ code: 'XZ-ADMIN-1', kind: 'admin' })] });
  const result = await register({ ...basePayload, emailCode: '000000', inviteCode: 'XZ-ADMIN-1' }, repo);
  assert.equal(result.status, 400);
  assert.match(result.body.error, /验证码/);
});

test('管理员邀请码注册后账号同时获得双身份、管理员和制片人权限', async () => {
  const repo = createMemoryRepo({
    invites: [inviteRow({ code: 'XZ-ADMIN-1', kind: 'admin' })],
    emailCode: { email: 'boss@example.com', code_hash: hashEmailCode(validCode), expires_at: futureIso() },
  });
  const result = await register({ ...basePayload, inviteCode: 'xz-admin-1' }, repo);
  assert.equal(result.status, 200);
  assert.equal(result.body.account.is_admin, true);
  assert.equal(result.body.account.is_producer, true);
  assert.deepEqual([...result.body.account.roles].sort(), ['creator', 'director']);
  assert.equal(repo.invites[0].used_count, 1);
  assert.equal(repo.emailCode, null);
});

test('普通身份邀请码只开通所选身份，且身份不匹配时拒绝', async () => {
  const invites = [inviteRow({ code: 'XZ-DIR-1', kind: 'role', role: 'director' })];
  const okRepo = createMemoryRepo({ invites, emailCode: { email: 'boss@example.com', code_hash: hashEmailCode(validCode), expires_at: futureIso() } });
  const ok = await register({ ...basePayload, inviteCode: 'XZ-DIR-1' }, okRepo);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.account.roles, ['director']);
  assert.equal(ok.body.account.is_admin, false);

  const badRepo = createMemoryRepo({ invites: [inviteRow({ code: 'XZ-DIR-1', kind: 'role', role: 'director' })], emailCode: { email: 'boss@example.com', code_hash: hashEmailCode(validCode), expires_at: futureIso() } });
  const bad = await register({ ...basePayload, requestedRole: 'creator', inviteCode: 'XZ-DIR-1' }, badRepo);
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /身份/);
});

test('停用或用尽的邀请码不能注册', async () => {
  const disabled = createMemoryRepo({ invites: [inviteRow({ code: 'XZ-OFF', kind: 'admin', disabled: true })], emailCode: { email: 'boss@example.com', code_hash: hashEmailCode(validCode), expires_at: futureIso() } });
  assert.equal((await register({ ...basePayload, inviteCode: 'XZ-OFF' }, disabled)).status, 400);
  const used = createMemoryRepo({ invites: [inviteRow({ code: 'XZ-USED', kind: 'admin', max_uses: 1, used_count: 1 })], emailCode: { email: 'boss@example.com', code_hash: hashEmailCode(validCode), expires_at: futureIso() } });
  assert.equal((await register({ ...basePayload, inviteCode: 'XZ-USED' }, used)).status, 400);
});

test('解锁码为已登录账号增加另一个身份，注册码不能当解锁码', async () => {
  const repo = createMemoryRepo({
    users: [{ id: 'u1', username: 'director01', email: 'boss@example.com', roles: ['director'], active_role: 'director', is_admin: false, is_producer: false, banned: false }],
    invites: [inviteRow({ code: 'XZ-UNLOCK', kind: 'unlock', max_uses: null }), inviteRow({ id: 'i2', code: 'XZ-ROLE', kind: 'role', role: 'creator' })],
  });
  const unlocked = await unlock({ inviteCode: 'XZ-UNLOCK' }, repo.users[0], repo);
  assert.equal(unlocked.status, 200);
  assert.deepEqual([...unlocked.body.account.roles].sort(), ['creator', 'director']);
  const rejected = await unlock({ inviteCode: 'XZ-ROLE' }, repo.users[0], repo);
  assert.equal(rejected.status, 400);
});

test('发送邮箱验证码会保存哈希验证码并调用邮件发送', async () => {
  const repo = createMemoryRepo();
  const sent = [];
  const result = await sendEmailCode({ email: 'Boss@Example.com' }, repo, { sendMail: async (message) => { sent.push(message); } });
  assert.equal(result.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'boss@example.com');
  assert.match(sent[0].text, /\d{8}/);
  assert.match(sent[0].html, /\d{8}/);
  const code = sent[0].text.match(/(\d{8})/)[1];
  assert.equal(repo.emailCode.code_hash, hashEmailCode(code));
  assert.doesNotMatch(JSON.stringify(repo.emailCode), new RegExp(code));
});

test('邮件服务未配置时发送验证码返回可读错误而不是崩溃', async () => {
  const repo = createMemoryRepo();
  const result = await sendEmailCode({ email: 'boss@example.com' }, repo, null);
  assert.equal(result.status, 503);
  assert.match(result.body.error, /邮件/);
});

test('找回账号需要邮箱验证码，验证后返回账号名', async () => {
  const repo = createMemoryRepo({
    users: [{ id: 'u1', username: 'director01', email: 'boss@example.com', roles: ['director'], banned: false }],
    emailCode: { email: 'boss@example.com', code_hash: hashEmailCode(validCode), expires_at: futureIso() },
  });
  const found = await recover({ username: 'director01', email: 'boss@example.com', emailCode: validCode }, repo);
  assert.equal(found.status, 200);
  assert.equal(found.body.username, 'director01');
});

test('邀请码规范化忽略大小写和空格，摘要稳定', () => {
  assert.equal(normalizeInviteCode(' xz-admin-1 '), 'XZ-ADMIN-1');
  assert.equal(digestInvite('xz-admin-1'), digestInvite('XZ-ADMIN-1'));
});

test('验证码为 8 位且有效期 1 小时，邮件同时包含纯文本与 HTML 正文', async () => {
  const { CODE_TTL_MS, generateEmailCode } = require('../src/email-code.cjs');
  const { buildMessage } = require('../src/mailer.cjs');
  assert.equal(CODE_TTL_MS, 60 * 60 * 1000);
  assert.match(generateEmailCode(), /^\d{8}$/);
  const repo = createMemoryRepo();
  const sent = [];
  await sendEmailCode({ email: 'boss@example.com' }, repo, { sendMail: async (m) => { sent.push(m); } });
  assert.match(sent[0].subject, /行舟影视/);
  assert.match(sent[0].text, /1 小时内有效/);
  const raw = buildMessage({ from: 'no-reply@example.com', ...sent[0] });
  assert.match(raw, /multipart\/alternative/);
  assert.match(raw, /text\/plain; charset=UTF-8/);
  assert.match(raw, /text\/html; charset=UTF-8/);
  // 验证码不得以明文出现在邮件头部
  assert.doesNotMatch(raw.split('\r\n\r\n')[0], /\d{8}/);
});
