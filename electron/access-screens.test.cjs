const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

const REMOVED_COPY = [
  '输入卡密，激活这台电脑上的软件。',
  '开启你的创作旅程',
  '填写以下信息，安全访问你的工作台。',
  '邀请码控制访问权限',
  '一个邮箱绑定一个账号',
  '邀请码由管理员发放，并决定账号能够使用的工作台。',
  '行舟影视 · 创作空间',
];

test('注册页只保留必要结构：字段、发送验证码与主操作，不堆说明文案', async () => {
  const { createServer } = await import('vite');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { RegistrationScreen } = await server.ssrLoadModule('/src/v06/AccountAccess.jsx');
    const html = renderToStaticMarkup(React.createElement(RegistrationScreen, { onClose() {}, onRegistered() {}, onLogin() {}, initialMode: 'register' }));

    for (const copy of REMOVED_COPY) assert.equal(html.includes(copy), false, `冗余文案仍在渲染：${copy}`);
    for (const label of ['账号', '姓名或称呼', '密码', '确认密码', '邮箱', '邮箱验证码', '邀请码']) assert.ok(html.includes(`>${label}<`), `缺少必要表单标签：${label}`);
    assert.ok(html.includes('发送验证码'), '缺少发送验证码按钮');
    assert.ok(html.includes('创建账号'), '缺少主操作按钮');

    // 注册字段按两列紧凑排布，减少纵向高度，避免表单被窗口裁切
    assert.ok(html.includes('auth-field-grid'), '注册字段未使用紧凑两列布局');
  } finally {
    await server.close();
  }
});

test('激活页不再有说明行，主操作只有一个提交按钮', async () => {
  const { createServer } = await import('vite');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const { SoftwareLicenseBoundary } = await server.ssrLoadModule('/src/v06/SoftwareLicense.jsx');
    const api = { licenseCheck: async () => ({ status: 'required', allowed: false }), onLicenseState: () => () => {} };
    const html = renderToStaticMarkup(React.createElement(SoftwareLicenseBoundary, { api }, React.createElement('div', null, 'workspace')));
    assert.equal(html.includes('输入卡密，激活这台电脑上的软件。'), false, '说明行应已移除');
    assert.ok(html.includes('激活行舟影视'), '标题应保留');
    assert.ok(html.includes('卡密'), '卡密字段应保留');
    assert.equal((html.match(/type="submit"/g) || []).length, 1, '主操作只应有一个提交按钮');
    assert.ok(/正在验证…|验证并激活/.test(html), '提交按钮应显示主操作');
    assert.equal(html.includes('登录管理员账号'), false, '不得添加管理员专用入口');
    assert.equal(html.includes('href="#login"'), false, '激活页不得添加登录旁路');
  } finally {
    await server.close();
  }
});

test('激活页网络失败后会自动安排重试', async () => {
  const src = read('src/v06/SoftwareLicense.jsx');
  assert.match(src, /scheduleRetry/);
  assert.match(src, /retryDelay/);
});
