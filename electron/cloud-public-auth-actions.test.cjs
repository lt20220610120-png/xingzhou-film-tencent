const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const edge = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/xingzhou-api/index.ts'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'scripts/supabase-setup.sql'), 'utf8');

test('Edge Function 在 Bearer 鉴权前支持邮箱验证码、注册与找回', () => {
  const authGate = edge.indexOf("const raw=bearer(request)");
  for (const action of ['send-email-code', 'register', 'recover']) {
    const index = edge.indexOf(`action==='${action}'`);
    assert.ok(index > -1 && index < authGate, `${action} 必须在会话鉴权前处理`);
  }
  assert.match(edge, /auth\.signInWithOtp/);
  assert.match(edge, /auth\.verifyOtp/);
  assert.match(edge, /passwordHash/);
});

test('账号表初始化脚本包含登录查询所需的制片人字段', () => {
  assert.match(schema, /is_producer\s+boolean\s+not null\s+default false/i);
  assert.match(schema, /alter table app_users\s+add column if not exists is_producer/i);
});

test('登录查询失败不能伪装成账号或密码错误', () => {
  assert.match(edge, /data:a,error:loginError/);
  assert.match(edge, /if\(loginError\).*return json\(\{error:'账号服务暂时不可用'\},500\)/);
});

test('找回管理员账号时同时核对账号名与已验证邮箱', () => {
  assert.match(edge, /action==='recover'.*username=requireBodyString\(body\.username\)\.toLowerCase\(\)/s);
  assert.match(edge, /eq\('username',username\)\.eq\('email',email\)/);
  assert.match(edge, /error:recoverError/);
});

test('Edge Function 使用当前 Supabase Secret Key', () => {
  assert.match(edge, /JSON\.parse\(Deno\.env\.get\('SUPABASE_SECRET_KEYS'\)/);
  assert.match(edge, /secretKeys\.default\|\|Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
});
