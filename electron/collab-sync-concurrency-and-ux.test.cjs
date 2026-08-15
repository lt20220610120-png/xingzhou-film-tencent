const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// 1. 云端管理入口仅制片可见
test('云端管理按钮只对制片显示，受邀用户不可见', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /onOpenCloudManager=\{isProducer \? \(\) => setCloudManagerOpen\(true\) : null\}/);
  assert.match(director, /headerExtra=\{onOpenCloudManager \? /);
});

// 2. 提示词闪跳修复：生成路径必须走原子追加，不能整组覆盖
test('生成提示词使用 appendDirectorEpisodePrompts 原子追加，云端轮询不会覆盖', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  const calls = director.match(/appendDirectorEpisodePrompts\(s, project\.id, episode\.id, newPrompts/g) || [];
  assert.ok(calls.length >= 3, `三条生成路径都要用原子追加（实际 ${calls.length} 处）`);
  assert.doesNotMatch(director, /prompts: updatedPrompts/);
});

test('云端项目 reconcile 合并本地与云端提示词而不是直接覆盖', () => {
  const core = read('core/directorCloudProjects.js');
  assert.match(core, /mergeCloudEpisodes/);
  assert.match(core, /deletedPromptIds/);
  assert.match(core, /episodes: mergeCloudEpisodes\(existing\.episodes/);
});

// 3. 并发生成
test('创造/快速模式按场景独立 running，可并发生成不同场景', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /runningScenes/);
  assert.match(director, /isSceneRunning\(sceneLabel\)/);
  assert.match(director, /markSceneRunning\(sceneLabel, true\)/);
  assert.match(director, /isSceneRunning\(currentScene\)/);
});

// 4. 刷新云端 = 双向合并
test('刷新云端按钮双向合并提示词并回推云端', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /mergeCloudEpisodes\(selectedProject\.episodes \|\| \[\], cloud\.episodes \|\| \[\]\)/);
  assert.match(director, /updates: \{ episodes: mergedEpisodes \}/);
});

// 5. 快速模式定位工具条固定
test('快速模式提示词标题与定位条 sticky 固定在顶部', () => {
  const css = read('src/v100-compat.css');
  assert.match(css, /\.quick-scene-prompts \.quick-scene-prompts-title\{position:sticky/);
  assert.match(css, /\.quick-scene-prompts \.prompt-locator-toolbar\{position:sticky/);
});

// 6. 提示词卡片按钮在顶部
test('提示词卡片操作按钮位于卡片顶部', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  const css = read('src/v100-compat.css');
  assert.match(director, /prompt-card-head/);
  assert.match(director, /prompt-actions top/);
  assert.match(css, /\.prompt-card-head\{display:flex/);
  const headIdx = director.indexOf('prompt-card-head');
  const contentIdx = director.indexOf('prompt-content');
  assert.ok(headIdx < contentIdx, '操作区必须渲染在内容之前');
});

// 7. 历史提示词选集导出
test('历史提示词支持选集导出、分开导出与汇总导出', () => {
  const director = read('src/v06/DirectorWorkspace.jsx');
  assert.match(director, /选集导出/);
  assert.match(director, /全部分开导出/);
  assert.match(director, /全部汇总导出/);
  assert.match(director, /saveTxtBatch/);
  const main = read('electron/main.cjs');
  assert.match(main, /save-txt-batch/);
  const preload = read('electron/preload.cjs');
  assert.match(preload, /saveTxtBatch/);
});

// 8. 云端页面缓存先显
test('项目协作使用本地缓存先显后台刷新，并记住上次打开的项目', () => {
  const collab = read('src/v06/CollabWorkspace.jsx');
  assert.match(collab, /xz-collab-cache-/);
  assert.match(collab, /xz-collab-last-project/);
  assert.match(collab, /writeCache\(`project-\$\{id\}`, p\)/);
  assert.match(collab, /localStorage\.removeItem\('xz-collab-last-project'\)/);
});

// 9. 人物/场景描述固定前缀
test('美术/资产人物与场景描述自动加固定前缀', () => {
  const store = read('core/collabStore.js');
  assert.match(store, /CHARACTER_PROMPT_PREFIX/);
  assert.match(store, /真人拍摄，但不能跟现实当中任何的明星撞脸/);
  assert.match(store, /只要场景不要出现任何人物/);
  assert.match(store, /withAssetPrefix/);
  const collab = read('src/v06/CollabWorkspace.jsx');
  assert.match(collab, /withAssetPrefix\(asset\.category, asset\.description \|\| ''\)/);
});

// 10. 分镜同步提示词读取云端完整文档
test('分镜同步提示词优先云端导演文档并拉取完整详情', () => {
  const collab = read('src/v06/CollabWorkspace.jsx');
  assert.match(collab, /const merged = \[\.\.\.cloud, \.\.\.local\]/);
  assert.match(collab, /directorCollabGetProject\(\{ projectId: sourceProject\.id \}\)/);
  assert.match(collab, /同步失败：/);
});
