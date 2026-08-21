const crypto = require('node:crypto');
const { verifyPassword, hashPassword } = require('./password.cjs');
const { digestInvite, inviteUsable, rolesForInvite, normalizeInviteCode } = require('./invites.cjs');
const { hashEmailCode, generateEmailCode, codeExpiry, emailCodeValid } = require('./email-code.cjs');

const publicAccount = (row) => ({ id: row.id, username: row.username, display_name: row.display_name || row.username, email: row.email || '', roles: row.roles || [], active_role: row.active_role || row.roles?.[0] || 'creator', is_admin: row.is_admin === true, is_producer: row.is_producer === true, banned: row.banned === true, created_at: row.created_at });
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => crypto.randomUUID() + '-' + crypto.randomUUID();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function login(payload, repository) {
  const username = String(payload?.username || '').trim().toLowerCase();
  const password = String(payload?.password || '');
  if (!username || !password) return { status: 400, body: { error: '请输入账号和密码' } };
  let user;
  try { user = await repository.findUser(username); } catch { return { status: 503, body: { error: '账号服务暂时不可用' } }; }
  if (!user || user.banned || !verifyPassword(password, user.password_hash)) return { status: 401, body: { error: '账号或密码不正确' } };
  const token = await repository.createSession(user.id, newToken());
  return { status: 200, body: { token, account: publicAccount(user) } };
}

async function sendEmailCode(payload, repository, mailer) {
  const email = String(payload?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { status: 400, body: { error: '请输入有效的邮箱地址' } };
  if (!mailer?.sendMail) return { status: 503, body: { error: '邮件服务尚未配置，请联系管理员' } };
  const code = generateEmailCode();
  try {
    await repository.saveEmailCode(email, hashEmailCode(code), codeExpiry());
    await mailer.sendMail({ to: email, subject: '行舟影视验证码', text: `你的行舟影视验证码是 ${code}，10 分钟内有效。若非本人操作请忽略。` });
  } catch { return { status: 503, body: { error: '验证码发送失败，请稍后重试' } }; }
  return { status: 200, body: { ok: true } };
}

async function verifyEmailCode(repository, email, submitted) {
  const saved = await repository.findEmailCode(email);
  return emailCodeValid(saved, submitted);
}

async function register(payload, repository) {
  const username = String(payload?.username || '').trim().toLowerCase();
  const email = String(payload?.email || '').trim().toLowerCase();
  const password = String(payload?.password || '');
  const requestedRole = payload?.requestedRole === 'director' ? 'director' : 'creator';
  const inviteCode = normalizeInviteCode(payload?.inviteCode);
  if (!/^[a-z0-9_]{3,32}$/.test(username) || password.length < 6 || !EMAIL_RE.test(email)) return { status: 400, body: { error: '账号、邮箱或密码格式不正确' } };
  if (!inviteCode) return { status: 400, body: { error: '请输入管理员发放的邀请码' } };
  try {
    if (!await verifyEmailCode(repository, email, payload?.emailCode)) return { status: 400, body: { error: '邮箱验证码无效或已过期' } };
    const invite = await repository.findInviteByDigest(digestInvite(inviteCode));
    if (!inviteUsable(invite)) return { status: 400, body: { error: '邀请码无效、已停用或已用完' } };
    const grant = rolesForInvite(invite, requestedRole);
    if (grant.error) return { status: 400, body: { error: grant.error } };
    if (await repository.findUser(username)) return { status: 409, body: { error: '账号已存在' } };
    if (await repository.findEmail(email)) return { status: 409, body: { error: '邮箱已绑定其他账号' } };
    const user = await repository.createUser({
      username, email, displayName: String(payload.displayName || username).trim(),
      passwordHash: hashPassword(password), roles: grant.roles,
      activeRole: grant.roles.includes(requestedRole) ? requestedRole : grant.roles[0],
      isAdmin: grant.isAdmin, isProducer: grant.isProducer,
    });
    await repository.consumeInvite(invite.id);
    await repository.deleteEmailCode(email);
    const token = await repository.createSession(user.id, newToken());
    return { status: 200, body: { token, account: publicAccount(user) } };
  } catch { return { status: 503, body: { error: '账号服务暂时不可用' } }; }
}

async function unlock(payload, user, repository) {
  if (!user) return { status: 401, body: { error: '请先登录账号' } };
  const inviteCode = normalizeInviteCode(payload?.inviteCode);
  if (!inviteCode) return { status: 400, body: { error: '请输入身份解锁邀请码' } };
  try {
    const invite = await repository.findInviteByDigest(digestInvite(inviteCode));
    if (!inviteUsable(invite)) return { status: 400, body: { error: '邀请码无效、已停用或已用完' } };
    if (invite.kind !== 'unlock') return { status: 400, body: { error: '该邀请码不是身份解锁码' } };
    const missing = ['creator', 'director'].find((role) => !(user.roles || []).includes(role));
    if (!missing) return { status: 200, body: { account: publicAccount(user) } };
    const updated = await repository.addRole(user.id, missing);
    await repository.consumeInvite(invite.id);
    return { status: 200, body: { account: publicAccount(updated) } };
  } catch { return { status: 503, body: { error: '账号服务暂时不可用' } }; }
}

async function recover(payload, repository) {
  const email = String(payload?.email || '').trim().toLowerCase();
  const username = String(payload?.username || '').trim().toLowerCase();
  if (!username) return { status: 400, body: { error: '请输入要找回的账号' } };
  try {
    if (!await verifyEmailCode(repository, email, payload?.emailCode)) return { status: 400, body: { error: '邮箱验证码无效或已过期' } };
    const user = await repository.findUser(username);
    if (!user || String(user.email || '').toLowerCase() !== email) return { status: 404, body: { error: '账号与邮箱不匹配' } };
    const next = String(payload?.newPassword || '');
    if (next) {
      if (next.length < 6) return { status: 400, body: { error: '密码至少需要 6 位' } };
      await repository.updatePassword(user.id, hashPassword(next));
    }
    await repository.deleteEmailCode(email);
    return { status: 200, body: { username: user.username } };
  } catch { return { status: 503, body: { error: '账号服务暂时不可用' } }; }
}

async function session(rawToken, repository) {
  if (!rawToken) return { status: 401, body: { error: '登录已失效，请重新登录' } };
  try { const user = await repository.findBySession(tokenHash(rawToken)); return user ? { status: 200, body: { account: publicAccount(user) } } : { status: 401, body: { error: '登录已失效，请重新登录' } }; } catch { return { status: 503, body: { error: '账号服务暂时不可用' } }; }
}

module.exports = { login, register, session, sendEmailCode, unlock, recover, publicAccount, tokenHash };
