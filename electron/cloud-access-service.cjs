const fs = require('fs');
const path = require('path');
const https = require('node:https');
const { gunzipSync, inflateSync, brotliDecompressSync, gzipSync } = require('node:zlib');
const { EDGE_FUNCTION_URL, gatewayUrls, IP_TLS_CA_FILE, IP_TLS_CERT_FINGERPRINT } = require('./cloud-config.public.cjs');

const NETWORK_ERROR = '无法连接云端服务，请检查网络后重试';

// 端点自动回退：域名被备案拦截时自动切到服务器 IP。
// 一旦某个端点成功，就记住它，后续请求不再逐个重试。
const CANDIDATES = typeof gatewayUrls === 'function' ? gatewayUrls() : [EDGE_FUNCTION_URL];
let activeUrl = null;
const orderedUrls = () => activeUrl ? [activeUrl, ...CANDIDATES.filter((u) => u !== activeUrl)] : [...CANDIDATES];
const isNetworkFailure = (error) => {
  const code = String(error?.cause?.code || error?.code || '');
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|CERT|ERR_TLS|UND_ERR/i.test(code)
    || /fetch failed|network|socket hang up/i.test(String(error?.message || ''));
};
const readAction = action => /(?:-list|-get)$/.test(action) || ['session','producer-status','is-producer','asset-image-url','media-download-url','project-local-state'].includes(action);
const licensePreflightActions = new Set(['license-route','license-check','license-challenge']);
const errorCode = error => String(error?.cause?.code || error?.code || '');
const certificateFailure = error => /^(?:CERT_HAS_EXPIRED|CERT_NOT_YET_VALID|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|ERR_TLS_CERT_ALTNAME_INVALID)$/.test(errorCode(error));
const failedBeforeConnection = error => certificateFailure(error) || /^(?:ECONNREFUSED|ENOTFOUND|EAI_AGAIN|CERT_PIN_MISSING)$/.test(errorCode(error));
const isPinnedIpUrl = (url) => /^https:\/\/106\.55\.41\.128(?:\/|$)/i.test(String(url));
const COMPRESS_THRESHOLD = 1024 * 1024;
const READ_TIMEOUTS = Object.freeze({
  'project-get': 45000,
  'director-project-get': 45000,
  'project-list': 25000,
  'director-project-list': 25000,
});
function gatewayBody(value) {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) <= COMPRESS_THRESHOLD) return { body: text, headers: {} };
  const body = gzipSync(Buffer.from(text));
  return { body, headers: { 'Content-Encoding': 'gzip', 'Content-Length': String(body.length) } };
}
const normalizedFingerprint = (value) => String(value || '').replaceAll(':', '').toUpperCase();

// The fallback endpoint uses a dedicated certificate because some networks reset
// xingzhoufilm.cn before the request reaches Nginx.  Keep the certificate public,
// pinned, and bundled with the app; no TLS verification is disabled globally.
let pinnedCa = null;
try { pinnedCa = fs.readFileSync(path.join(__dirname, IP_TLS_CA_FILE), 'utf8'); } catch { /* source-only tests or a damaged package */ }
function requestPinnedHttps(url, init = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (error) { reject(error); return; }
    if (!pinnedCa) { reject(Object.assign(new Error('云端备用证书缺失，请更新行舟影视'), { code: 'CERT_PIN_MISSING' })); return; }
    const headers = { 'Accept-Encoding': 'gzip, deflate, br', ...(init.headers || {}) };
    const body = init.body == null ? Buffer.alloc(0) : Buffer.isBuffer(init.body) ? init.body : Buffer.from(String(init.body));
    if (body.length) headers['Content-Length'] = String(body.length);
    const request = https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method: init.method || 'GET',
      headers,
      ca: pinnedCa,
      // An empty SNI is intentional: the fallback certificate is for the IP.
      servername: '',
      rejectUnauthorized: true,
    }, (response) => {
      const chunks = [];
      response.on('aborted', () => reject(Object.assign(new Error('云端传输中断'), {code:'ECONNRESET'})));
      response.on('error', reject);
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        let data = Buffer.concat(chunks);
        try {
          const encoding = response.headers['content-encoding'];
          if (encoding === 'gzip') data = gunzipSync(data);
          if (encoding === 'deflate') data = inflateSync(data);
          if (encoding === 'br') data = brotliDecompressSync(data);
        } catch (error) { reject(error); return; }
        const text = data.toString('utf8');
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode || 0,
          text: async () => text,
        });
      });
    });
    const abort = () => request.destroy(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' }));
    if (init.signal) {
      if (init.signal.aborted) { abort(); return; }
      init.signal.addEventListener('abort', abort, { once: true });
      request.once('close', () => init.signal.removeEventListener('abort', abort));
    }
    request.once('socket', (socket) => socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate();
      if (normalizedFingerprint(certificate.fingerprint256) !== normalizedFingerprint(IP_TLS_CERT_FINGERPRINT)) {
        request.destroy(Object.assign(new Error('云端备用证书校验失败'), { code: 'CERT_PIN_MISMATCH' }));
      }
    }));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}
async function requestGateway(url, init, {read}) {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (isPinnedIpUrl(url) && (certificateFailure(error) || read && isNetworkFailure(error))) {
      return requestPinnedHttps(url, init);
    }
    throw error;
  }
}
const pendingReads = new Map();
let licenseDecorator=null;
function setLicenseDecorator(decorator){licenseDecorator=decorator;}
const snapshots = require('./cloud-snapshots.cjs').createSnapshotCache();
function gateway(action, payload = {}, token = '', options = {}) {
  if (!readAction(action)) return performGateway(action,payload,token,options);
  const key = JSON.stringify([action,payload,token,options.timeoutMs]);
  if (pendingReads.has(key)) return pendingReads.get(key);
  const pending = performGateway(action,payload,token,options).finally(() => pendingReads.delete(key));
  pendingReads.set(key,pending);
  return pending;
}
async function performGateway(action, payload = {}, token = '', options = {}) {
  const snapshot = snapshots.prepare(action,payload,token);
  const read=readAction(action),licensePreflight=licensePreflightActions.has(action);
  const retryable=read||licensePreflight,timeoutMs=options.timeoutMs || 30000;
  const urls=orderedUrls(),attempts=retryable?[...urls,urls.at(-1)]:urls;
  for(let index=0;index<attempts.length;index++){
    const url=attempts[index],controller=new AbortController();
    let response,timer;
    try {
      const pending=(async()=>{
        const decorated=licenseDecorator&&action!=='license-challenge'?await licenseDecorator(action,payload,token):payload;
        controller.signal.throwIfAborted();
        const encoded=gatewayBody({...decorated,action});
        response=await requestGateway(url,{
          method:'POST',
          headers:{'Content-Type':'application/json',...snapshot?.headers,...encoded.headers,...(token?{Authorization: `Bearer ${token}`}:{})},
          body:encoded.body,
          signal:controller.signal,
          ...(!retryable?{redirect:'error'}:{}),
        },{read});
        const text=await response.text();
        let data;try{data=text?JSON.parse(text):null;}catch{throw Object.assign(new Error('云端返回异常，请稍后重试'),{transient:true});}
        if (![502,503,504].includes(response.status)) activeUrl=url;
        if(!response.ok)throw Object.assign(new Error(data?.error || `云端请求失败（${response.status}）`),{status:response.status,...(typeof data?.code==='string'?{code:data.code}:{}),transient:[502,503,504].includes(response.status)});
        activeUrl=url;return snapshots.resolve(snapshot,data);
      })();
      const deadline=new Promise((_,reject)=>{
        const readTimeout=READ_TIMEOUTS[action]||20000;
        const attemptTimeout=options.timeoutMs||(read?index?timeoutMs:readTimeout:timeoutMs);
        timer=setTimeout(()=>{controller.abort();reject(Object.assign(new Error('云端响应超时'),{timeout:true}));},attemptTimeout);
      });
      return await Promise.race([pending,deadline]);
    } catch(error) {
      const network=error.timeout||isNetworkFailure(error)||/terminated|aborted|CERT_PIN/i.test(error.message || '') || /CERT_PIN/i.test(String(error.code || ''));
      if(!network&&!error.transient)throw error;
      if(activeUrl===url)activeUrl=null;
      // DNS/refused/TLS errors prove no HTTP write was delivered. A reset can
      // occur after the server committed it, so it never authorizes write replay.
      const preConnection=!response&&!error.timeout&&failedBeforeConnection(error);
      if(index+1<attempts.length&&(retryable||preConnection))continue;
      throw new Error(licensePreflight?NETWORK_ERROR:retryable?'云端暂时未连接，当前内容已保留，请稍后重试': '云端未确认本次保存，请刷新核对结果后重试，避免重复操作');
    } finally {clearTimeout(timer);}
  }
  throw new Error(NETWORK_ERROR);
}
const publicAccount = (row) => row ? ({
  id: row.id, username: row.username, displayName: row.display_name || row.username,
  email: row.email,avatarData:row.avatar_data||'',bio:row.bio||'',tags:row.profile_tags||[], roles: row.roles || [], activeRole: row.active_role || row.roles?.[0] || 'creator',
  isAdmin: row.is_admin === true, isProducer: row.is_producer === true,
  banned: row.banned === true, createdAt: row.created_at,
}) : null;
function createCloudAccessService(userDataDir, options = {}) {
  const storage=options.safeStorage || require('electron').safeStorage;
  const store=require('./session-store.cjs').createSessionStore(userDataDir,storage);
  let sessionEpoch = 0;
  const readSession = store.read;
  const writeSession = store.write;
  const clearSession = () => {store.clear();options.onInvalidSession?.();};
  const token = () => readSession()?.token || '';
  return {
    async session({allowCached} = {}) {
      const expectedEpoch = sessionEpoch;
      const saved = readSession();
      if (!saved?.token) return null;
      try {
        const r = await gateway('session', {}, saved.token);
        if (sessionEpoch !== expectedEpoch || token() !== saved.token) return null;
        const a = publicAccount(r.account);
        if(!a?.id || a.banned){clearSession();return null;}
        writeSession({ token: saved.token, account: a });
        return a;
      } catch (error) {
        // Only an explicit 401 proves that the token is invalid. Temporary
        // network/TLS/5xx failures must not destroy the user's session.
        if (sessionEpoch !== expectedEpoch || token() !== saved.token) return null;
        if ([401,403].includes(error?.status)) { clearSession(); return null; }
        if ((!error?.status || error.status >= 500) && !saved.account?.banned && saved.account?.id && await allowCached?.()) {
          if (sessionEpoch === expectedEpoch && token() === saved.token) return saved.account;
        }
        return null;
      }
    },
    async updateProfile(payload){const expectedEpoch=sessionEpoch,saved=readSession();const r=await gateway('profile-update',payload,saved?.token||'');if(expectedEpoch!==sessionEpoch||token()!==saved?.token)throw new Error('登录状态已变化');const account=publicAccount(r.account);writeSession({...saved,account});return account;},
    async login(payload) { const expectedEpoch = ++sessionEpoch; const r = await gateway('login', payload); if (expectedEpoch !== sessionEpoch) throw new Error('登录已取消'); const a = publicAccount(r.account); writeSession({ token: r.token, account: a }); return a; },
    async logout() { const s = readSession(); sessionEpoch++; clearSession(); if (s?.token) await gateway('logout', {}, s.token).catch(() => {}); return true; },
    async sendEmailCode(payload) { return gateway('send-email-code', payload); },
    async register(payload) { const expectedEpoch=++sessionEpoch;const r = await gateway('register', payload);if(expectedEpoch!==sessionEpoch)throw new Error('注册登录已取消');const a = publicAccount(r.account);writeSession({ token: r.token, account: a });return a; },
    async unlock(payload) { const expectedEpoch=sessionEpoch,saved=readSession();const r = await gateway('unlock', payload, saved?.token||'');if(expectedEpoch!==sessionEpoch||token()!==saved?.token)throw new Error('登录状态已变化');const a = publicAccount(r.account); writeSession({ token: r.token || saved.token, account: a }); return a; },
    async recover(payload) { return gateway('recover', payload); },
    async adminListUsers() { return gateway('admin-list-users', {}, token()); },
    async adminDeleteUser(payload) { return gateway('admin-delete-user', payload, token()); },
    async adminSetBanned(payload) { return gateway('admin-set-banned', payload, token()); },
    async adminCreateInvite(payload) { return gateway('admin-create-invite', payload, token()); },
    async adminListInvites() { return gateway('admin-list-invites', {}, token()); },
    async adminDisableInvite(payload) { return gateway('admin-disable-invite', payload, token()); },
    token, readSession, readAccount: () => readSession()?.account || null,
  };
}
module.exports = { createCloudAccessService, gateway, setLicenseDecorator };
