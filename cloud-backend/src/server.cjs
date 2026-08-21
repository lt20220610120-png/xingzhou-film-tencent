const http = require('node:http');
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
          response.writeHead(result.status, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify(result.body));
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
          if (action === 'unlock') return send(await unlock(payload, user, repository));
          if (action.startsWith('admin-')) return send(await handleAdminAction(action, payload, user, repository));
          if (action.startsWith('media-')) return send(await handleMediaAction(action, payload, user, repository, cosSigner));
          return send(await handleAction(action, payload, user, repository));
        } catch {
          return send({ status: 503, body: { error: '账号服务暂时不可用' } });
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
