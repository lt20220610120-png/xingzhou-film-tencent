// 临时验证：Electron 中加载 canvas-app，检查 React 是否渲染成功
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'xzapp', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

app.whenReady().then(() => {
  const appDir = path.normalize(path.join(__dirname, '../canvas-app'));
  protocol.handle('xzapp', (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!rel) rel = 'index.html';
    const resolved = path.normalize(path.join(appDir, rel));
    if (!resolved.startsWith(appDir)) return new Response('forbidden', { status: 403 });
    if (!fs.existsSync(resolved)) return net.fetch(pathToFileURL(path.join(appDir, 'index.html')).toString());
    return net.fetch(pathToFileURL(resolved).toString());
  });
  const win = new BrowserWindow({ width: 1400, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  const logs = [];
  win.webContents.on('console-message', (_e, level, message) => logs.push(`[${level}] ${message.slice(0, 200)}`));
  win.loadURL('xzapp://canvas/index.html');
  setTimeout(async () => {
    try {
      const result = await win.webContents.executeJavaScript(`JSON.stringify({
        children: document.getElementById('root').children.length,
        title: document.title,
        hash: location.hash,
        bodyText: document.body.innerText.slice(0, 120)
      })`);
      console.log('CANVAS_CHECK:' + result);
    } catch (e) { console.log('CANVAS_CHECK_ERROR:' + e.message); }
    console.log('CONSOLE_LOGS:' + JSON.stringify(logs.slice(0, 10)));
    app.exit(0);
  }, 6000);
});
