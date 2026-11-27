const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const temp = fs.realpathSync(os.tmpdir());
const historicalCommit = 'd2ef1f2';
const projectHash = '#/canvas/canvas-upgrade-fixture';
const origin = 'xzapp://canvas';

if (!process.versions.electron) {
  const folder = fs.mkdtempSync(path.join(temp, 'xz-canvas-upgrade-'));
  try {
    const archive = path.join(folder, 'old.tar');
    execFileSync('git', ['archive', '--format=tar', '--output', archive, historicalCommit, 'canvas-app'], { cwd: root });
    execFileSync('tar', ['-xf', archive, '-C', folder]);
    for (const phase of ['seed', 'upgrade', 'restart']) {
      const env = { ...process.env, XZ_CANVAS_TEST_ROOT: folder, XZ_CANVAS_TEST_PHASE: phase };
      delete env.ELECTRON_RUN_AS_NODE;
      const result = spawnSync(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true, timeout: 60000 });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, 'Canvas verification failed in ' + phase);
    }
  } finally {
    if (path.dirname(fs.realpathSync(folder)) === temp) {
      fs.rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
  return;
}

const { app, BrowserWindow, session } = require('electron');
const { account, card, password, mockGateway } = require('./fixtures/packaged-credential-smoke.cjs');
const folder = fs.realpathSync(process.env.XZ_CANVAS_TEST_ROOT || '.');
const phase = process.env.XZ_CANVAS_TEST_PHASE;
assert.ok(path.dirname(folder) === temp && path.basename(folder).startsWith('xz-canvas-upgrade-'));
assert.ok(['seed', 'upgrade', 'restart'].includes(phase));
const legacy = phase === 'seed';
const userData = path.join(folder, 'userData');
const documents = path.join(folder, 'documents');
const deviceKey = path.join(folder, 'device-public-key.pem');
const gateway = mockGateway(legacy ? undefined : fs.readFileSync(deviceKey, 'utf8'));
account.roles = ['director'];
account.active_role = 'director';
const fixtureChannel = {
  id: 'canvas-upgrade-example', name: '旧用户自定义渠道', baseUrl: 'https://canvas.example.invalid',
  apiFormat: 'openai', apiKey: 'isolated-fixture', models: [{ name: 'custom-image', capability: 'image' }],
};
const mockMuse = { provider: 'museLocal', id: 'fixture-muse', name: 'Muse', kind: 'image', apiKey: 'mock-muse-key', endpoint: 'http://127.0.0.1:18610' };
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5sp31uAAAAAElFTkSuQmCC';
const storageFile = path.join(documents, '行舟影视资料', 'xingzhou-data.json');

app.getVersion = () => legacy ? '2.8.211' : require('../package.json').version;
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-networking');

// Mount the exact previously shipped static files behind the production protocol.
// Both phases exercise the real host renderer, preload, IPC, protocol and window protection.
const canvasProtocol = require('../electron/canvas-protocol.cjs');
const originalHandler = canvasProtocol.createCanvasProtocolHandler;
let seedNextCanvas = legacy;
if (legacy) {
  canvasProtocol.createCanvasProtocolHandler = options => {
    const serve = originalHandler({ ...options, appDir: path.join(folder, 'canvas-app') });
    return request => {
      if (seedNextCanvas && new URL(request.url).pathname === '/index.html') {
        seedNextCanvas = false;
        return serve(new Request(origin + '/configuration-cleanup.html'));
      }
      return serve(request);
    };
  };
}

const script = (fn, ...args) => '(' + fn.toString() + ')(...' + JSON.stringify(args) + ')';
const evaluate = (target, fn, ...args) => target.executeJavaScript(script(fn, ...args));
async function wait(target, fn, ...args) {
  for (let turn = 0; turn < 100; turn++) {
    const result = await evaluate(target, fn, ...args);
    if (result) return result;
    await delay(80);
  }
  const context = await evaluate(target, async () => ({
    href: location.href, title: document.title, body: document.body?.innerText.slice(0, 450),
    databases: await indexedDB.databases(),
  }));
  throw Error('Canvas check timed out: ' + fn + ' ' + JSON.stringify({ args, context }));
}
const click = (target, expected) => wait(target, label => {
  const button = [...document.querySelectorAll('button, [role="tab"], a')].find(element =>
    element.getClientRects().length && !element.disabled &&
    [element.getAttribute('aria-label'), element.title, element.textContent.trim(), element.querySelector('h2')?.textContent].includes(label));
  if (!button) return false;
  button.click();
  return true;
}, expected);

async function localDb(store, key, value) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('infinite-canvas');
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('app_state');
      request.result.createObjectStore('image_files');
    };
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(store)) {
        database.close();
        reject(Error('Canvas database store unavailable: ' + store));
        return;
      }
      const writing = value !== null;
      const transaction = database.transaction(store, writing ? 'readwrite' : 'readonly');
      const records = transaction.objectStore(store);
      const operation = writing
        ? records.put(store === 'image_files' ? new Blob([Uint8Array.from(atob(value), c => c.charCodeAt(0))], { type: 'image/png' }) : JSON.stringify(value), key)
        : records.get(key);
      transaction.oncomplete = () => {
        database.close();
        resolve(writing ? true : JSON.parse(operation.result));
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
}

const project = {
  id: 'canvas-upgrade-fixture', title: '旧用户验收画布', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  nodes: [
    { id: 'old-ref', type: 'image', title: '旧参考图', position: { x: 350, y: 120 }, width: 180, height: 150,
      metadata: { content: 'blob:xzapp://canvas/legacy-fixture', storageKey: 'old-image', naturalWidth: 1, naturalHeight: 1, mimeType: 'image/png', status: 'success' } },
    { id: 'old-text', type: 'text', title: '旧正文节点', position: { x: 600, y: 180 }, width: 230, height: 150,
      metadata: { content: '更新前的测试正文', status: 'success' } },
  ],
  connections: [{ id: 'old-reference', fromNodeId: 'old-ref', toNodeId: 'old-text' }],
  chatSessions: [], activeChatId: null, backgroundMode: 'lines', showImageInfo: false, viewport: { x: 0, y: 0, k: 0.8 },
};
const canvasStore = 'infinite-canvas:canvas_store';
const aiConfig = 'infinite-canvas:ai_config_store';
const workspaceButton = async contents => {
  await wait(contents, () => Boolean(document.querySelector('.v06-app:not([hidden]) #app-sidebar')));
  await wait(contents, () => {
    const button = [...document.querySelectorAll('#app-sidebar button')].find(element => element.textContent.trim() === '画布');
    button?.click();
    return Boolean(button);
  });
  for (let turn = 0; turn < 100; turn++) {
    const frame = contents.mainFrame.frames.find(frame => frame.url.startsWith(origin + '/index.html'));
    if (frame) return frame;
    await delay(80);
  }
  throw Error('Missing embedded canvas frame');
};

async function checkCanvas(frame, requireImage) {
  assert.equal(await evaluate(frame, () => self.origin), origin);
  assert.equal(await evaluate(frame, () => location.hash), projectHash);
  await wait(frame, () => document.querySelector('[data-node-id="old-text"]')?.textContent.includes('更新前的测试正文'));
  if (requireImage) {
    await wait(frame, () => {
      const image = document.querySelector('[data-node-id="old-ref"] img');
      return image?.src.startsWith('blob:xzapp://canvas/') && image.naturalWidth > 0;
    });
  }
  const state = await evaluate(frame, localDb, 'app_state', canvasStore, null);
  assert.deepEqual(state.state.projects[0].connections.filter(item => item.id === 'old-reference'), project.connections);
  assert.deepEqual(state.state.deletedProjects, [{ id: 'preexisting-deletion', deletedAt: '2026-01-01T00:00:00Z' }]);
  return state.state.projects[0];
}

async function checkSettings(frame) {
  const config = await evaluate(frame, key => JSON.parse(localStorage.getItem(key)).state.config, aiConfig);
  assert.deepEqual(config.channels.find(channel => channel.id === fixtureChannel.id), fixtureChannel);
  assert.equal(config.imageModel, fixtureChannel.id + '::custom-image');
  const muse = config.channels.find(channel => channel.id === 'xingzhou-muse-local');
  assert.equal(muse?.baseUrl, mockMuse.endpoint);
  assert.deepEqual(muse.models.map(model => model.capability), ['image', 'video']);
}

async function checkSelectAdapter(frame) {
  await evaluate(frame, () => {
    const select = document.createElement('select');
    select.id = 'desktop-select-fixture';
    select.style.width = '120px';
    select.add(new Option('旧渠道的超长测试模型名称'.repeat(10), 'test'));
    document.body.append(select);
  });
  await wait(frame, () => {
    const select = document.getElementById('desktop-select-fixture');
    const selected = select.querySelector('selectedcontent');
    return getComputedStyle(select).appearance === 'base-select' &&
      selected?.scrollWidth > selected?.clientWidth && select.title === select.selectedOptions[0].label;
  });
  await evaluate(frame, () => document.getElementById('desktop-select-fixture').remove());
}

async function seedCanvas(target) {
  await wait(target, () => document.title === 'Canvas configuration');
  await evaluate(target, localDb, 'image_files', 'old-image', png);
  await evaluate(target, localDb, 'app_state', canvasStore, {
    state: { projects: [project], deletedProjects: [{ id: 'preexisting-deletion', deletedAt: '2026-01-01T00:00:00Z' }] }, version: 0,
  });
  await evaluate(target, (key, fixture) => localStorage.setItem(key, JSON.stringify({
    state: { config: { channels: [fixture], imageModel: fixture.id + '::custom-image' } }, version: 0,
  })), aiConfig, fixtureChannel);
  await evaluate(target, () => location.reload());
}

function findIndependentWindow(main) {
  return BrowserWindow.getAllWindows().find(candidate => candidate !== main && candidate.webContents.getURL().startsWith(origin));
}

async function exercise(main) {
  const host = main.webContents;
  if (legacy) {
    const loggedIn = await evaluate(host, async ({ card, username, password }) => {
      await window.xingzhou.licensePrepare({ code: card });
      return window.xingzhou.authLogin({ username, password });
    }, { card, username: account.username, password });
    assert.equal(loggedIn.id, account.id);
    fs.writeFileSync(deviceKey, gateway.publicKey());
  }
  const frame = await workspaceButton(host);
  if (legacy) {
    await seedCanvas(frame);
    await wait(frame, () => document.body.innerText.includes('旧用户验收画布'));
    await click(frame, project.title);
  }
  await wait(host, expected => localStorage.getItem('xz-canvas-last-route') === expected, projectHash);
  const canvas = await checkCanvas(frame, true);
  await checkSettings(frame);
  if (phase === 'upgrade') {
    await checkSelectAdapter(frame);
    await click(frame, '切换为缩略图');
    await wait(frame, () => Boolean(document.querySelector('[aria-label="切换为列表"]')));
    await wait(frame, () => [...document.querySelectorAll('[data-node-item] img')].some(image => image.naturalWidth > 0));
    await evaluate(frame, () => {
      const element = document.querySelector('[data-node-id="old-text"]');
      const { left, top } = element.getBoundingClientRect();
      const options = { bubbles: true, button: 0, clientX: left + 10, clientY: top + 10 };
      element.dispatchEvent(new MouseEvent('mousedown', options));
      window.dispatchEvent(new MouseEvent('mouseup', options));
    });
    await click(frame, '居中聚焦');
    await wait(frame, async () => {
      const state = await new Promise(resolve => {
        const request = indexedDB.open('infinite-canvas');
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('app_state').objectStore('app_state').get('infinite-canvas:canvas_store');
          read.onsuccess = () => { db.close(); resolve(JSON.parse(read.result)); };
        };
      });
      const viewport = state.state.projects[0].viewport;
      return viewport.x !== 0 || viewport.y !== 0;
    });
    await evaluate(frame, () => {
      const element = document.querySelector('[data-node-id="old-text"]');
      const { left, top } = element.getBoundingClientRect();
      element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: left + 20, clientY: top + 20 }));
    });
    await click(frame, '复制');
    await wait(frame, () => Boolean(document.querySelector('[data-node-id]:not([data-node-id="old-ref"], [data-node-id="old-text"])')));
    await delay(600); // Upstream batches IndexedDB project commits by 400 ms.
    const duplicate = await checkCanvas(frame, true);
    const copy = duplicate.nodes.find(node => !project.nodes.some(old => old.id === node.id));
    assert.ok(copy, 'duplicate node missing from persisted canvas');
    assert.ok(duplicate.connections.some(edge => edge.fromNodeId === 'old-ref' && edge.toNodeId === copy.id));
    await evaluate(frame, () => { location.hash = '#/config'; });
    await click(frame, '偏好设置');
    await wait(frame, () => document.body.innerText.includes('已有内容的节点再次生成时'));
    await wait(frame, () => {
      const label = [...document.querySelectorAll('label')].find(element => element.textContent.includes('原地重新生成'));
      if (!label?.getClientRects().length) return false;
      label.click();
      const text = [...document.querySelectorAll('span')].find(element => element.textContent === '选中自动居中');
      const toggle = text?.parentElement.querySelector('[role="switch"]');
      if (!toggle) return false;
      toggle.click();
      return true;
    });
    await wait(frame, key => {
      const { config } = JSON.parse(localStorage.getItem(key)).state;
      return config.nodeRegenerateBehavior === 'overwrite' && config.autoFocusOnSelect;
    }, aiConfig);
    await evaluate(frame, () => {
      if (navigator.storage) Object.defineProperty(navigator.storage, 'estimate', { configurable: true, value: undefined });
    });
    await click(frame, '本地存储');
    await wait(frame, () => document.body.innerText.includes('infinite-canvas') && !document.body.innerText.includes('读取本地存储失败'));
    await evaluate(frame, expected => { location.hash = expected; }, projectHash);
    await wait(host, expected => localStorage.getItem('xz-canvas-last-route') === expected, projectHash);
  } else if (phase === 'restart') {
    assert.deepEqual(await evaluate(frame, key => {
      const { config } = JSON.parse(localStorage.getItem(key)).state;
      return [config.nodeRegenerateBehavior, config.autoFocusOnSelect];
    }, aiConfig), ['overwrite', true]);
  }

  seedNextCanvas = legacy;
  await evaluate(host, () => window.xingzhou.openCanvasWindow());
  let independent;
  for (let turn = 0; turn < 100 && !independent; turn++) {
    independent = findIndependentWindow(main);
    if (!independent) await delay(80);
  }
  assert.ok(independent, 'missing independent production canvas window');
  const separate = independent.webContents;
  if (legacy) await seedCanvas(separate);
  await wait(separate, () => document.body.innerText.includes('旧用户验收画布'));
  await checkSettings(separate);
  await click(separate, project.title);
  await checkCanvas(separate, true);
  assert.equal(await evaluate(host, () => localStorage.getItem('xz-canvas-last-route')), projectHash);
  return { oldProject: canvas.id, independentWindow: true, oldImage: true, oldChannel: true, muse: true, route: projectHash, phase };
}

const smoke = require.resolve('../electron/packaged-smoke.cjs');
require.cache[smoke] = { exports: () => {
  for (const [name, directory] of Object.entries({ appData: folder, userData, sessionData: userData, documents, temp: path.join(folder, 'temp') })) {
    fs.mkdirSync(directory, { recursive: true });
    app.setPath(name, directory);
  }
  if (legacy) {
    fs.mkdirSync(path.dirname(storageFile), { recursive: true });
    fs.writeFileSync(storageFile, JSON.stringify({ mediaProfiles: [mockMuse] }));
  }
  globalThis.fetch = async () => { throw Error('Outbound network blocked during canvas verification'); };
  app.whenReady().then(() => {
    require('../electron/cloud-access-service.cjs').configureCloudFetch(gateway.fetch);
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true }));
  });
  app.once('browser-window-created', (_, main) => {
    main.webContents.once('did-finish-load', () => {
      exercise(main).then(result => {
        console.log(JSON.stringify({ ...result, stage: phase, outboundRequestsAllowed: 0 }));
        app.quit();
      }, error => {
        console.error(error);
        app.exit(1);
      });
    });
  });
  return true;
} };
require('../electron/main.cjs');
