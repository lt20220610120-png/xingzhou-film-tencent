const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('注册窗口包含邮箱与验证码字段，并有发送验证码按钮', () => {
  const src = read('src/v06/AccountAccess.jsx');
  assert.match(src, /邮箱验证码/);
  assert.match(src, /SendCodeButton/);
  assert.match(src, /authSendEmailCode/);
  assert.match(src, /邮箱收到的验证码/);
  assert.match(src, /创建账号/);
});

test('注册窗口支持找回账号（邮箱+验证码）', () => {
  const src = read('src/v06/AccountAccess.jsx');
  assert.match(src, /找回账号/);
  assert.match(src, /authRecover/);
  assert.match(src, /authRecover\(\{ username: form\.username, email: form\.email/);
  assert.match(src, /mode === 'recover' \? '请输入要找回的账号'/);
});

test('登录错误只显示用户可读信息，不暴露 Electron IPC 技术前缀', () => {
  const src = read('src/v06/AccountAccess.jsx');
  assert.match(src, /humanizeError/);
  assert.match(src, /Error invoking remote method/);
  assert.match(src, /setError\(humanizeError\(reason/);
});

test('主进程注册云端账号与管理后台全部 IPC 通道', () => {
  const src = read('electron/main.cjs');
  for (const channel of ['auth-send-email-code', 'auth-recover', 'admin-list-users', 'admin-delete-user', 'admin-set-banned', 'admin-create-invite', 'admin-list-invites', 'admin-disable-invite']) {
    assert.match(src, new RegExp(`ipcMain\\.handle\\('${channel}'`), `main.cjs 缺少 ${channel}`);
  }
  assert.match(src, /createCloudAccessService/);
});

test('preload 暴露对应的渲染端 API', () => {
  const src = read('electron/preload.cjs');
  for (const api of ['authSendEmailCode', 'authRecover', 'adminListUsers', 'adminDeleteUser', 'adminSetBanned', 'adminCreateInvite', 'adminListInvites', 'adminDisableInvite']) {
    assert.match(src, new RegExp(api), `preload.cjs 缺少 ${api}`);
  }
});

test('管理后台入口只对管理员显示且普通视图不渲染 AdminPanel', () => {
  const src = read('src/App.jsx');
  assert.match(src, /account\?\.isAdmin \? \[\['admin', ShieldCheck, '管理后台'\]\] : \[\]/);
  assert.match(src, /nav === 'admin' && account\?\.isAdmin && <AdminPanel/);
});

test('管理后台具备用户管理与邀请码生成能力', () => {
  const src = read('src/v06/AdminPanel.jsx');
  assert.match(src, /adminListUsers/);
  assert.match(src, /adminCreateInvite/);
  assert.match(src, /adminDeleteUser/);
  assert.match(src, /adminSetBanned/);
  assert.match(src, /身份解锁码/);
  assert.match(src, /DeleteConfirm/);
});

test('客户端账号服务只使用 Edge Function Token，不再包含服务端密钥', () => {
  const src = read('electron/cloud-access-service.cjs');
  assert.match(src, /EDGE_FUNCTION_URL/);
  assert.match(src, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(src, /SECRET_KEY|service_role|\/rest\/v1\//i);
});

test('公开云端配置不包含服务端密钥', () => {
  const src = read('electron/cloud-config.public.cjs');
  assert.match(src, /supabase\.co/);
  assert.match(src, /EDGE_FUNCTION_URL/);
  assert.doesNotMatch(src, /SECRET_KEY|sb_secret_/);
});

test('打包配置必须包含 core 目录（主进程运行时依赖）', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.build.files.includes('core/**/*'), 'package.json build.files 缺少 core/**/*，打包后主进程会因找不到 ../core/cloudAccess.cjs 而崩溃');
});
