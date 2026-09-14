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
// Retry reads and idempotent storyboard writes only; ambiguous general writes
// must be checked by the caller rather than silently repeated.
const retryableAction = (action, payload) => /(?:-list|-get)$/.test(action) || ['session','project-list','assets-list','members-list','messages-list','media-list','is-producer'].includes(action) || (action==='storyboard-patch' && Boolean(payload.shotId));
async function gateway(action, payload = {}, token = '', options = {}) {
  const retryable=retryableAction(action,payload),timeoutMs=options.timeoutMs || 8000;
  const urls=orderedUrls(),attempts=retryable?[...urls,urls.at(-1)]:urls;
  for(let index=0;index<attempts.length;index++){
    const url=attempts[index],controller=new AbortController();
    let response,timer;
    try {
      const pending=(async()=>{
        response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization: `Bearer ${token}`}:{})},body:JSON.stringify({action,...payload}),signal:controller.signal});
        const text=await response.text();
        let data;try{data=text?JSON.parse(text):null;}catch{throw Object.assign(new Error('云端返回异常，请稍后重试'),{transient:true});}
        if(!response.ok)throw Object.assign(new Error(data?.error || `云端请求失败（${response.status}）`),{status:response.status,transient:[502,503,504].includes(response.status)});
        activeUrl=url;return data;
      })();
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(new Error('云端响应超时'),{timeout:true}));},timeoutMs);});
      return await Promise.race([pending,deadline]);
    } catch(error) {
      const network=error.timeout||isNetworkFailure(error)||/terminated|aborted/i.test(error.message);
      if(!network&&!error.transient)throw error;
      if(activeUrl===url)activeUrl=null;
      // A connection reset before any response may be a blocked hostname.
      // Preserve fallback for this case, but do not replay an ambiguous write.
      const preConnection=!response&&!error.timeout&&/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|CERT|ERR_TLS/.test(String(error.cause?.code||error.code||''));
      if(index+1<attempts.length&&(retryable||preConnection))continue;
      throw new Error(retryable?'云端暂时未连接，当前内容已保留，请稍后重试': '云端未确认本次保存，请刷新核对结果后重试，避免重复操作');
    } finally {clearTimeout(timer);}
  }
  throw new Error(NETWORK_ERROR);
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
