// 临时验证：iframe 内嵌 xzapp://canvas 是否正常渲染（模拟主窗口 file:// 环境）
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
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
  // 模拟主窗口：file:// 页面内嵌 iframe
  const testHtml = path.join(os.tmpdir(), 'xz-iframe-test.html');
  fs.writeFileSync(testHtml, '<!doctype html><html><body style="margin:0"><iframe id="cv" src="xzapp://canvas/index.html" style="width:100vw;height:100vh;border:0"></iframe></body></html>', 'utf8');
  const win = new BrowserWindow({ width: 1400, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.loadFile(testHtml);
  setTimeout(async () => {
    try {
      const frames = win.webContents.mainFrame.frames;
      if (!frames.length) { console.log('IFRAME_CHECK_ERROR: no frames'); app.exit(1); return; }
      const result = await frames[0].executeJavaScript(`JSON.stringify({
        children: document.getElementById('root') ? document.getElementById('root').children.length : -1,
        url: location.href,
        bodyText: document.body.innerText.slice(0, 100)
      })`);
      console.log('IFRAME_CHECK:' + result);
    } catch (e) { console.log('IFRAME_CHECK_ERROR:' + e.message); }
    app.exit(0);
  }, 6000);
});
