const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const cfg = require('./cloud-config.public.cjs');

// 事故背景：xingzhoufilm.cn 备案未完成期间被腾讯云拦截，
// Electron/Node 的 TLS 连接被 RST，客户端写死单一域名 => 每次退出后都登录不上。
test('公开配置提供多个候选端点，且含 IP 兜底', () => {
  assert.ok(Array.isArray(cfg.ENDPOINTS), 'ENDPOINTS 必须存在');
  assert.ok(cfg.ENDPOINTS.length >= 2, '至少要有主端点与兜底端点');
  assert.ok(cfg.gatewayUrls().every((u) => u.endsWith('/api/gateway')));
  assert.ok(cfg.ENDPOINTS.some((u) => /\d+\.\d+\.\d+\.\d+/.test(u)), '必须有 IP 兜底端点');
});

test('gateway 在首个端点网络失败时自动回退到下一个端点', async () => {
  const svc = require('./cloud-access-service.cjs');
  const realFetch = global.fetch;
  const tried = [];
  global.fetch = async (url) => {
    tried.push(url);
    if (tried.length === 1) { const e = new Error('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e; }
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  };
  try {
    const out = await svc.gateway('session', {}, 'tok');
    assert.deepEqual(out, { ok: true });
    assert.ok(tried.length >= 2, '第一个端点失败后必须尝试下一个');
  } finally { global.fetch = realFetch; }
});

test('collab-service 复用带回退的 gateway，不再各自写死域名', () => {
  const src = fs.readFileSync(path.join(__dirname, 'collab-service.cjs'), 'utf8');
  assert.match(src, /sharedGateway/);
  assert.doesNotMatch(src, /async function gateway\(/);
});
