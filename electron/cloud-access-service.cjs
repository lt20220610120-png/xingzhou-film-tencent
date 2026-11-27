const fs = require('fs');
const path = require('path');
const https = require('node:https');
const tls = require('node:tls');
const {promisify}=require('node:util');
const zlib=require('node:zlib');
const gzip=promisify(zlib.gzip);
const decompress={gzip:promisify(zlib.gunzip),deflate:promisify(zlib.inflate),br:promisify(zlib.brotliDecompress)};
const { EDGE_FUNCTION_URL, gatewayUrls, IP_TLS_CA_FILE, IP_TLS_CERT_FINGERPRINT } = require('./cloud-config.public.cjs');

let cloudFetch;
function configureCloudFetch(fetcher){cloudFetch=fetcher;}
const NETWORK_ERROR = '无法连接云端服务，请检查网络后重试';

// 端点自动回退：域名被备案拦截时自动切到服务器 IP。
// 一旦某个端点成功，就记住它，后续请求不再逐个重试。
const CANDIDATES = typeof gatewayUrls === 'function' ? gatewayUrls() : [EDGE_FUNCTION_URL];
let activeUrl = null;
const orderedUrls = () => activeUrl ? [activeUrl, ...CANDIDATES.filter((u) => u !== activeUrl)] : [...CANDIDATES];
const isNetworkFailure = (error) => {
  const code = String(error?.cause?.code || error?.code || '');
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|CERT|ERR_TLS|UND_ERR/i.test(code)
    || /net::ERR_|fetch failed|network|socket hang up/i.test(String(error?.message || ''));
};
const readAction = action => /(?:-list|-get)$/.test(action) || ['session','producer-status','is-producer','asset-image-url','media-download-url','project-local-state','project-local-share-receipt'].includes(action);
const licensePreflightActions = new Set(['license-route','license-check','license-challenge']);
const errorCode = error => String(error?.cause?.code || error?.code || '');
const certificateFailure = error => /net::ERR_CERT_/.test(String(error?.message||'')) || /^(?:CERT_HAS_EXPIRED|CERT_NOT_YET_VALID|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|ERR_TLS_CERT_ALTNAME_INVALID)$/.test(errorCode(error));
const failedBeforeConnection = error => certificateFailure(error) || /^(?:ECONNREFUSED|ENOTFOUND|EAI_AGAIN|CERT_PIN_MISSING)$/.test(errorCode(error));
const isPinnedIpUrl = (url) => /^https:\/\/106\.55\.41\.128(?:\/|$)/i.test(String(url));
const COMPRESS_THRESHOLD = 1024 * 1024;
const READ_TIMEOUTS = Object.freeze({
  'project-get': 45000,
  'director-project-get': 45000,
  'project-list': 25000,
  'director-project-list': 25000,
});
async function gatewayBody(value) {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) <= COMPRESS_THRESHOLD) return { body: text, headers: {} };
  const body = await gzip(Buffer.from(text));
  return { body, headers: { 'Content-Encoding': 'gzip', 'Content-Length': String(body.length) } };
}
const normalizedFingerprint = (value) => String(value || '').replaceAll(':', '').toUpperCase();

// The fallback endpoint uses a dedicated certificate because some networks reset
// xingzhoufilm.cn before the request reaches Nginx.  Keep the certificate public,
// pinned, and bundled with the app; no TLS verification is disabled globally.
let pinnedCa = null;
try { pinnedCa = fs.readFileSync(path.join(__dirname, IP_TLS_CA_FILE), 'utf8'); } catch { /* source-only tests or a damaged package */ }
const pinnedAgent=new https.Agent({keepAlive:true,maxSockets:8,maxFreeSockets:4,timeout:25000});
function requestPinnedHttps(url, init = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (error) { reject(error); return; }
    if (!pinnedCa) { reject(Object.assign(new Error('云端备用证书缺失，请更新行舟影视'), { code: 'CERT_PIN_MISSING' })); return; }
    const headers = { 'Accept-Encoding': 'gzip, deflate, br', ...(init.headers || {}) };
    const body = init.body == null ? Buffer.alloc(0) : Buffer.isBuffer(init.body) ? init.body : Buffer.from(String(init.body));
    if (body.length) headers['Content-Length'] = String(body.length);
    init.signal?.throwIfAborted();
    const request = https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method: init.method || 'GET',
      headers,
      agent:pinnedAgent,
      ca: pinnedCa,
      // An empty SNI is intentional: the fallback certificate is for the IP.
      servername: '',
      rejectUnauthorized: true,
      checkServerIdentity(host,certificate){
        const invalid=tls.checkServerIdentity(host,certificate);
        if(invalid)return invalid;
        if(normalizedFingerprint(certificate.fingerprint256)!==normalizedFingerprint(IP_TLS_CERT_FINGERPRINT))return Object.assign(Error('云端备用证书校验失败'),{code:'CERT_PIN_MISMATCH'});
      },
    }, (response) => {
      const chunks = [];
      response.on('aborted', () => reject(Object.assign(new Error('云端传输中断'), {code:'ECONNRESET'})));
      response.on('error', reject);
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', async () => {
        let data = Buffer.concat(chunks);
        try {
          const decode=decompress[response.headers['content-encoding']];
          if(decode)data=await decode(data);
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
    request.on('error', reject);
    if (init.signal) {
      if (init.signal.aborted) { abort(); return; }
      init.signal.addEventListener('abort', abort, { once: true });
      request.once('close', () => init.signal.removeEventListener('abort', abort));
    }
    if (body) request.write(body);
    request.end();
  });
}
function createGatewayTransport({platformFetch,pinnedFetch=requestPinnedHttps,clock=Date.now}){
  let pinnedUntil=0;
  return async (url,init,{read})=>{
    const ip=isPinnedIpUrl(url);
    if(ip&&pinnedUntil>clock())return pinnedFetch(url,init);
    try{return await platformFetch(url,init);}
    catch(error){
      if(!ip||init.signal?.aborted||!(certificateFailure(error)||read&&isNetworkFailure(error)))throw error;
      const response=await pinnedFetch(url,init);
      pinnedUntil=clock()+600000;
      return response;
    }
  };
}
const requestGateway=createGatewayTransport({platformFetch:(url,init)=>(cloudFetch||globalThis.fetch)(url,init)});
const pendingReads = new Map();
let licenseDecorator=null;
function setLicenseDecorator(decorator){licenseDecorator=decorator;}
const snapshots = require('./cloud-snapshots.cjs').createSnapshotCache();
function clearCloudReadCaches(){pendingReads.clear();snapshots.clear();}
function gateway(action, payload = {}, token = '', options = {}) {
  if (!readAction(action)) return performGateway(action,payload,token,options);
  const key = JSON.stringify([action,payload,token,options.timeoutMs]);
  if (pendingReads.has(key)) return pendingReads.get(key);
  const pending = performGateway(action,payload,token,options).finally(() => {if(pendingReads.get(key)===pending)pendingReads.delete(key);});
  pendingReads.set(key,pending);
  return pending;
}
async function performGateway(action, payload = {}, token = '', options = {}) {
  const snapshot = snapshots.prepare(action,payload,token);
  const read=readAction(action),licensePreflight=licensePreflightActions.has(action);
  const retryable=read||licensePreflight,timeoutMs=options.timeoutMs || 30000;
  const urls=orderedUrls(),attempts=options.singleAttempt?urls.slice(0,1):retryable?[...urls,urls.at(-1)]:urls;
  let forbidden=false;
  for(let index=0;index<attempts.length;index++){
    const url=attempts[index],controller=new AbortController();
    let response,timer;
    try {
      const pending=(async()=>{
        const decorated=licenseDecorator&&action!=='license-challenge'?await licenseDecorator(action,payload,token):payload;
        controller.signal.throwIfAborted();
        const encoded=await gatewayBody({...decorated,action});
        controller.signal.throwIfAborted();
        response=await requestGateway(url,{
          method:'POST',
          headers:{'Content-Type':'application/json',...snapshot?.headers,...encoded.headers,...(token?{Authorization: `Bearer ${token}`}:{})},
          body:encoded.body,
          signal:controller.signal,
          ...(!retryable?{redirect:'error'}:{}),
        },{read});
        const text=await response.text();
        let data;try{data=text?JSON.parse(text):null;}catch{
          forbidden ||= response.status===403;
          const status=response.status;
          throw Object.assign(new Error('云端返回异常，请稍后重试'),{status,transient:status<400||status===403||status>=500});
        }
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
      if(activeUrl===url&&!options.singleAttempt)activeUrl=null;
      // DNS/refused/TLS errors prove no HTTP write was delivered. A reset can
      // occur after the server committed it, so it never authorizes write replay.
      const preConnection=!response&&!error.timeout&&failedBeforeConnection(error);
      if(index+1<attempts.length&&(retryable||preConnection))continue;
      if(action==='session'&&forbidden)throw Object.assign(new Error('云端暂时无法验证登录状态'),{status:403,transient:true});
      throw Object.assign(new Error(licensePreflight?NETWORK_ERROR:retryable?'云端暂时未连接，当前内容已保留，请稍后重试': '云端未确认本次保存，请刷新核对结果后重试，避免重复操作'),{
        category:retryable?'unavailable':'unconfirmed',code:error.timeout?'CLOUD_TIMEOUT':'CLOUD_UNAVAILABLE',status:error.status||(error.timeout?504:undefined),
      });
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
    async session({allowCached,allowForbiddenCached=false,workBuddyVerification=false} = {}) {
      const expectedEpoch = sessionEpoch;
      const saved = readSession();
      if (!saved?.token) return null;
      try {
        const r = await gateway('session', {}, saved.token, workBuddyVerification ? {timeoutMs:2500} : {});
        if (sessionEpoch !== expectedEpoch || token() !== saved.token) return null;
        const a = publicAccount(r.account);
        if(!a?.id || a.banned){clearSession();return null;}
        if (!workBuddyVerification) writeSession({ token: saved.token, account: a });
        return a;
      } catch (error) {
        // Edge/WAF 403 responses do not establish application-level revocation.
        if (sessionEpoch !== expectedEpoch || token() !== saved.token) return null;
        const banned=error?.status===403&&(error.code==='ACCOUNT_BANNED'||/^账号(?:已(?:被)?)?(?:停用|封禁)[。！!]?$/.test(error.message));
        if (error?.status===401||banned) { clearSession(); return null; }
        if (workBuddyVerification && (error.transient || !error.status || error.status >= 500)) {
          throw Object.assign(new Error('暂时无法连接云端验证管理员身份，请重试'),{code:'WORKBUDDY_VERIFICATION_TEMPORARY'});
        }
        if (error?.status===403&&allowForbiddenCached&&!saved.account?.banned&&saved.account?.id) return saved.account;
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
module.exports = { createCloudAccessService, gateway, setLicenseDecorator, configureCloudFetch,createGatewayTransport,clearCloudReadCaches };
