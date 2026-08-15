const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('同步导演提示词同时更新协作云端总剧本和完整分集，但不替换美术资产', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  const apply = ui.match(/const applyDirectorPrompts[\s\S]*?const syncDirectorPrompts/)?.[0] || '';
  assert.match(apply, /sourceProject\.masterScript|sourceProject\.script/);
  assert.match(apply, /updates:\s*\{[^}]*script:[^}]*episodes:/s);
  assert.match(apply, /scope:\s*'director-sync'/);
  assert.doesNotMatch(apply, /collabReplaceAssets/);
  assert.match(ui, /已重新读取/);
});

test('美术分析按导演分集逐集调用同一模型会话并聚合完整结果', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  const skill = read('core/collabArtSkill.js');
  assert.match(ui, /buildEpisodeAnalysisMessages/);
  assert.match(ui, /for \(const \[index, episode\] of analysisEpisodes\.entries\(\)\)/);
  assert.match(ui, /conversationHistory/);
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

test('同步更新剧本后只有再次分析才替换美术与资产', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  const sync = ui.match(/const applyDirectorPrompts[\s\S]*?const syncDirectorPrompts/)?.[0] || '';
  const analysis = ui.match(/const runAnalysis[\s\S]*?return \(/)?.[0] || '';
  assert.doesNotMatch(sync, /collabReplaceAssets/);
  assert.match(analysis, /collabReplaceAssets/);
});
