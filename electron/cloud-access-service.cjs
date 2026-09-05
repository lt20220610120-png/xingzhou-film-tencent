const fs = require('fs');
const path = require('path');
const { EDGE_FUNCTION_URL, gatewayUrls } = require('./cloud-config.public.cjs');

const NETWORK_ERROR = '无法连接云端服务，请检查网络后重试';

// 端点自动回退：域名被备案拦截时自动切到服务器 IP。
// 一旦某个端点成功，就记住它，后续请求不再逐个重试。
const CANDIDATES = typeof gatewayUrls === 'function' ? gatewayUrls() : [EDGE_FUNCTION_URL];
let activeUrl = null;
const orderedUrls = () => (activeUrl ? [activeUrl, ...CANDIDATES.filter((u) => u !== activeUrl)] : [...CANDIDATES]);
const isNetworkFailure = (error) => {
  const code = String(error?.cause?.code || error?.code || '');
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|CERT|ERR_TLS|UND_ERR/i.test(code)
    || /fetch failed|network|socket hang up/i.test(String(error?.message || ''));
};
async function gateway(action, payload = {}, token = '') {
  let lastNetworkError = null;
  for (const url of orderedUrls()) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action, ...payload }),
      });
    } catch (error) {
      // 该端点不可达（域名被拦截 / TLS 被重置）：记下来，换下一个端点。
      if (isNetworkFailure(error)) { lastNetworkError = error; if (activeUrl === url) activeUrl = null; continue; }
      throw new Error(NETWORK_ERROR);
    }
    activeUrl = url;
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* noop */ }
    if (!response.ok) {
      const error = new Error(data?.error || `云端请求失败（${response.status}）`);
      error.status = response.status;
      throw error;
    }
    return data;
  }
  throw new Error(NETWORK_ERROR + (lastNetworkError ? '' : ''));
}
const publicAccount = (row) => row ? ({
  id: row.id, username: row.username, displayName: row.display_name || row.username,
  email: row.email, roles: row.roles || [], activeRole: row.active_role || row.roles?.[0] || 'creator',
  isAdmin: row.is_admin === true, isProducer: row.is_producer === true,
  banned: row.banned === true, createdAt: row.created_at,
}) : null;
function createCloudAccessService(userDataDir) {
  const sessionFile = path.join(userDataDir, 'cloud-session.json');
  const readSession = () => { try { return JSON.parse(fs.readFileSync(sessionFile, 'utf8')); } catch { return null; } };
  const writeSession = (value) => { fs.mkdirSync(path.dirname(sessionFile), { recursive: true }); fs.writeFileSync(sessionFile, JSON.stringify(value, null, 2), 'utf8'); };
  const clearSession = () => { try { fs.unlinkSync(sessionFile); } catch { /* noop */ } };
  const token = () => readSession()?.token || '';
  return {
    async session() {
      const saved = readSession();
      if (!saved?.token) return null;
      try {
        const r = await gateway('session', {}, saved.token);
        const a = publicAccount(r.account);
        writeSession({ token: saved.token, account: a });
        return a;
      } catch (error) {
        // Only an explicit 401 proves that the token is invalid. Temporary
        // network/TLS/5xx failures must not destroy the user's session.
        if (error?.status === 401) clearSession();
        return null;
      }
    },
    async login(payload) { const r = await gateway('login', payload); const a = publicAccount(r.account); writeSession({ token: r.token, account: a }); return a; },
    async logout() { const s = readSession(); if (s?.token) await gateway('logout', {}, s.token).catch(() => {}); clearSession(); return true; },
    async sendEmailCode(payload) { return gateway('send-email-code', payload); },
    async register(payload) { const r = await gateway('register', payload); const a = publicAccount(r.account); writeSession({ token: r.token, account: a }); return a; },
    async unlock(payload) { const r = await gateway('unlock', payload, token()); const a = publicAccount(r.account); writeSession({ token: r.token || token(), account: a }); return a; },
    async recover(payload) { return gateway('recover', payload); },
    async adminListUsers() { return gateway('admin-list-users', {}, token()); },
    async adminDeleteUser(payload) { return gateway('admin-delete-user', payload, token()); },
    async adminSetBanned(payload) { return gateway('admin-set-banned', payload, token()); },
    async adminCreateInvite(payload) { return gateway('admin-create-invite', payload, token()); },
    async adminListInvites() { return gateway('admin-list-invites', {}, token()); },
    async adminDisableInvite(payload) { return gateway('admin-disable-invite', payload, token()); },
    token, readAccount: () => readSession()?.account || null,
  };
}
module.exports = { createCloudAccessService, gateway };
