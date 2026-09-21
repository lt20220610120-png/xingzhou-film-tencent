const http = require('node:http');
const { gzip } = require('node:zlib');
const { readConfig } = require('./config.cjs');
const { createRepository } = require('./postgres-repository.cjs');
const { createMailer } = require('./mailer.cjs');
const { login, register, session, sendEmailCode, unlock, recover, tokenHash } = require('./auth.cjs');
const { handleAction } = require('./collab.cjs');
const { handleAdminAction } = require('./admin.cjs');
const { createCosSigner } = require('./cos.cjs');
const { handleMediaAction } = require('./media.cjs');

const PUBLIC_ACTIONS = new Set(['login', 'register', 'send-email-code', 'recover']);

function createServer(env = process.env, deps = {}) {
  const config = readConfig(env);
  const repository = deps.repository || createRepository(config.databaseUrl);
  const mailer = deps.mailer !== undefined ? deps.mailer : createMailer(env);
  const cosSigner = deps.cosSigner !== undefined ? deps.cosSigner : createCosSigner(env);
  const imagePreview = deps.imagePreview || (env.COS_PREVIEW_ENABLED === '1' && cosSigner
    ? require('./image-preview.cjs').createImagePreview({host:cosSigner.host,
      directory:env.COS_PREVIEW_CACHE_DIR || require('node:path').join(process.cwd(),'var','image-previews')}) : null);
  const traffic = new Map(); let trafficSince=Date.now();
  return http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true, service: 'xingzhou-cloud-backend' }));
      return;
    }
    if (request.method === 'POST' && (request.url === '/api/auth/login' || request.url === '/api/gateway')) {
      let raw = '';
      request.on('data', (chunk) => { raw += chunk; });
      request.on('end', async () => {
        const send = (result) => {
          let data = Buffer.from(JSON.stringify(result.body));
          const rawBytes=data.length;
          // An opt-in POST protocol, not HTTP 304: authenticate and read current
          // data first, then omit an unchanged body. Older clients keep full JSON.
          if(result.status===200 && request.headers['x-xingzhou-snapshot']==='1'
            && ['project-get','project-list','director-project-get','director-project-list'].includes(payload?.action)) {
            const revision=require('node:crypto').createHash('sha256').update(data).digest('hex');
            const snapshot=request.headers['x-xingzhou-known-revision']===revision
              ? {revision,unchanged:true} : {revision,value:result.body};
            data=Buffer.from(JSON.stringify({_xzSnapshot:snapshot}));
          }
          const finish = (body, compressed = false) => {
            if (response.destroyed) return;
            response.writeHead(result.status, {
              'content-type': 'application/json; charset=utf-8',
              'content-length': body.length,
              'cache-control': 'no-store',
              vary: 'Accept-Encoding',
              ...(compressed ? { 'content-encoding': 'gzip' } : {}),
            });
            response.end(body);
            if(env.TRAFFIC_METRICS_ENABLED==='1') {
              const name=String(payload?.action||'login').replace(/[^a-z-]/g,'').slice(0,50);
              const metric=traffic.get(name)||{requests:0,rawBytes:0,sentBytes:0};
              metric.requests++;metric.rawBytes+=rawBytes;metric.sentBytes+=body.length;traffic.set(name,metric);
              if(Date.now()-trafficSince>=60000) {
                (deps.logger||console).log('gateway_traffic',Object.fromEntries(traffic));traffic.clear();trafficSince=Date.now();
              }
            }
          };
          if (data.length > 1024 && /\bgzip\b/.test(request.headers['accept-encoding'] || '')) {
            gzip(data, (error, compressed) => finish(error ? data : compressed, !error));
          } else finish(data);
        };
        let payload;
        try { payload = JSON.parse(raw || '{}'); } catch { return send({ status: 400, body: { error: 'invalid_json' } }); }
        const action = request.url === '/api/gateway' ? String(payload.action || 'session') : 'login';
        const bearer = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
        try {
          if (action === 'login') return send(await login(payload, repository));
          if (action === 'register') return send(await register(payload, repository));
          if (action === 'send-email-code') return send(await sendEmailCode(payload, repository, mailer));
          if (action === 'recover') return send(await recover(payload, repository));
          if (action === 'session') return send(await session(bearer, repository));

          const user = await repository.findBySession(tokenHash(bearer));
          if (!user) return send({ status: 401, body: { error: '请先登录账号' } });
          if (user.banned) return send({ status: 403, body: { error: '账号已被停用' } });
          if (action === 'logout') { await repository.deleteSession(tokenHash(bearer)); return send({ status: 200, body: { ok: true } }); }
          if(action==='profile-update')return send(await require('./profile.cjs').updateProfile(payload,user,repository));
          if (action === 'unlock') return send(await unlock(payload, user, repository));
          if (action.startsWith('admin-')) return send(await handleAdminAction(action, payload, user, repository));
          if (action.startsWith('media-')) return send(await handleMediaAction(action, payload, user, repository, cosSigner));
          return send(await handleAction(action, payload, user, repository, cosSigner, imagePreview));
        } catch (error) {
          // Log only operation and database code, never prompts, tokens or SQL values.
          (deps.logger || console).error('gateway_failed', { action, code: error?.code || 'unknown' });
          const message = action === 'asset-update' ? '提示词保存失败，编辑内容仍保留，请稍后重试保存' : '云端服务暂时不可用，请稍后重试';
          return send({ status: 503, body: { error: message } });
        }
      });
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'not_found' }));
  });
}

if (require.main === module) {
  const config = readConfig();
  createServer().listen(config.port, '0.0.0.0', () => {
    process.stdout.write(`xingzhou-cloud-backend listening on ${config.port}\n`);
  });
}

module.exports = { createServer, PUBLIC_ACTIONS };
