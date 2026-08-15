const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('项目协作分镜复用导演场景解析，不按数组索引或提示词强制改写集数', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  const parser = read('core/scriptImport.js');
  assert.match(ui, /parseDirectorScenes\(episode\.content/);
  assert.doesNotMatch(ui, /const epNumber = epIndex !== null \? epIndex \+ 1/);
  assert.doesNotMatch(parser, /inferDirectorEpisodeNumber[\s\S]*episode\?\.prompts/);
});

test('同步导演项目时完整读取标题、内容、类型和提示词', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /source\.episodes/);
  assert.match(ui, /directorCollabGetProject\(\{ projectId: sourceProject\.id \}\)/);
  assert.match(ui, /title: sourceEpisode\.title/);
  assert.match(ui, /content: sourceEpisode\.content/);
  assert.match(ui, /kind: sourceEpisode\.kind/);
});

test('项目协作导演提示词可编辑，但只回写项目协作独立云端副本', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /const saveStoryboardPrompt = async/);
  assert.match(ui, /api\.collabUpdateProject\(\{ projectId: project\.id, scope: 'storyboard', updates: \{ episodes: nextEpisodes \} \}\)/);
  assert.doesNotMatch(ui, /saveStoryboardPrompt[\s\S]{0,800}directorCollabUpdateProject/);
});

test('导演云端刷新显示旋转状态和自动消失的成功提示', () => {
  const ui = read('src/v06/DirectorWorkspace.jsx');
  assert.match(ui, /refreshingCloud/);
  assert.match(ui, /cloudRefreshNotice/);
  assert.match(ui, /className=\{refreshingCloud \? 'spin' : ''\}/);
  assert.match(ui, /setTimeout\(\(\) => setCloudRefreshNotice\(''\),/);
});
