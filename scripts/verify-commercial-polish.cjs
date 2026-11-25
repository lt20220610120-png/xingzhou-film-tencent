const {app, BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {setTimeout: pause} = require('node:timers/promises');

const root = path.join(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xz-commercial-ui-'));
const evidence = process.env.XZ_COMMERCIAL_UI_OUTPUT;
const page = 'scripts/fixtures/wave-three-ui.html';
const widths = [1280, 1600, 1920];
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.disableHardwareAcceleration();

function contrast(foreground, background) {
  const luminance = value => {
    const rgb = value.startsWith('#') ? value.slice(1).match(/../g).map(s => parseInt(s, 16)) : value.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number);
    return rgb.reduce((result, channel, index) => {
      const s = channel / 255;
      const linear = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      return result + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0) + 0.05;
  };
  const ratio = luminance(foreground) / luminance(background);
  return Number(Math.max(ratio, 1 / ratio).toFixed(2));
}

app.whenReady().then(async () => {
  let server, win;
  let exit = 0;
  const report = {tokens: {}, panels: [], errors: [], blockedHosts: [], failures: []};
  const {failures} = report;
  const check = (condition, message) => { if (!condition) failures.push(message); };
  try {
    if (evidence) fs.mkdirSync(evidence, {recursive: true});
    const {createServer} = await import('vite');
    server = await createServer({root, configFile:false, cacheDir:path.join(profile, 'vite-cache'),
      optimizeDeps:{entries:[page]}, server:{host:'127.0.0.1', port:0, watch:null}, logLevel:'error'});
    await server.listen();
    const local = server.resolvedUrls.local[0];
    const {host: localHost} = new URL(local);
    win = new BrowserWindow({width:1280, height:900, show:false, webPreferences:{backgroundThrottling:false}});
    win.webContents.session.webRequest.onBeforeRequest({urls:['<all_urls>']}, ({url}, done) => {
      const {protocol, host, hostname} = new URL(url);
      const localVite = host === localHost && ['http:', 'ws:'].includes(protocol);
      const blocked = !['data:', 'blob:', 'about:'].includes(protocol) && !localVite;
      if (blocked) report.blockedHosts.push(hostname || protocol);
      done({cancel:blocked});
    });
    win.webContents.on('console-message', event => {
      if (/Uncaught|xingzhou-render-error|Maximum update depth/.test(event.message)) report.errors.push(event.message);
    });
    win.webContents.debugger.attach('1.3');
    const run = (fn, ...args) => win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    const wait = async (fn, ...args) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await run(fn, ...args);
        if (result) return result;
        await pause(60);
      }
      throw Error(`Timed out: ${fn} ${JSON.stringify(args)}`);
    };
    const present = selector => wait(selector => Boolean(document.querySelector(selector)?.getClientRects().length), selector);
    const click = (selector, label) => wait((selector, label) => {
      const node = [...document.querySelectorAll(selector)].find(element => element.getClientRects().length &&
        (label == null || [element.getAttribute('aria-label'), element.textContent.trim()].includes(label)));
      node?.click();
      return Boolean(node);
    }, selector, label);
    const press = async (key, virtualKey, modifiers = 0) => {
      for (const type of ['rawKeyDown', 'keyUp']) {
        await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
          type, key, code:key, modifiers, windowsVirtualKeyCode:virtualKey, nativeVirtualKeyCode:virtualKey,
        });
      }
    };
    const rail = label => click('.collab-rail button', label);
    const nav = label => click('#app-sidebar button', label);
    const screenshot = async (width, name) => {
      if (!evidence) return;
      await run(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const {data} = await win.webContents.debugger.sendCommand('Page.captureScreenshot', {format:'png'});
      fs.writeFileSync(path.join(evidence, `${width}-${name}.png`), Buffer.from(data, 'base64'));
    };
    const inspect = async (width, panel, selector, {controls = 'button,select,input', minimum = 1, baseline, expectedHeight = 36} = {}) => {
      const data = await run((selector, controls, baseline) => {
        const root = document.querySelector(selector);
        if (!root?.getClientRects().length) return null;
        const rect = root.getBoundingClientRect();
        const candidates = [...root.querySelectorAll(controls)].filter(node => node.matches('select') || !node.closest('select'));
        const nodes = candidates.map(node => {
          const r = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          const hit = document.elementFromPoint(x, y);
          return {name:node.getAttribute('aria-label') || node.textContent.trim().slice(0, 40),
            height:Math.round(r.height), row:Math.round(r.top), disabled:node.disabled, baseline:Boolean(baseline && node.matches(baseline)),
            visible:r.width > 0 && r.height > 0 && style.visibility === 'visible' && Number(style.opacity) > 0,
            clipped:r.left < Math.max(0, rect.left) - 1 || r.right > Math.min(innerWidth, rect.right) + 1,
            covered:y > 0 && y < innerHeight && Boolean(hit && !node.contains(hit))};
        });
        return {panelWidth:Math.round(rect.width), pageOverflow:document.documentElement.scrollWidth - innerWidth,
          overflow:root.scrollWidth - root.clientWidth, rows:[...new Set(nodes.map(node => node.row))], nodes};
      }, selector, controls, baseline);
      const label = `${width} ${panel} ${selector}`;
      check(data?.nodes.length >= minimum, `${label} missing controls (${data?.nodes.length || 0}/${minimum})`);
      if (!data) return null;
      check(data.pageOverflow <= 1 && data.overflow <= 1, `${label} horizontal overflow ${data.pageOverflow}/${data.overflow}`);
      const obscured = data.nodes.filter(node => node.clipped || node.covered || !node.visible);
      check(!obscured.length, `${label} clipped, hidden, or covered: ${JSON.stringify(obscured)}`);
      if (baseline) {
        const size = data.nodes.filter(node => node.baseline);
        check(size.length && size.every(node => node.height === expectedHeight),
          `${label} expected ${expectedHeight}px: ${JSON.stringify(size.map(({name,height}) => ({name,height})))}`);
      }
      report.panels.push({width, panel, selector, ...data});
      return data;
    };
    const measureText = async (width, selector, minimum = 1) => {
      const samples = await run(selector => [...document.querySelectorAll(selector)].filter(n => n.getClientRects().length).map(node => {
        const {color, fontWeight} = getComputedStyle(node);
        let layer = node;
        while (layer && getComputedStyle(layer).backgroundColor === 'rgba(0, 0, 0, 0)') layer = layer.parentElement;
        return {text:node.textContent.trim(), color, background:getComputedStyle(layer || document.body).backgroundColor, fontWeight};
      }), selector);
      const checked = samples.map(sample => ({...sample, ratio:contrast(sample.color, sample.background)}));
      check(checked.length >= minimum && checked.every(sample => sample.ratio >= 4.5), `${width} ${selector} contrast ${JSON.stringify(checked)}`);
      report.panels.push({width, selector, text:checked});
    };
    const tokenPairs = [
      ['--ui-ink', '--ui-bg'], ['--ui-ink-body', '--ui-surface'], ['--ui-ink-secondary', '--ui-surface-subtle'],
      ['--ui-ink-muted', '--ui-bg'], ['--ui-accent-text', '--ui-accent-soft'], ['--ui-surface', '--ui-accent'],
      ['--ui-success', '--ui-success-bg'], ['--ui-warning', '--ui-warning-bg'], ['--ui-danger', '--ui-danger-bg'],
    ];

    await win.loadURL(`${local}${page}?commercial-polish`);
    await nav('项目协作');
    await click('.collab-hub button', '进入项目');
    await present('.collab-rail');
    const computedTokens = await run(pairs => {
      const style = getComputedStyle(document.documentElement);
      return pairs.map(pair => pair.map(token => style.getPropertyValue(token).trim()));
    }, tokenPairs);
    for (const [index, [foreground, background]] of computedTokens.entries()) {
      const ratio = contrast(foreground, background);
      report.tokens[tokenPairs[index].join('/')] = ratio;
      check(ratio >= 4.5, `${tokenPairs[index].join('/')} contrast ${ratio}`);
    }

    for (const width of widths) {
      win.setContentSize(width, 900);
      await wait(width => innerWidth === width && innerHeight === 900, width);
      await rail('资产');
      await click('.collab-cat-tabs button', '场景');
      await wait(() => document.querySelector('.collab-cat-tabs button[aria-pressed=true]')?.textContent === '场景');
      await click('.collab-cat-tabs button', '角色');
      await wait(() => document.querySelector('.collab-cat-tabs button[aria-pressed=true]')?.textContent === '角色');
      await present('.asset-batch-primary');
      await inspect(width, 'asset', '.asset-heading-primary', {minimum:3});
      await inspect(width, 'asset', '.asset-heading-secondary', {minimum:2});
      const params = await inspect(width, 'asset', '.asset-category-batch-controls', {minimum:7, baseline:'select,.asset-batch-actions button'});
      await measureText(width, '.collab-cat-tabs button.active');
      check(params?.rows.length === (width === 1280 ? 2 : 1), `${width} asset parameter and action groups wrap at the wrong width`);
      const trigger = '[aria-label="生成规则"]';
      await run(selector => document.querySelector(selector).focus(), trigger);
      await press('Tab', 9, 8);
      check(await run(selector => !document.activeElement.matches(selector), trigger), `${width} Shift+Tab did not move away from asset help`);
      await press('Tab', 9);
      const tip = await wait(selector => {
        const button = document.querySelector(selector);
        const tooltip = document.getElementById(button.getAttribute('aria-describedby'));
        if (document.activeElement !== button || !tooltip?.matches('[role=tooltip]')) return false;
        const r = tooltip.getBoundingClientRect();
        return {text:tooltip.textContent, focusVisible:button.matches(':focus-visible'),
          inViewport:r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight};
      }, trigger);
      check(tip.focusVisible && tip.inViewport && /搜索不改变生成范围/.test(tip.text), `${width} asset tooltip ${JSON.stringify(tip)}`);
      await screenshot(width, 'asset');
      await press('Escape', 27);
      await wait(selector => document.activeElement.matches(selector) && !document.activeElement.hasAttribute('aria-describedby'), trigger);
      report.panels.push({width, panel:'asset-help', ...tip, escapeRestoredFocus:true});

      await rail('音色');
      await present('.voice-status-badge.is-confirmed');
      await inspect(width, 'voice', '.voice-header-actions', {minimum:2, baseline:'select,button'});
      await inspect(width, 'voice', '.voice-toolbar-primary', {minimum:7, baseline:'.voice-batch-group :is(button,input)'});
      await inspect(width, 'voice', '.voice-toolbar-secondary', {minimum:3, baseline:'button,select'});
      await inspect(width, 'voice', '.project-voice-card.is-empty .voice-model-actions', {minimum:4, baseline:'button,select'});
      await measureText(width, '.voice-status-badge', 3);
      await measureText(width, '.voice-status-filters [aria-pressed=true]');
      await screenshot(width, 'voice');
      await click('.voice-status-filters button:nth-child(2)');
      await wait(() => document.querySelector('.voice-status-filters button:nth-child(2)').getAttribute('aria-pressed') === 'true' &&
        document.querySelectorAll('.project-voice-card').length === 1 && Boolean(document.querySelector('.project-voice-card.is-empty')));
      await click('.voice-status-filters button:first-child');

      await rail('分镜');
      if (await run(() => Boolean(document.querySelector('.collab-episode-card')?.getClientRects().length))) await click('.collab-episode-card');
      await present('.storyboard-tools-toggle');
      const expanded = await run(() => document.querySelector('.storyboard-tools-toggle').getAttribute('aria-expanded') === 'true');
      if (expanded) await click('.storyboard-tools-toggle');
      await present('.storyboard-tools-summary');
      await measureText(width, '.storyboard-tools-summary');
      await click('.storyboard-tools-toggle');
      await present('.storyboard-parameter-apply');
      const settings = await inspect(width, 'storyboard', '.storyboard-defaults', {minimum:8, baseline:'button,input,select'});
      const batch = await inspect(width, 'storyboard', '.storyboard-batch-controls', {minimum:3, baseline:'button,select'});
      await inspect(width, 'storyboard', '.collab-sb-navigation', {minimum:3});
      await inspect(width, 'storyboard', '.collab-shot-card:first-of-type > header', {minimum:2});
      check(settings?.rows.length === 2 && batch?.rows.length === 1, `${width} storyboard defaults/batch alignment`);
      check(await run(() => !document.querySelector('.storyboard-tools-summary') &&
        document.querySelector('.storyboard-tools-toggle').getAttribute('aria-expanded') === 'true' &&
        Boolean(document.querySelector('.storyboard-generation-tools .storyboard-defaults + .storyboard-batch'))),
      `${width} storyboard generation settings missing integrated batch controls`);
      await screenshot(width, 'storyboard');

      await rail('视频池');
      await present('.video-pool-row');
      await inspect(width, 'video-pool', '.video-pool-header-actions', {minimum:7, baseline:'button'});
      await inspect(width, 'video-pool', '.video-pool-toolbar', {minimum:7, baseline:'select'});
      await measureText(width, '.video-pool-status-tabs [aria-pressed=true]');
      await screenshot(width, 'video-pool');
      await click('.video-pool-status-tabs button:nth-child(2)');
      await wait(() => document.querySelector('.video-pool-status-tabs button:nth-child(2)').getAttribute('aria-pressed') === 'true' &&
        document.querySelectorAll('.video-pool-row').length === 1 && document.querySelector('.video-pool-row h3')?.textContent === '1-1-1');
      await click('.video-pool-status-tabs button:first-child');
    }

    await nav('图视生成');
    await click('.generation-tabs button', 'AI图片生成');
    await present('.generation-result-grid article');
    await inspect(widths.at(-1), 'generation', '.generation-controls', {minimum:2, baseline:'select,input:not([type=checkbox])'});
    await measureText(widths.at(-1), '.generation-tabs button.active,.generation-result-grid article:first-child .status-success');
    report.paidCalls = await run(() => waveThree.attemptedPaid);
    assert.deepEqual(report.paidCalls, []);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.blockedHosts, []);
    assert.deepEqual(failures, []);
  } catch (error) {
    console.error(error);
    if (win && !win.isDestroyed()) console.error(await win.webContents.executeJavaScript(`({
      error:document.querySelector('.render-error-page')?.innerText,
      content:document.body.innerText.slice(0, 1400),
    })`).catch(() => null));
    exit = 1;
  } finally {
    if (evidence) fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({tokens:report.tokens, panels:report.panels.length, errors:report.errors,
      blockedHosts:report.blockedHosts, paidCalls:report.paidCalls, failures}));
    win?.destroy();
    await server?.close();
    app.exit(exit);
  }
});
