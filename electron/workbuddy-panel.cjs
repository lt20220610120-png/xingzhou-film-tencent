const crypto = require('node:crypto');
const VERIFIED_READ_MS = 15_000;
const TRANSIENT_GRACE_MS = 150_000;

function assertTrustedFrame(event, win) {
  if (!win || win.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('WorkBuddy 仅允许从行舟管理后台操作');
}

function normalizeBounds(value, size) {
  if (!value || ['x', 'y', 'width', 'height'].some((key) => !Number.isFinite(value[key]))) throw new Error('控制面板显示区域无效');
  const x = Math.max(0, Math.min(size.width, Math.round(value.x)));
  const y = Math.max(0, Math.min(size.height, Math.round(value.y)));
  return { x, y, width: Math.max(0, Math.min(size.width - x, Math.round(value.width))), height: Math.max(0, Math.min(size.height - y, Math.round(value.height))) };
}

function createWorkBuddyPanel({ getWindow, accessService, service, updater, WebContentsView, session, shell, onState = () => {}, now = Date.now, setInterval: interval = setInterval, clearInterval: clear = clearInterval }) {
  let epoch = 0, identityEpoch = 0, boundsEpoch = 0, view = null, partition = null, timer = null, verified = null, pageToken = '', verifying = null;
  let pageReady = false, viewBounds = null;
  let progress = { busy: false, stage: 'idle', message: '' };
  let startup = null;
  function destroyPage() {
    clear(timer); timer = null; pageToken = '';
    const oldView = view, oldSession = partition; view = null; partition = null; pageReady = false; viewBounds = null;
    // Native content sits above the replacement DOM during identity teardown.
    try { oldView?.setVisible(false); } catch {}
    try { getWindow()?.contentView.removeChildView(oldView); } catch {}
    try { oldView?.webContents.close({ waitForBeforeUnload: false }); } catch {}
    return Promise.allSettled([oldSession?.clearStorageData(), oldSession?.closeAllConnections()]);
  }
  async function close() { epoch++; await destroyPage(); return true; }
  async function revoke(message = '登录已失效，请重新连接 WorkBuddy 控制面板') {
    identityEpoch++;
    verified = null;
    verifying = null;
    const hadPage = Boolean(view || partition);
    await close();
    if (hadPage) {
      try { onState({ closed: true, error: message, reason: 'authorization' }); } catch {}
    }
  }
  async function authorize(expected = epoch, fresh = true) {
    const token = accessService.token();
    if (expected !== epoch) throw new Error('控制面板打开已取消或登录已失效');
    if (!token || (pageToken && pageToken !== token)) {
      const message = token ? '登录已变更，请重新连接 WorkBuddy 控制面板' : '请使用行舟影视管理员账号登录';
      await revoke(message);
      throw new Error(message);
    }
    if (verified?.token !== token) verified = null;
    if (!fresh && verified && now() - verified.at < VERIFIED_READ_MS) return;
    let pending = verifying;
    if (!pending || pending.token !== token || pending.epoch !== expected) {
      pending = { token, epoch: expected, promise: accessService.session({ workBuddyVerification: true }) }; verifying = pending;
    }
    let account, failure;
    try { account = await pending.promise; } catch (error) { failure = error; }
    finally { if (verifying === pending) verifying = null; }
    if (expected !== epoch || token !== accessService.token()) throw new Error('控制面板打开已取消或登录已失效');
    if (failure?.code === 'WORKBUDDY_VERIFICATION_TEMPORARY') {
      if (verified?.token === token && now() - verified.at < TRANSIENT_GRACE_MS) return;
      const message = '暂时无法连接云端验证管理员身份，请重试';
      if (view || partition) await revoke(message);
      throw new Error(message);
    }
    if (account?.isAdmin !== true || account.banned === true) {
      const message = '仅当前有效的行舟影视管理员可管理 WorkBuddy';
      await revoke(message);
      throw new Error(message);
    }
    verified = { token, at: now() };
  }
  function setBounds(bounds) {
    boundsEpoch++;
    if (!view) return false;
    const win = getWindow(); if (!win || win.isDestroyed()) return false;
    const rect = normalizeBounds(bounds, win.getContentBounds()); viewBounds = rect;
    view.setBounds(rect); view.setVisible(pageReady && rect.width > 0 && rect.height > 0); return true;
  }
  async function resume({ bounds } = {}) {
    if (!view) return false;
    // Preserve the route and DOM only within the same administrator login.
    const ticket = epoch, presentation = ++boundsEpoch, ownView = view, token = pageToken;
    ownView.setVisible(false);
    await authorize(ticket);
    if (ticket !== epoch || ownView !== view) return false;
    if (!token || token !== accessService.token()) {
      await revoke('登录已变更，请重新连接 WorkBuddy 控制面板');
      throw new Error('登录已变更，请重新连接 WorkBuddy 控制面板');
    }
    // A later hide wins over a slow authorization response.
    if (presentation !== boundsEpoch) return true;
    return setBounds(bounds);
  }
  async function open({ bounds } = {}) {
    if (progress.busy) throw new Error('WorkBuddy 控制面板正在更新');
    const ticket = ++epoch, presentation = ++boundsEpoch; await destroyPage(); await authorize(ticket);
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
    const ownView = new WebContentsView({ webPreferences: { session: ownSession, contextIsolation: true, nodeIntegration: false, sandbox: true } });
    // Views default to visible; hide before attachment and keep the loading
    // surface hidden until the requested page is ready.
    ownView.setVisible(false); pageReady = false; view = ownView; pageToken = accessService.token();
    const external=require('./ipc-security.cjs').safeExternalUrl;
    ownView.webContents.setWindowOpenHandler(({ url }) => { try{const safe=external(url);if(new URL(safe).protocol==='https:')void shell.openExternal(safe).catch(()=>{});}catch{}return {action:'deny'}; });
    const guard=(event,legacyUrl)=>{try{if(new URL(external(event.url||legacyUrl)).origin===origin)return;}catch{}event.preventDefault();};
    for(const event of ['will-navigate','will-redirect','will-frame-navigate'])ownView.webContents.on(event,guard);
    ownView.webContents.on('will-redirect', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
    win.contentView.addChildView(ownView); setBounds(presentation === boundsEpoch ? bounds : { x: 0, y: 0, width: 0, height: 0 });
    try { await ownView.webContents.loadURL(origin); } catch (error) { if (ticket === epoch) await close(); throw new Error('WorkBuddy 页面加载失败，请重新连接'); }
    if (ticket !== epoch) throw new Error('控制面板打开已取消');
    pageReady = true; ownView.setVisible(Boolean(viewBounds?.width > 0 && viewBounds?.height > 0));
    timer = interval(() => {
      // A momentarily locked users file can be retried while the last
      // five-minute loopback cookie is still valid.
      authorize(ticket).then(() => { if (ticket === epoch) return ownSession.cookies.set(service.sessionCookie(status.root)); }).catch(() => {});
    }, 60000);
    timer?.unref?.(); return status;
  }
  async function status() { await authorize(); return service.status(); }
  async function checkUpdate() {
    await authorize();
    const token = accessService.token(), identity = identityEpoch;
    const release = await updater.check();
    if (identity !== identityEpoch || token !== accessService.token()) throw new Error('登录已变更，请重新连接 WorkBuddy 控制面板');
    return release;
  }
  async function update() {
    await authorize(); if (progress.busy) throw new Error('WorkBuddy 正在更新');
    progress = { busy: true, stage: 'prepare', message: '正在准备更新' };
    const pendingStartup = startup, token = accessService.token(), identity = identityEpoch;
    const authorizeInstall = async () => {
      if (identity !== identityEpoch || token !== accessService.token()) throw new Error('登录已变更，请重新连接 WorkBuddy 控制面板');
      await authorize();
    };
    try { await close(); await pendingStartup?.catch(() => {}); await updater.update({ authorizeInstall }); const result = await service.status(); progress = { busy: false, stage: 'complete', message: '控制面板更新完成' }; return result; }
    catch (error) { progress = { busy: false, stage: 'error', message: error.message, error: error.message }; throw error; }
  }
  return { open, resume, close, revoke, setBounds, status, authorize, checkUpdate, update, isUpdating: () => progress.busy, updateState: async () => { await authorize(); return { ...progress }; }, onProgress: (next) => { progress = { ...progress, ...next, busy: true }; } };
}
module.exports = { createWorkBuddyPanel, normalizeBounds, assertTrustedFrame };
