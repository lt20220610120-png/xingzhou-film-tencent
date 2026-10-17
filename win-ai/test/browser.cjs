// Uses the installed Playwright runtime; all credentials stay in process memory.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.WIN_AI_PLAYWRIGHT || 'playwright');
const origin = 'https://winai.xingzhoufilm.cn';
const out = path.resolve(__dirname, '../../output/win-ai-browser');
fs.mkdirSync(out, {recursive:true});
let password = '';
(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome',proxy:{server:'socks5://127.0.0.1:18319'}});
  try {
    const context = await browser.newContext({locale:'zh-CN',viewport:{width:1440,height:1000}});
    await context.grantPermissions(['clipboard-read','clipboard-write'], {origin});
    const page = await context.newPage();
    const failures = [];
    page.on('pageerror', e => failures.push(e.message));
    let r = await page.goto(origin, {waitUntil:'networkidle'});
    assert.equal(r.status(),200);
    assert.match(await page.title(),/Win AI/);
    await page.getByText('站点已连接 · 模型开放情况以控制台为准').waitFor();
    await page.getByRole('button',{name:'复制 API 地址'}).click();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),origin+'/v1');
    await page.screenshot({path:path.join(out,'home-desktop.png'),fullPage:true});
    for (const width of [390,768,1440]) {
      await page.setViewportSize({width,height:900});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), 'Home overflows at '+width);
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(out,'home-mobile.png'),fullPage:true});
    await page.goto(origin+'/docs');
    for (const language of ['Python','JavaScript','cURL']) {
      await page.getByRole('tab',{name:language,exact:true}).click();
      const panel = page.getByRole('tabpanel',{name:language,exact:true});
      assert(await panel.isVisible());
      assert.match(await panel.textContent(),/winai\.xingzhoufilm\.cn/);
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),'Docs overflow');
    await page.screenshot({path:path.join(out,'docs-mobile.png'),fullPage:true});
    const creds = JSON.parse(execFileSync('ssh',['-i',path.join(process.env.USERPROFILE,'.ssh/xingzhou_tencent_test'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+path.join(process.env.USERPROFILE,'.ssh/known_hosts_xingzhou'),'ubuntu@106.55.41.128','sudo cat /etc/win-ai/admin.json'],{encoding:'utf8'}));
    password = creds.password;
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(origin+'/sign-in');
    await page.getByRole('textbox').first().fill(creds.username);
    await page.locator('input[type=password]').fill(creds.password);
    await page.getByRole('button',{name:/^(登录|Sign in)$/}).click();
    await page.waitForURL(url => url.pathname.startsWith('/dashboard'),{timeout:30000});
    await page.getByRole('link',{name:'概览',exact:true}).waitFor({state:'visible',timeout:30000});
    await page.waitForLoadState('networkidle');
    await page.screenshot({path:path.join(out,'dashboard.png'),fullPage:true});
    for (const route of ['/channels','/keys','/users']) {
      await page.goto(origin+route,{waitUntil:'networkidle'});
      assert.equal(new URL(page.url()).pathname,route,'Session failed on '+route);
      assert.match(await page.title(),/Win AI/);
      await page.screenshot({path:path.join(out,route.slice(1)+'.png'),fullPage:true});
    }
    // Refresh uses a Secure HttpOnly cookie across real HTTPS requests.
    await page.reload({waitUntil:'networkidle'});
    assert.equal(new URL(page.url()).pathname,'/users');
    for (const route of ['/api/setup','/api/user/register','/api/subscription/plans','/api/user/topup']) {
      const response = await context.request.get(origin+route);
      assert.equal(response.status(),403,route);
    }
    assert.deepEqual(failures,[],'Uncaught page errors');
    const result = {passed:true,origin,transport:'Valid public HTTPS certificate through an SSH SOCKS connection; direct-domain stability remains unverified',checks:['home brand and live status','clipboard address','390/768/1440 widths','3 documentation tabs','root admin UI login','dashboard, channels, keys, users','session reload','4 disabled payment/setup/registration endpoints','no uncaught page errors'],screenshots:out};
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
    await context.close();
  } finally { await browser.close(); }
})().catch(e => { console.error(String(e.stack || e).replaceAll(password || 'never-match', '[redacted]'));process.exitCode = 1; });
