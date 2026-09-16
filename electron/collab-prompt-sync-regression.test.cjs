const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('项目协作创建时持久保存导演项目来源ID', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /collabCreateProject\(\{ name: dp\.name, directorProjectId/);
});

test('项目协作列表继续包含有导演来源ID的普通协作项目', () => {
  const fn = read('supabase/functions/xingzhou-api/index.ts');
  assert.match(fn, /COLLAB_PROJECT_SENTINEL/);
  assert.match(fn, /isCollabProject/);
  assert.doesNotMatch(fn, /\.eq\('analysis_output',''\)/);
});

test('同步导演提示词沿用创建时关联，不再重复要求选择项目', () => {
  const ui = read('src/v06/StoryboardWorkbench.jsx');
  const server = read('cloud-backend/src/repository-extras.cjs');
  const source = read('cloud-backend/src/director-source.cjs');
  assert.doesNotMatch(ui,/setLinkChoices|collabLinkDirector|openLink/);
  assert.match(server,/require\('\.\/director-source\.cjs'\)/);
  assert.match(source,/return directors\.length\s*===\s*1\s*\?\s*directors\[0\]\s*:\s*null/);
  assert.match(source,/readableDirector[\s\S]*p\.owner_id=\$2 or exists/);
  assert.match(source,/analysis_output=\$1/);
  assert.doesNotMatch(ui,/directorCollabUpdateProject/);
});

test('无法唯一匹配来源时保留现有内容且不擅自重关联', () => {
  const ui = read('src/v06/StoryboardWorkbench.jsx');
  const server = read('cloud-backend/src/repository-extras.cjs');
  const source = read('cloud-backend/src/director-source.cjs');
  assert.doesNotMatch(ui,/setLinkChoices|collabLinkDirector|openLink/);
  assert.match(server,/require\('\.\/director-source\.cjs'\)/);
  assert.match(source,/return directors\.length\s*===\s*1\s*\?\s*directors\[0\]\s*:\s*null/);
  assert.match(server,/if\s*\(!director\)[\s\S]*return row/);
  assert.match(source,/analysis_output=\$1/);
  assert.doesNotMatch(ui,/directorCollabUpdateProject/);
});
