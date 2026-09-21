const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('同步导演提示词同时更新协作云端总剧本和完整分集，但不替换美术资产', async () => {
  const ui = read('src/v06/StoryboardWorkbench.jsx');
  const server = read('cloud-backend/src/repository-extras.cjs');
  assert.match(read('src/v06/CollabWorkspace.jsx'),/api.collabGetProject/);
  const {createDirectorSync}=await import('../core/cloudTraffic.js');
  let saved;
  await createDirectorSync()({id:'p',myRole:'producer'},{id:'d',masterScript:'完整剧本',episodes:[{id:'e',content:'第一集'}]},async payload=>(saved=payload));
  assert.deepEqual(saved,{projectId:'p',scope:'director-sync',updates:{script:'完整剧本',episodes:[{id:'e',content:'第一集'}]}});
  assert.match(server,/refreshDirectorPrompts/);
  assert.match(server,/mergeDirectorEpisodes/);
  assert.match(server,/script/);
  assert.doesNotMatch(ui,/collabReplaceAssets/);
});

test('美术分析按导演分集逐集调用同一模型会话并聚合完整结果', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  const skill = read('core/collabArtSkill.js');
  assert.match(ui, /buildEpisodeAnalysisMessages/);
  assert.match(ui, /runArtAnalysis/);
  assert.match(read('core/artAnalysisRunner.js'), /await save\(ledger\)/);
  assert.match(skill, /buildEpisodeAnalysisMessages/);
  assert.match(skill, /第\$\{episodeNumber\}集/);
});

test('逐集分析保证每个剧本分集都有美术集入口', async () => {
  const { ensureArtEpisodeCoverage } = await import('../core/collabStore.js');
  const parsed = { episodes: [{ episode: 1, character: [], scene: [], prop: [] }, { episode: 3, character: [], scene: [], prop: [] }] };
  assert.deepEqual(ensureArtEpisodeCoverage(parsed, 3).episodes.map((item) => item.episode), [1, 2, 3]);
});

test('美术界面的集数以协作项目完整分集为下限，不因某集没有资产而缺失', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /scriptEpisodeCount/);
  assert.match(ui, /Array\.from\(\{ length: scriptEpisodeCount \}/);
  assert.match(ui, /episodeNumbersFromAssets\(assets\)/);
});

test('同步不改美术资产；分析按集增量合并，保留已有图片与编辑', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  const sync = ui.match(/const applyDirectorPrompts[\s\S]*?const syncDirectorPrompts/)?.[0] || '';
  const analysis = ui.match(/const runAnalysis[\s\S]*?return \(/)?.[0] || '';
  assert.doesNotMatch(sync, /collabReplaceAssets/);
  assert.match(analysis,/runArtAnalysis/);assert.doesNotMatch(analysis,/collabReplaceAssets/);
});
