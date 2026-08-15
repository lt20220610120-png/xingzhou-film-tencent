const crypto = require('crypto');

const ROLE_LABELS = { creator: '内容创作者', director: '导演' };
const ROLE_ORDER = ['creator', 'director'];
const INVITE_KINDS = {
  role: { label: '单身份邀请码' },
  full: { label: '全权限邀请码' },
  unlock: { label: '身份解锁码' },
  admin: { label: '管理员注册码' },
};
const CODE_PREFIX = { creator: 'XZC', director: 'XZD', full: 'XZFULL', unlock: 'XZKEY', admin: 'XZADMIN' };

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(value));
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

function digestInvite(code) {
  return crypto.createHash('sha256').update(String(code || '').trim().toUpperCase()).digest('hex');
}

function generateInviteCode(kind, role) {
  const prefix = kind === 'role' ? CODE_PREFIX[role] : CODE_PREFIX[kind];
  if (!prefix) throw new Error('无效的邀请码类型');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let chunk = '';
  for (const byte of crypto.randomBytes(8)) chunk += alphabet[byte % alphabet.length];
  return `${prefix}-${chunk.slice(0, 4)}-${chunk.slice(4)}`;
}

function validateRegistration({ username, password, confirmPassword, email, requestedRole }) {
  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(normalizeUsername(username))) throw new Error('账号需为 3–24 位字母、数字、下划线或短横线');
  if (String(password || '').length < 6) throw new Error('密码至少需要 6 位');
  if (confirmPassword !== undefined && password !== confirmPassword) throw new Error('两次输入的密码不一致');
  if (!isValidEmail(email)) throw new Error('请输入有效的邮箱地址');
  if (!ROLE_ORDER.includes(requestedRole)) throw new Error('请选择有效的工作身份');
}

function inviteUsable(invite) {
  if (!invite || invite.disabled === true) return false;
  if (invite.max_uses != null && Number(invite.used_count || 0) >= Number(invite.max_uses)) return false;
  return true;
}

function inviteGrants(invite, requestedRole) {
  if (!inviteUsable(invite)) throw new Error('邀请码无效或已停用');
  if (invite.kind === 'role') {
    if (invite.role !== requestedRole) throw new Error(`邀请码不适用于${ROLE_LABELS[requestedRole]}`);
    return { roles: [requestedRole], isAdmin: false };
  }
  if (invite.kind === 'full') return { roles: [...ROLE_ORDER], isAdmin: false };
  if (invite.kind === 'admin') return { roles: [...ROLE_ORDER], isAdmin: true };
  throw new Error('该邀请码不能用于注册');
}

function unlockGrants(invite) {
  if (!inviteUsable(invite) || !['unlock', 'full', 'admin'].includes(invite.kind)) throw new Error('需要有效的身份解锁码');
  return { roles: [...ROLE_ORDER] };
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    email: row.email,
    roles: ROLE_ORDER.filter((role) => (row.roles || []).includes(role)),
    activeRole: row.active_role || (row.roles || [])[0] || 'creator',
    isAdmin: row.is_admin === true,
    isProducer: row.is_producer === true,
    banned: row.banned === true,
    createdAt: row.created_at,
  };
}

module.exports = {
  ROLE_LABELS,
  ROLE_ORDER,
  INVITE_KINDS,
  normalizeUsername,
  normalizeEmail,
  isValidEmail,
  hashPassword,
  verifyPassword,
  digestInvite,
  generateInviteCode,
  validateRegistration,
  inviteUsable,
  inviteGrants,
  unlockGrants,
  publicUser,
};
