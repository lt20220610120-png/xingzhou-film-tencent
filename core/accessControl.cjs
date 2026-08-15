const crypto = require('crypto');

const ROLE_LABELS = { creator: '内容创作者', director: '导演' };
const ROLE_ORDER = ['creator', 'director'];

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt).split(':')[1];
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function findInvite(inviteCode, { invites = [], digestInvite }) {
  const digest = digestInvite(String(inviteCode || '').trim());
  return invites.find((invite) => invite.digest === digest && invite.disabled !== true) || null;
}

function grantedRoles(account) {
  return ROLE_ORDER.filter((role) => account?.roles?.includes(role));
}

function publicAccount(account) {
  if (!account) return null;
  const { passwordHash, ...safe } = account;
  return { ...safe, roles: grantedRoles(account) };
}

function createAccount(input, options) {
  const username = normalizeUsername(input.username);
  const password = String(input.password || '');
  const requestedRole = input.requestedRole;
  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) throw new Error('账号需为 3–24 位字母、数字、下划线或短横线');
  if (password.length < 6) throw new Error('密码至少需要 6 位');
  if (!ROLE_ORDER.includes(requestedRole)) throw new Error('请选择有效的工作身份');
  const invite = findInvite(input.inviteCode, options);
  if (!invite) throw new Error('邀请码无效');
  if (invite.kind === 'role' && invite.role !== requestedRole) {
    throw new Error(`邀请码不适用于${ROLE_LABELS[requestedRole]}`);
  }
  if (!['role', 'full'].includes(invite.kind)) throw new Error('该邀请码不能用于注册');
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    username,
    displayName: String(input.displayName || username).trim(),
    passwordHash: hashPassword(password),
    roles: invite.kind === 'full' ? ROLE_ORDER : [requestedRole],
    activeRole: requestedRole,
    createdAt: now,
    updatedAt: now,
  };
}

function authenticateAccount(account, username, password) {
  return normalizeUsername(username) === account?.username && verifyPassword(password, account?.passwordHash);
}

function unlockAdditionalRole(account, input, options) {
  const invite = findInvite(input.inviteCode, options);
  if (!invite || !['unlock', 'full'].includes(invite.kind)) throw new Error('需要身份解锁邀请码');
  return { ...account, roles: ROLE_ORDER, updatedAt: new Date().toISOString() };
}

module.exports = {
  createAccount,
  authenticateAccount,
  unlockAdditionalRole,
  grantedRoles,
  publicAccount,
};
