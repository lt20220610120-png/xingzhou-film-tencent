const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('协作美术页追加集数只调用隔离的 append API，并明确单向隔离', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /function AppendCollabEpisodeDialog/);
  assert.match(ui, /api\.collabAppendEpisode\(\{\s*projectId:\s*project\.id,\s*episodeNumber:\s*number,\s*title:\s*title\.trim\(\)[\s\S]*?content:\s*content\.trim\(\)/);
  assert.match(ui, /只追加到当前协作项目/);
  assert.match(ui, /不会更新导演工作台|不反向同步到导演工作台/);
  const dialog = ui.match(/function AppendCollabEpisodeDialog[\s\S]*?function AssetImageBox/)?.[0] || '';
  assert.doesNotMatch(dialog, /collabUpdateProject|director/i);
});

test('美术全集与空资产状态都保留添加集数及单集分析入口', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  const art = ui.match(/function ArtSection[\s\S]*?function AssetsSection/)?.[0] || '';
  assert.match(ui, /添加集数/);
  assert.match(ui, /生成本集 \/ 继续/);
  assert.match(ui, /重新生成本集美术/);
  assert.match(ui, /targetEpisodeNumbers:\s*\[episode\]/);
  assert.match(ui, /existingAssets:\s*assets/);
  assert.doesNotMatch(art, /if \(!assets\.length\)/);
});

test('信息页与美术页复用项目级后台分析入口和 pending 同步', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /const collabAnalysisJobs = new Map\(\)/);
  assert.match(ui, /function startCollabArtAnalysis/);
  assert.match(ui, /function syncPendingArtAnalysis/);
  const calls = ui.match(/startCollabArtAnalysis\(\{/g) || [];
  assert.ok(calls.length >= 2, `信息页和美术页应共用入口，实际 ${calls.length} 处`);
});

test('云端旧资产在所有 setAssets 和分析上下文边界统一规范化', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /normalizeArtAssets/);
  for (const match of ui.matchAll(/setAssets\(([^;]+)\)/g)) {
    assert.match(match[1], /normalizeArtAssets|normalizedAssets|\[\]/, `未规范化 setAssets：${match[0]}`);
  }
});

test('追加弹窗和单集分析栏有独立响应式布局，不挤压原生图工具栏', () => {
  const css = read('src/art-workbench.css');
  assert.match(css, /\.collab-episode-analysisbar\s*\{/);
  assert.match(css, /\.collab-append-episode-modal\s*\{/);
  assert.match(css, /grid-template-columns/);
  assert.match(css, /@media \(max-width:\s*700px\)/);
});

test('付费重跑使用应用内确认，取消不触发 force，确认后才只跑本集', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  const art = ui.match(/function ArtSection[\s\S]*?function AssetsSection/)?.[0] || '';
  assert.match(ui, /function ForceEpisodeAnalysisDialog/);
  assert.match(ui, /再次调用模型并产生费用/);
  assert.match(ui, /旧(?:结果|图片)[^。]*不(?:会)?删除/);
  assert.doesNotMatch(art.match(/const analyzeEpisode[\s\S]*?useEffect/)?.[0] || '', /window\.confirm/);
  assert.match(art, /onConfirm=\{\(\) => \{ setForceConfirmOpen\(false\); analyzeEpisode\(true\); \}\}/);
  assert.match(art, /onCancel=\{\(\) => setForceConfirmOpen\(false\)\}/);
});

test('编号异常以界面错误阻止追加和分析，不在 render 中猜 ordinal', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /inspectCollabEpisodes/);
  assert.match(ui, /collabEpisodeNumber\(\{\s*episodeNumber:\s*number,\s*title,\s*content/s);
  assert.match(ui, /episodeIdentityError/);
  assert.doesNotMatch(ui, /collabEpisodeNumber\([^)]*,\s*(?:index|ordinal|i\s*\+\s*1)/);
});

test('V5人物差异资产在单张与批量生图前要求基准图，scene 提示使用布局光线文案', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /requiresCharacterReference/);
  assert.match(ui, /请先生成或选择人物基准参考图/);
  assert.match(ui, /明确不引用参考[^<]*不会锁定身份一致性/);
  assert.match(ui, /保持同地点布局，仅改变时间光线/);
  const batch = ui.match(/const generateBatch[\s\S]*?if \(episode === null\)/)?.[0] || '';
  assert.match(batch, /requiresCharacterReference/);
});
