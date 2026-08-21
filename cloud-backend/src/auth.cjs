const crypto = require('node:crypto');
const { verifyPassword, hashPassword } = require('./password.cjs');

const publicAccount = (row) => ({ id: row.id, username: row.username, display_name: row.display_name || row.username, email: row.email || '', roles: row.roles || [], active_role: row.active_role || row.roles?.[0] || 'creator', is_admin: row.is_admin === true, is_producer: row.is_producer === true, banned: row.banned === true, created_at: row.created_at });
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function login(payload, repository) {
  const username = String(payload?.username || '').trim().toLowerCase();
  const password = String(payload?.password || '');
  if (!username || !password) return { status: 400, body: { error: '请输入账号和密码' } };
  let user;
  try { user = await repository.findUser(username); } catch { return { status: 503, body: { error: '账号服务暂时不可用' } }; }
  if (!user || user.banned || !verifyPassword(password, user.password_hash)) return { status: 401, body: { error: '账号或密码不正确' } };
  const rawToken = crypto.randomUUID() + '-' + crypto.randomUUID();
  const token = await repository.createSession(user.id, rawToken);
  return { status: 200, body: { token, account: publicAccount(user) } };
}

async function register(payload, repository) {
  const username = String(payload?.username || '').trim().toLowerCase();
  const email = String(payload?.email || '').trim().toLowerCase();
  const password = String(payload?.password || '');
  const role = payload?.requestedRole === 'director' ? 'director' : 'creator';
  if (!/^[a-z0-9_]{3,32}$/.test(username) || password.length < 6 || !email.includes('@')) return { status: 400, body: { error: '账号、邮箱或密码格式不正确' } };
  try {
    if (await repository.findUser(username)) return { status: 409, body: { error: '账号已存在' } };
    if (await repository.findEmail(email)) return { status: 409, body: { error: '邮箱已绑定其他账号' } };
    const first = await repository.countUsers() === 0;
    const user = await repository.createUser({ username, email, displayName: String(payload.displayName || username).trim(), passwordHash: hashPassword(password), role, isAdmin: first, isProducer: first });
    const rawToken = crypto.randomUUID() + '-' + crypto.randomUUID();
    const token = await repository.createSession(user.id, rawToken);
    return { status: 200, body: { token, account: publicAccount(user) } };
  } catch { return { status: 503, body: { error: '账号服务暂时不可用' } }; }
}

async function session(rawToken, repository) {
  if (!rawToken) return { status: 401, body: { error: '登录已失效，请重新登录' } };
  try { const user = await repository.findBySession(tokenHash(rawToken)); return user ? { status: 200, body: { account: publicAccount(user) } } : { status: 401, body: { error: '登录已失效，请重新登录' } }; } catch { return { status: 503, body: { error: '账号服务暂时不可用' } }; }
}

module.exports = { login, register, session, publicAccount, tokenHash };
