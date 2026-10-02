const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createWorkBuddyPanel, normalizeBounds, assertTrustedFrame } = require('./workbuddy-panel.cjs');

function fixture(account = { isAdmin: true }, serviceOverrides = {}) {
  let current = account, token = 'session-a', cookieCount = 0, started = 0, authorized = 0, loaded = 0, cleared = 0;
  const views = [];
  class View {
    constructor(options) {
      this.options = options; this.webContents = new EventEmitter();
      Object.assign(this.webContents, { loadURL: async (url) => { loaded++; this.url = url; }, close: () => { this.closed = true; }, setWindowOpenHandler: (fn) => { this.popup = fn; } });
      views.push(this);
    }
    setBounds(value) { this.bounds = value; }
    setVisible(value) { this.visible = value; }
  }
  const partition = { cookies: { set: async () => { cookieCount++; } }, clearStorageData: async () => { cleared++; }, closeAllConnections: async () => {}, setPermissionCheckHandler: (fn) => { partition.permissionCheck = fn; }, setPermissionRequestHandler: (fn) => { partition.permission = fn; }, webRequest: { onBeforeRequest: (...args) => { partition.request = args.at(-1); } } };
  const win = { isDestroyed: () => false, getContentBounds: () => ({ width: 1200, height: 800 }), contentView: { addChildView: () => {}, removeChildView: () => {} } };
  const updater = { update: async () => {} };
  const access = { session: async () => { authorized++; return current; }, token: () => token };
  const events = [];
  const panel = createWorkBuddyPanel({ getWindow: () => win, accessService: access, updater, onState: (value) => events.push(value), service: { status: async () => ({ installed: true, running: true, root: '/local', port: 7864 }), start: async () => { started++; return { installed: true, running: true, root: '/local', port: 7864 }; }, sessionCookie: () => ({ url: 'http://127.0.0.1:7864', name: 'wb_session', value: 'private', httpOnly: true }), ...serviceOverrides }, WebContentsView: View, session: { fromPartition: () => partition }, shell: { openExternal: async () => {} }, setInterval: () => 1, clearInterval: () => {} });
  return { panel, access, updater, events, views, partition, setAccount: (a) => { current = a; }, setToken: (t) => { token = t; }, counts: () => ({ cookieCount, started }), lifecycle: () => ({ authorized, loaded, cleared }) };
}

test('leaving and returning preserves the page, route and draft while verifying the administrator again', async () => {
  const f = fixture(), bounds = { x: 240, y: 180, width: 850, height: 580 };
  await f.panel.open({ bounds });
  const page = f.views[0]; page.route = '/settings/upstreams'; page.draft = 'unsaved input';
  const before = f.lifecycle();
  f.panel.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  assert.equal(page.visible, false); assert.equal(page.closed, undefined);
  assert.equal(await f.panel.resume({ bounds }), true);
  assert.equal(page.visible, true); assert.equal(f.views.length, 1);
  assert.equal(page.route, '/settings/upstreams'); assert.equal(page.draft, 'unsaved input');
  assert.equal(f.lifecycle().loaded, before.loaded); assert.equal(f.lifecycle().cleared, before.cleared);
  assert.equal(f.counts().started, 1); assert.ok(f.lifecycle().authorized > before.authorized);
  await f.panel.close();
});

test('a late return authorization cannot show the page after the administrator leaves again', async () => {
  const f = fixture(), bounds = { x: 0, y: 0, width: 500, height: 500 };
  await f.panel.open({ bounds }); let finish;
  f.access.session = () => new Promise(resolve => { finish = resolve; });
  const returning = f.panel.resume({ bounds });
  await new Promise(setImmediate); f.panel.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  finish({ isAdmin: true }); assert.equal(await returning, true);
  assert.equal(f.views[0].visible, false); assert.equal(f.views[0].closed, undefined);
  await f.panel.close();
});

test('retained pages are destroyed when permission is revoked or the login changes', async () => {
  for (const changed of ['permission', 'login']) {
    const f = fixture(), bounds = { x: 0, y: 0, width: 500, height: 500 };
    await f.panel.open({ bounds }); f.panel.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    if (changed === 'permission') f.setAccount({ isAdmin: false }); else f.setToken('session-b');
    await assert.rejects(f.panel.resume({ bounds }), /管理员|登录/);
    assert.equal(f.views[0].closed, true); assert.equal(await f.panel.resume({ bounds }), false);
    assert.ok(f.lifecycle().cleared > 0);
  }
});

test('leaving during the first authorization also hides a late first page', async () => {
  const f = fixture(); let finish;
  const original = f.access.session;
  f.access.session = () => new Promise(resolve => { finish = resolve; });
  const opening = f.panel.open({ bounds: { x: 0, y: 0, width: 500, height: 500 } });
  await new Promise(setImmediate); f.panel.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  f.access.session = original; finish({ isAdmin: true }); await opening;
  assert.equal(f.views[0].visible, false); await f.panel.close();
});

test('only an active, cloud-verified administrator may open the panel', async () => {
  for (const account of [null, { isAdmin: false }, { isAdmin: true, banned: true }]) {
    const f = fixture(account); await assert.rejects(f.panel.open({ bounds: { x: 240, y: 180, width: 850, height: 580 } }), /管理员/); assert.deepEqual(f.counts(), { cookieCount: 0, started: 0 });
  }
});
test('administrator opens an isolated sandbox page without exposing its cookie', async () => {
  const f = fixture(); const result = await f.panel.open({ bounds: { x: 240, y: 180, width: 850, height: 580 } });
  assert.equal(result.running, true); assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(f.views[0].options.webPreferences.sandbox, true); assert.equal(f.views[0].options.webPreferences.nodeIntegration, false); assert.equal(f.views[0].options.webPreferences.preload, undefined);
  await f.panel.close(); assert.equal(f.views[0].closed, true);
});
test('closing during cloud authorization cancels a late open', async () => {
  const f = fixture(); let finish; f.access.session = () => new Promise((r) => { finish = r; });
  const pending = f.panel.open({ bounds: { x: 0, y: 0, width: 500, height: 500 } }); await new Promise(setImmediate); await f.panel.close(); finish({ isAdmin: true });
  await assert.rejects(pending, /取消|失效/); assert.equal(f.views.length, 0);
});
test('panel API mutations recheck permission and block a revoked administrator', async () => {
  const f = fixture(); await f.panel.open({ bounds: { x: 240, y: 180, width: 850, height: 580 } }); f.setAccount({ isAdmin: false });
  const response = await new Promise((r) => f.partition.request({ url: 'http://127.0.0.1:7864/api/accounts', method: 'POST' }, r));
  assert.equal(response.cancel, true); assert.equal(f.views[0].closed, true);
  assert.equal(f.events.at(-1).reason, 'authorization');
});
test('bounds cannot escape the main window and zero size hides the view', async () => {
  assert.deepEqual(normalizeBounds({ x: -30, y: 10, width: 2000, height: 900 }, { width: 1200, height: 800 }), { x: 0, y: 10, width: 1200, height: 790 });
  assert.throws(() => normalizeBounds({ x: NaN }, { width: 1200, height: 800 }), /区域/);
  const f = fixture(); await f.panel.open({ bounds: { x: 240, y: 180, width: 850, height: 580 } }); f.panel.setBounds({ x: 0, y: 0, width: 0, height: 0 }); assert.equal(f.views[0].visible, false); await f.panel.close();
});
test('privileged IPC rejects other windows and subframes', () => {
  const webContents = { mainFrame: {} }; const win = { webContents, isDestroyed: () => false };
  assert.doesNotThrow(() => assertTrustedFrame({ sender: webContents, senderFrame: webContents.mainFrame }, win));
  assert.throws(() => assertTrustedFrame({ sender: {}, senderFrame: webContents.mainFrame }, win), /管理后台/);
  assert.throws(() => assertTrustedFrame({ sender: webContents, senderFrame: {} }, win), /管理后台/);
});
test('updating prevents reopening the page and overlapping updates', async () => {
  const f = fixture(); let finish; f.updater.update = () => new Promise((resolve) => { finish = resolve; });
  const updating = f.panel.update(); await new Promise(setImmediate);
  assert.equal(f.panel.isUpdating(), true);
  await assert.rejects(f.panel.open({ bounds: { x: 0, y: 0, width: 500, height: 500 } }), /更新/);
  await assert.rejects(f.panel.update(), /更新/);
  finish(); const result = await updating; assert.equal(result.installed, true); assert.equal(f.panel.isUpdating(), false);
});
test('updating waits for an in-flight manager migration before replacing its files', async () => {
  let finishStartup, updates = 0;
  const f = fixture({ isAdmin: true }, { start: () => new Promise(resolve => { finishStartup = resolve; }) });
  const opening = f.panel.open({ bounds: { x: 0, y: 0, width: 500, height: 500 } });
  const cancelled = assert.rejects(opening, /取消/);
  await new Promise(setImmediate);
  f.updater.update = async () => { updates++; };
  const updating = f.panel.update();
  await new Promise(setImmediate);
  assert.equal(f.panel.isUpdating(), true);
  assert.equal(updates, 0);
  await assert.rejects(f.panel.open(), /更新/);
  finishStartup({ installed: true, running: true, root: '/local', port: 7864 });
  await cancelled;
  await updating;
  assert.equal(updates, 1);
});
test('the panel can copy text but cannot read the clipboard or grant unrelated permissions', async () => {
  const f = fixture(); await f.panel.open({ bounds: { x: 0, y: 0, width: 500, height: 500 } });
  assert.equal(f.partition.permissionCheck(null, 'clipboard-sanitized-write', 'http://127.0.0.1:7864'), true);
  assert.equal(f.partition.permissionCheck(null, 'clipboard-sanitized-write', 'https://example.com'), false);
  const allowed = await new Promise((resolve) => f.partition.permission(f.views[0].webContents, 'clipboard-sanitized-write', resolve)); assert.equal(allowed, true);
  for (const permission of ['clipboard-read', 'geolocation', 'media', 'fileSystem']) assert.equal(await new Promise((resolve) => f.partition.permission(f.views[0].webContents, permission, resolve)), false);
  await f.panel.close();
});
