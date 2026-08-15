const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('添加集数弹窗必须挂在 body portal，在分集页面点击也能立即弹出', () => {
  const ui = read('src/v06/DirectorWorkspace.jsx');
  // 弹窗不能只渲染在 activePane === 'master' 分支里
  assert.match(ui, /addEpisodeOpen && createPortal\(/);
  const masterBranch = ui.slice(ui.indexOf("activePane === 'master' ? ("), ui.indexOf("activeEpisode && (activeEpisode.kind === 'setting'"));
  assert.doesNotMatch(masterBranch, /addEpisodeOpen/);
});

test('从分集页面添加集数时 masterDraft 为空必须回退到项目 masterScript', () => {
  const ui = read('src/v06/DirectorWorkspace.jsx');
  assert.match(ui, /const baseScript = masterDraft\.trim\(\) \? masterDraft : \(selectedProject\.masterScript \|\| ''\)/);
});

test('历史提示词页签存在，且生成路径都会写入项目级 promptHistory', () => {
  const ui = read('src/v06/DirectorWorkspace.jsx');
  assert.match(ui, /历史提示词/);
  assert.match(ui, /mode === 'history'/);
  const calls = ui.match(/appendDirectorPromptHistory\(/g) || [];
  assert.ok(calls.length >= 3, `runSkill/runCreativeScene/runQuickScene 三条生成路径都要调用 appendDirectorPromptHistory（实际 ${calls.length} 处）`);
});

test('删除/编辑提示词必须同时作用于分集与历史（deleteDirectorPromptsEverywhere）', () => {
  const ui = read('src/v06/DirectorWorkspace.jsx');
  assert.match(ui, /deleteDirectorPromptsEverywhere\(s, project\.id, \[promptId\]\)/);
  assert.match(ui, /deleteDirectorPromptsEverywhere\(s, project\.id, \[\.\.\.selectedPromptIds\]\)/);
  assert.match(ui, /updateDirectorPromptEverywhere\(s, project\.id, promptId/);
});

test('历史提示词面板支持按集分卡片与导出文档', () => {
  const ui = read('src/v06/DirectorWorkspace.jsx');
  const css = read('src/v100-compat.css');
  assert.match(ui, /PromptHistoryPanel/);
  assert.match(ui, /groupDirectorPromptHistory/);
  assert.match(ui, /buildPromptHistoryExport/);
  assert.match(ui, /saveTxt/);
  assert.match(css, /\.prompt-history-grid\{/);
  assert.match(css, /\.prompt-history-card\{/);
});

test('导演工作台分组选择要记忆在 localStorage，回来时不重置到工作台', () => {
  const hub = read('src/v06/ProjectCardHub.jsx');
  assert.match(hub, /xz-cardhub-group-/);
  assert.match(hub, /localStorage\.getItem\(groupMemoryKey\)/);
  assert.match(hub, /localStorage\.setItem\(groupMemoryKey, next\)/);
});
