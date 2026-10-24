// Run: node win-ai/scripts/verify-header-refresh.cjs
// Uses a local native-header fixture; never logs in or submits generation jobs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = createRequire(path.join(process.env.USERPROFILE || process.env.HOME, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'))('playwright'); }
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'win-ai/public/account-routing.js'), 'utf8');
// Brand structure matches upstream app-header.tsx + system-brand.tsx.
const brand = '<div class="@container/system-brand flex min-w-0 flex-1 items-center gap-1"><a href="/" aria-label="Go to home" class="brand"><img alt="Logo" width="20" height="20" src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2720%27 height=%2720%27/%3E"><span>Win AI</span></a><span class="version">v1.0</span></div>';
const html = `<!doctype html><html><head><style>body{margin:0;font:14px sans-serif;background:#f8f9fc}header{height:48px;display:flex;align-items:center;gap:8px;padding:0 12px;background:white}header>div{display:flex;align-items:center;gap:4px;flex:1}.brand{display:inline-flex;align-items:center;gap:6px;color:#222;text-decoration:none}nav{display:flex;gap:12px}.version{color:#aaa;font-size:11px}aside{width:180px;height:500px;background:#eef1f7;padding:12px;box-sizing:border-box}</style></head><body><header><button aria-label="Toggle sidebar">☰</button>${brand}<nav><a href="/pricing">价格</a><button>搜索</button><button>账户</button></nav></header><aside>原有侧栏<br>Win AI<br>概览<br>API令牌<br>钱包</aside><main>Win AI 控制台内容</main><script src="/account-routing.js"></script></body></html>`;

(async () => {
  let documents = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/account-routing.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(source); }
    documents++; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await playwright.chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  try {
    const page = await browser.newPage();
    const url = `http://127.0.0.1:${server.address().port}/dashboard/overview?tab=usage`;
    for (const width of [720, 1280, 1800]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      const refresh = page.getByRole('button', { name: '刷新 Win AI', exact: true });
      await refresh.waitFor();
      assert.equal(await refresh.count(), 1);
      const layout = await page.evaluate(() => {
        const button = document.querySelector('[data-winai-header-refresh]'), brand = document.querySelector('.brand');
        const b = button.getBoundingClientRect(), a = brand.getBoundingClientRect();
        return { nextToBrand: brand.nextElementSibling === button, insideLink: !!button.closest('a'), round: getComputedStyle(button).borderRadius, x: b.x, rightOfText: b.x >= a.right, y: b.y, size: [b.width, b.height], bodyScroll: document.body.scrollWidth > innerWidth };
      });
      assert.equal(layout.nextToBrand, true); assert.equal(layout.insideLink, false);
      assert.equal(layout.round, '50%'); assert.equal(layout.rightOfText, true);
      assert.deepEqual(layout.size, [28, 28]); assert.equal(layout.bodyScroll, false);
      const before = await page.locator('nav').evaluate(el => el.outerHTML);
      await page.addScriptTag({ content: source });
      await page.evaluate(() => { const header = document.querySelector('header'); header.outerHTML = header.outerHTML; });
      await refresh.waitFor();
      assert.equal(await refresh.count(), 1);
      assert.equal(await page.locator('nav').evaluate(el => el.outerHTML), before);
      const directory = path.join(root, 'output/playwright'); fs.mkdirSync(directory, { recursive: true });
      await page.screenshot({ path: path.join(directory, `winai-header-refresh-${width}.png`) });
      await page.evaluate(() => { localStorage.setItem('session-user', 'mock-user'); sessionStorage.setItem('session-state', 'retained'); document.cookie = 'session=mock; path=/'; });
      const count = documents;
      await Promise.all([page.waitForEvent('load'), refresh.click()]);
      assert.equal(page.url(), url); assert.equal(documents, count + 1);
      assert.deepEqual(await page.evaluate(() => [localStorage.getItem('session-user'), sessionStorage.getItem('session-state'), document.cookie]), ['mock-user', 'retained', 'session=mock']);
      assert.equal(await refresh.count(), 1);
      await page.evaluate(() => document.querySelector('header').remove());
      await page.waitForFunction(() => !document.querySelector('[data-winai-header-refresh]'));
      await page.evaluate(markup => document.body.insertAdjacentHTML('afterbegin', `<header>${markup}</header>`), brand);
      await refresh.waitFor(); assert.equal(await refresh.count(), 1);
      results.push({ width, layout, reloadPreservesSession: true, spaReplacement: true });
    }
    console.log(JSON.stringify({ passed: true, results }, null, 2));
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
