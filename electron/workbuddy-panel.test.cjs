const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createWorkBuddyPanel, normalizeBounds, assertTrustedFrame } = require('./workbuddy-panel.cjs');

function fixture(account = { isAdmin: true }) {
  let current = account, token = 'session-a', cookieCount = 0, started = 0;
  const views = [];
  class View {
    constructor(options) {
      this.options = options; this.webContents = new EventEmitter();
      Object.assign(this.webContents, { loadURL: async (url) => { this.url = url; }, close: () => { this.closed = true; }, setWindowOpenHandler: (fn) => { this.popup = fn; } });
      views.push(this);
    }
    setBounds(value) { this.bounds = value; }
    setVisible(value) { this.visible = value; }
  }
  const partition = { cookies: { set: async () => { cookieCount++; } }, clearStorageData: async () => {}, closeAllConnections: async () => {}, setPermissionCheckHandler: (fn) => { partition.permissionCheck = fn; }, setPermissionRequestHandler: (fn) => { partition.permission = fn; }, webRequest: { onBeforeRequest: (...args) => { partition.request = args.at(-1); } } };
  const win = { isDestroyed: () => false, getContentBounds: () => ({ width: 1200, height: 800 }), contentView: { addChildView: () => {}, removeChildView: () => {} } };
  const updater = { update: async () => {} };
  const access = { session: async () => current, token: () => token };
  const events = [];
  const panel = createWorkBuddyPanel({ getWindow: () => win, accessService: access, updater, onState: (value) => events.push(value), service: { status: async () => ({ installed: true, running: true, root: '/local', port: 7864 }), start: async () => { started++; return { installed: true, running: true, root: '/local', port: 7864 }; }, sessionCookie: () => ({ url: 'http://127.0.0.1:7864', name: 'wb_session', value: 'private', httpOnly: true }) }, WebContentsView: View, session: { fromPartition: () => partition }, shell: { openExternal: async () => {} }, setInterval: () => 1, clearInterval: () => {} });
  return { panel, access, updater, events, views, partition, setAccount: (a) => { current = a; }, setToken: (t) => { token = t; }, counts: () => ({ cookieCount, started }) };
}

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
test('the panel can copy text but cannot read the clipboard or grant unrelated permissions', async () => {
  const f = fixture(); await f.panel.open({ bounds: { x: 0, y: 0, width: 500, height: 500 } });
  assert.equal(f.partition.permissionCheck(null, 'clipboard-sanitized-write', 'http://127.0.0.1:7864'), true);
  assert.equal(f.partition.permissionCheck(null, 'clipboard-sanitized-write', 'https://example.com'), false);
  const allowed = await new Promise((resolve) => f.partition.permission(f.views[0].webContents, 'clipboard-sanitized-write', resolve)); assert.equal(allowed, true);
  for (const permission of ['clipboard-read', 'geolocation', 'media', 'fileSystem']) assert.equal(await new Promise((resolve) => f.partition.permission(f.views[0].webContents, permission, resolve)), false);
  await f.panel.close();
});
