const http = require('node:http');
const { readConfig } = require('./config.cjs');
const { createRepository } = require('./postgres-repository.cjs');
const { login, register, session, tokenHash } = require('./auth.cjs');
const { handleAction } = require('./collab.cjs');

function createServer(env = process.env) {
  const config = readConfig(env);
  const repository = createRepository(config.databaseUrl);
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
        let payload;
        try { payload = JSON.parse(raw || '{}'); } catch { response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify({ error: 'invalid_json' })); return; }
        const action = request.url === '/api/gateway' ? payload.action : 'login';
        let result;
        if (action === 'login') result = await login(payload, repository);
        else if (action === 'register') result = await register(payload, repository);
        else if (action === 'session') result = await session(String(request.headers.authorization || '').replace(/^Bearer\s+/i, ''), repository);
        else {
          const bearer = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
          const user = await repository.findBySession(tokenHash(bearer));
          result = await handleAction(action, payload, user, repository);
        }
        response.writeHead(result.status, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(result.body));
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

module.exports = { createServer };
