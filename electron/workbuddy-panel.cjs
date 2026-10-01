const crypto = require('node:crypto');

function assertTrustedFrame(event, win) {
  if (!win || win.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('WorkBuddy 仅允许从行舟管理后台操作');
}

function normalizeBounds(value, size) {
  if (!value || ['x', 'y', 'width', 'height'].some((key) => !Number.isFinite(value[key]))) throw new Error('控制面板显示区域无效');
  const x = Math.max(0, Math.min(size.width, Math.round(value.x)));
  const y = Math.max(0, Math.min(size.height, Math.round(value.y)));
  return { x, y, width: Math.max(0, Math.min(size.width - x, Math.round(value.width))), height: Math.max(0, Math.min(size.height - y, Math.round(value.height))) };
}

function createWorkBuddyPanel({ getWindow, accessService, service, updater, WebContentsView, session, shell, onState = () => {}, setInterval: interval = setInterval, clearInterval: clear = clearInterval }) {
  let epoch = 0, view = null, partition = null, timer = null, authorizedAt = 0, authorizedToken = '', verifying = null;
  let progress = { busy: false, stage: 'idle', message: '' };
  let startup = null;
  function destroyPage() {
    clear(timer); timer = null; authorizedAt = 0; authorizedToken = '';
    const oldView = view, oldSession = partition; view = null; partition = null;
    try { getWindow()?.contentView.removeChildView(oldView); } catch {}
    try { oldView?.webContents.close({ waitForBeforeUnload: false }); } catch {}
    return Promise.allSettled([oldSession?.clearStorageData(), oldSession?.closeAllConnections()]);
  }
  async function close() { epoch++; await destroyPage(); return true; }
  async function denied(message) {
    await close();
    try { onState({ closed: true, error: message, reason: 'authorization' }); } catch {}
  }
  async function authorize(expected = epoch, fresh = true) {
    const token = accessService.token();
    if (!fresh && authorizedToken === token && authorizedAt > Date.now() - 15000) return;
    if (!token) { await denied('请使用行舟影视管理员账号登录'); throw new Error('请使用行舟影视管理员账号登录'); }
    let pending = verifying;
    if (!pending || pending.token !== token || pending.epoch !== expected) {
      pending = { token, epoch: expected, promise: accessService.session() }; verifying = pending;
    }
    let account;
    try { account = await pending.promise; } finally { if (verifying === pending) verifying = null; }
    if (expected !== epoch || token !== accessService.token()) throw new Error('控制面板打开已取消或登录已失效');
    if (account?.isAdmin !== true || account.banned === true) { await denied('当前行舟管理员身份无法验证，请重新连接'); throw new Error('仅当前有效的行舟影视管理员可管理 WorkBuddy'); }
    authorizedToken = token; authorizedAt = Date.now();
  }
  function setBounds(bounds) {
    if (!view) return false;
    const win = getWindow(); if (!win || win.isDestroyed()) return false;
    const rect = normalizeBounds(bounds, win.getContentBounds()); view.setBounds(rect); view.setVisible(rect.width > 0 && rect.height > 0); return true;
  }
  async function open({ bounds } = {}) {
    if (progress.busy) throw new Error('WorkBuddy 控制面板正在更新');
    const ticket = ++epoch; await destroyPage(); await authorize(ticket);
    if (progress.busy || ticket !== epoch) throw new Error('控制面板打开已取消');
    const pendingStartup = service.start(); startup = pendingStartup;
    let status;
    try { status = await pendingStartup; } finally { if (startup === pendingStartup) startup = null; }
    if (ticket !== epoch) throw new Error('控制面板打开已取消');
    await authorize(ticket);
    if (!status.running || !status.root || !Number.isInteger(status.port)) throw new Error(status.error || 'WorkBuddy 控制面板尚未就绪');
    const win = getWindow(); if (!win || win.isDestroyed()) throw new Error('窗口已关闭');
    normalizeBounds(bounds, win.getContentBounds());
    const origin = `http://127.0.0.1:${status.port}`;
    const ownSession = session.fromPartition(`xingzhou-workbuddy-${crypto.randomUUID()}`); partition = ownSession;
    ownSession.setPermissionCheckHandler?.((_wc, permission, requestingOrigin) => permission === 'clipboard-sanitized-write' && requestingOrigin === origin && ticket === epoch);
    ownSession.setPermissionRequestHandler((wc, permission, callback) => {
      if (permission !== 'clipboard-sanitized-write' || wc !== view?.webContents) { callback(false); return; }
      authorize(ticket, false).then(() => callback(ticket === epoch)).catch(() => callback(false));
    });
    ownSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      let url; try { url = new URL(details.url); } catch { callback({ cancel: true }); return; }
      if (ticket !== epoch) { callback({ cancel: true }); return; }
      if (url.origin === origin) {
        authorize(ticket, !['GET', 'HEAD', 'OPTIONS'].includes(details.method)).then(() => callback({ cancel: ticket !== epoch })).catch(() => { callback({ cancel: true }); });
      } else callback({ cancel: !['https:', 'data:', 'blob:'].includes(url.protocol) });
    });
    await ownSession.cookies.set(service.sessionCookie(status.root));
    if (ticket !== epoch) { await ownSession.clearStorageData(); throw new Error('控制面板打开已取消'); }
    const ownView = new WebContentsView({ webPreferences: { session: ownSession, contextIsolation: true, nodeIntegration: false, sandbox: true } }); view = ownView;
    ownView.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url).catch(() => {}); return { action: 'deny' }; });
    ownView.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
    ownView.webContents.on('will-redirect', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
    win.contentView.addChildView(ownView); setBounds(bounds);
    try { await ownView.webContents.loadURL(origin); } catch (error) { if (ticket === epoch) await close(); throw new Error('WorkBuddy 页面加载失败，请重新连接'); }
    if (ticket !== epoch) throw new Error('控制面板打开已取消');
    timer = interval(() => { authorize(ticket).then(() => { if (ticket === epoch) return ownSession.cookies.set(service.sessionCookie(status.root)); }).catch(() => { if (ticket === epoch) return close(); }); }, 60000);
    timer?.unref?.(); return status;
  }
  async function status() { await authorize(); return service.status(); }
  async function checkUpdate() { await authorize(); return updater.check(); }
  async function update() {
    await authorize(); if (progress.busy) throw new Error('WorkBuddy 正在更新');
    progress = { busy: true, stage: 'prepare', message: '正在准备更新' };
    const pendingStartup = startup;
    try { await close(); await pendingStartup?.catch(() => {}); await updater.update(); const result = await service.status(); progress = { busy: false, stage: 'complete', message: '控制面板更新完成' }; return result; }
    catch (error) { progress = { busy: false, stage: 'error', message: error.message, error: error.message }; throw error; }
  }
  return { open, close, revoke: close, setBounds, status, authorize, checkUpdate, update, isUpdating: () => progress.busy, updateState: async () => { await authorize(); return { ...progress }; }, onProgress: (next) => { progress = { ...progress, ...next, busy: true }; } };
}
module.exports = { createWorkBuddyPanel, normalizeBounds, assertTrustedFrame };
