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
  const referenceStore=deps.referenceStore || (cosSigner?require('./generation-references.cjs').createGenerationReferenceStore({directory:env.GENERATION_REFERENCE_DIR||require('node:path').join(process.cwd(),'var','generation-references'),signer:cosSigner}):null);
  const imagePreview = deps.imagePreview || (env.COS_PREVIEW_ENABLED === '1' && cosSigner
    ? require('./image-preview.cjs').createImagePreview({host:cosSigner.host,
      directory:env.COS_PREVIEW_CACHE_DIR || require('node:path').join(process.cwd(),'var','image-previews')}) : null);
  const traffic = new Map(); let trafficSince=Date.now();
  const identity=require('./win-ai-identity.cjs').createWinAIIdentity({repository,clientSecret:env.WIN_AI_OAUTH_CLIENT_SECRET,lookup:deps.winAILookup||require('./win-ai-lookup.cjs').createWinAILookup(env)});
  const identityHttp=require('./win-ai-identity.cjs').createWinAIHttpHandler(identity);
  const webAuth=require('./win-ai-web-auth.cjs').createWinAIWebAuth({repository,identity,mailer});
  const protectedSkills=deps.protectedSkills||require('./protected-skills.cjs').createProtectedSkills({directory:env.PROTECTED_SKILLS_DIR});
  const server=http.createServer((request, response) => {
    if(request.url?.startsWith('/api/win-ai/web/')){void webAuth(request,response);return;}
    if(request.url?.startsWith('/api/win-ai/')){void identityHttp(request,response);return;}
    if(require('./update-download.cjs').serveUpdate(request,response,env.UPDATE_FILES_DIR||'/opt/xingzhou-updates'))return;
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true, service: 'xingzhou-cloud-backend' }));
      return;
    }
    if (request.method === 'POST' && (request.url === '/api/auth/login' || request.url === '/api/gateway')) {
      let raw = '';
      // TCP chunks can end inside a Chinese character. StringDecoder, enabled
      // by setEncoding, preserves partial UTF-8 sequences until the next chunk.
      request.setEncoding('utf8');
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
          if(Array.isArray(user.roles)&&user.roles.length===0&&!user.is_admin&&!user.is_producer&&!['logout','win-ai-entry','profile-update','unlock'].includes(action))return send({status:403,body:{error:'当前账号可使用 Win AI；影视工作权限需由管理员开通'}});
          if (action === 'logout') { await repository.deleteSession(tokenHash(bearer)); return send({ status: 200, body: { ok: true } }); }
          if (action === 'win-ai-entry') return send({status:200,body:{ticket:await identity.issue(tokenHash(bearer),payload.challenge),expiresIn:60}});
          if(action==='profile-update')return send(await require('./profile.cjs').updateProfile(payload,user,repository));
          if (action === 'unlock') return send(await unlock(payload, user, repository));
          if(['protected-skill-start','protected-skill-status','protected-skill-cancel'].includes(action))return send(await protectedSkills(action,payload,user));
          if(['generation-reference-upload-url','generation-reference-list','generation-reference-cleanup','generation-reference-uploaded','generation-reference-release'].includes(action)){
            if(!referenceStore)return send({status:503,body:{error:'临时素材服务尚未配置'}});
            const method=({'generation-reference-upload-url':'issue','generation-reference-list':'list','generation-reference-cleanup':'cleanup','generation-reference-uploaded':'uploaded','generation-reference-release':'release'})[action];
            try{return send({status:200,body:await (method==='list'?referenceStore.list(user):referenceStore[method](payload,user))});}catch(error){return send({status:error.status||503,body:{error:error.status?error.message:'临时素材服务暂不可用，请重试'}});}
          }
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
  let referenceTimer;
  if(referenceStore){server.on('listening',()=>{const clean=()=>referenceStore.prune().catch(()=>{});clean();referenceTimer=setInterval(clean,3600*1000);referenceTimer.unref();});server.on('close',()=>clearInterval(referenceTimer));}
  return server;
}

if (require.main === module) {
  const config = readConfig();
  createServer().listen(config.port, '0.0.0.0', () => {
    process.stdout.write(`xingzhou-cloud-backend listening on ${config.port}\n`);
  });
}

module.exports = { createServer, PUBLIC_ACTIONS };
