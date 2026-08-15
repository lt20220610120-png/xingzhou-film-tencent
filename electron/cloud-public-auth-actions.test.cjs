const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const edge = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/xingzhou-api/index.ts'), 'utf8');

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
