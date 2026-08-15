const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// ---------- 画布状态层（ESM 动态导入） ----------
test('画布状态层：建画布、加节点、更新与删除', async () => {
  const store = await import('../core/canvasStore.js');
  const { createInitialState } = await import('../core/projectStore.js');
  let state = createInitialState();
  state = store.createCanvas(state, '分镜画布');
  assert.equal(state.canvases.length, 1);
  assert.equal(state.activeCanvasId, state.canvases[0].id);
  const canvasId = state.canvases[0].id;
  state = store.addCanvasNode(state, canvasId, 'image', { x: 100, y: 80 });
  state = store.addCanvasNode(state, canvasId, 'video');
  assert.equal(state.canvases[0].nodes.length, 2);
  assert.equal(state.canvases[0].nodes[0].params.size, '1024x1024');
  assert.equal(state.canvases[0].nodes[1].params.ratio, '16:9');
  const nodeId = state.canvases[0].nodes[0].id;
  state = store.updateCanvasNode(state, canvasId, nodeId, { prompt: '一只猫' });
  assert.equal(state.canvases[0].nodes[0].prompt, '一只猫');
  state = store.removeCanvasNode(state, canvasId, nodeId);
  assert.equal(state.canvases[0].nodes.length, 1);
  state = store.deleteCanvas(state, canvasId);
  assert.equal(state.canvases.length, 0);
  assert.equal(state.activeCanvasId, null);
});

test('媒体 API 配置：按类型分别启用图片与视频接口', async () => {
  const store = await import('../core/canvasStore.js');
  const { createInitialState } = await import('../core/projectStore.js');
  let state = createInitialState();
  state = store.addMediaProfile(state, { kind: 'image', name: '即梦图片', endpoint: 'https://x/api/v3', model: 'm1' });
  state = store.addMediaProfile(state, { kind: 'video', name: 'Seedance', endpoint: 'https://x/api/v3', model: 'm2' });
  assert.equal(store.activeMediaProfile(state, 'image').name, '即梦图片');
  assert.equal(store.activeMediaProfile(state, 'video').name, 'Seedance');
  state = store.removeMediaProfile(state, state.mediaProfiles[0].id);
  assert.equal(state.activeImageApiId, null);
  assert.equal(store.activeMediaProfile(state, 'image'), null);
  assert.equal(store.activeMediaProfile(state, 'video').name, 'Seedance');
});

// ---------- 媒体生成服务 ----------
test('媒体服务：端点归一化与视频请求内容构造', () => {
  const { normalizeBase, buildVideoContent } = require('./media-service.cjs');
  assert.equal(normalizeBase('https://a.com/api/v3/'), 'https://a.com/api/v3');
  assert.equal(normalizeBase('https://a.com/api/v3/images/generations'), 'https://a.com/api/v3');
  assert.equal(normalizeBase('https://a.com/api/v3/contents/generations/tasks'), 'https://a.com/api/v3');
  const content = buildVideoContent({ prompt: '海边日落', ratio: '9:16', duration: 5, firstFrameDataUrl: 'data:image/png;base64,xx' });
  assert.equal(content[0].text, '海边日落 --ratio 9:16 --duration 5');
  assert.equal(content[1].role, 'first_frame');
});

// ---------- 接线（源码断言） ----------
test('主进程注册画布媒体 IPC 与 xzmedia 协议', () => {
  const src = read('electron/main.cjs');
  for (const channel of ['media-generate-image', 'media-generate-video', 'media-import-file', 'media-export-file']) {
    assert.match(src, new RegExp(`ipcMain\\.handle\\('${channel}'`), `缺少 ${channel}`);
  }
  assert.match(src, /protocol\.handle\('xzmedia'/);
  assert.match(src, /画布素材/);
});

test('preload 暴露媒体生成 API', () => {
  const src = read('electron/preload.cjs');
  for (const api of ['mediaGenerateImage', 'mediaGenerateVideo', 'mediaImportFile', 'mediaExportFile', 'onMediaTaskStatus']) {
    assert.match(src, new RegExp(api), `preload 缺少 ${api}`);
  }
});

test('导演侧边栏包含画布入口，Electron 内嵌 iframe、浏览器回退 CanvasWorkspace', () => {
  const src = read('src/App.jsx');
  assert.match(src, /\['canvas', Palette, '画布'\]/);
  assert.match(src, /nav === 'canvas' && \(window\.xingzhou/);
  assert.match(src, /<CanvasWorkspace/);
  const nav = src.slice(src.indexOf('const directorNav'), src.indexOf('const adminNav'));
  assert.match(nav, /canvas/, '画布必须在导演导航中');
});

test('画布工作区具备节点生成、上传、缩放与接口设置能力', () => {
  const src = read('src/v06/CanvasWorkspace.jsx');
  for (const feature of ['mediaGenerateImage', 'mediaGenerateVideo', 'mediaImportFile', 'MediaApiSettings', 'onWheel', 'firstFrameNodeId', 'xzmedia://']) {
    assert.match(src, new RegExp(feature.replace(/[/:]/g, (m) => `\\${m}`)), `画布缺少 ${feature}`);
  }
});

test('视频模型能力限制秒数、分辨率与音画同出', async () => {
  const store = await import('../core/canvasStore.js');
  assert.equal(Math.max(...store.videoModelCapabilities('Seedance 2.0').durations), 15);
  assert.equal(Math.max(...store.videoModelCapabilities('Seedance 2.5').durations), 30);
  assert.ok(store.videoModelCapabilities('Seedance 2.5').resolutions.includes('4K'));
});

test('画布样式自带滚动/布局容器且已在 main.jsx 引入', () => {
  assert.match(read('src/canvas.css'), /\.canvas-workspace\{position:relative;height:100vh/);
  assert.match(read('src/main.jsx'), /import '\.\/canvas\.css'/);
});
