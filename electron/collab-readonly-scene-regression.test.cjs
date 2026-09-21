const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('项目协作分镜复用导演场景解析，不按数组索引或提示词强制改写集数', () => {
  const ui = read('src/v06/StoryboardWorkbench.jsx');
  const server = read('cloud-backend/src/repository-extras.cjs');
  assert.match(ui,/parseDirectorScenesReadonly\(episode.content/);
  assert.match(ui,/inferDirectorEpisodeNumber/);
  assert.match(ui,/parsed.length\?parsed.map/);
  assert.match(ui,/label.startsWith\(epNumber/);
});

test('同步导演项目时完整读取标题、内容、类型和提示词', async () => {
  const ui = read('src/v06/StoryboardWorkbench.jsx');
  const server = read('cloud-backend/src/repository-extras.cjs');
  assert.match(read('src/v06/CollabWorkspace.jsx'),/api.collabGetProject/);
  const {createDirectorSync}=await import('../core/cloudTraffic.js');
  const episode={id:'e',title:'标题',content:'正文',genre:'都市',prompts:['提示词']};let saved;
  await createDirectorSync()({id:'p',myRole:'producer'},{id:'d',episodes:[episode]},async payload=>(saved=payload));
  assert.deepEqual(saved.updates.episodes,[episode]);
  assert.match(server,/refreshDirectorPrompts/);
  assert.match(server,/mergeDirectorEpisodes/);
  assert.match(server,/script/);
  assert.doesNotMatch(ui,/collabReplaceAssets/);
});

test('项目协作导演提示词可编辑，但只回写项目协作独立云端副本', () => {
  const ui = read('src/v06/StoryboardWorkbench.jsx');
  const server = read('cloud-backend/src/repository-extras.cjs');
  assert.match(ui,/collabPatchStoryboard/);
  assert.match(ui,/base:savingDraft.base/);
  assert.match(ui,/updates:\{content:prompt,generationConfig\}/);
  assert.doesNotMatch(ui,/directorCollabUpdateProject/);
  assert.match(server,/for update/);
});

test('导演云端刷新显示旋转状态和自动消失的成功提示', () => {
  const ui = read('src/v06/DirectorWorkspace.jsx');
  assert.match(ui, /refreshingCloud/);
  assert.match(ui, /cloudRefreshNotice/);
  assert.match(ui, /className=\{refreshingCloud \? 'spin' : ''\}/);
  assert.match(ui, /setTimeout\(\(\) => setCloudRefreshNotice\(''\),/);
});
