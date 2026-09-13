const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('项目协作分镜与导演快速模式复用同一场景划分器', () => {
  const ui = read('src/v06/StoryboardWorkbench.jsx');
  const server = read('cloud-backend/src/repository-extras.cjs');
  assert.match(ui,/parseDirectorScenes\(episode.content/);
  assert.match(ui,/inferDirectorEpisodeNumber/);
  assert.match(ui,/parsed.length\?parsed.map/);
  assert.match(ui,/label.startsWith\(epNumber/);
});

test('当前集场景下拉只来自当前集场景划分，不混入异常提示词标签', () => {
  const ui = read('src/v06/StoryboardWorkbench.jsx');
  const server = read('cloud-backend/src/repository-extras.cjs');
  assert.match(ui,/parseDirectorScenes\(episode.content/);
  assert.match(ui,/inferDirectorEpisodeNumber/);
  assert.match(ui,/parsed.length\?parsed.map/);
  assert.match(ui,/label.startsWith\(epNumber/);
});

test('集数身份不受串集提示词标签影响', () => {
  const parser = read('core/scriptImport.js');
  assert.doesNotMatch(parser, /inferDirectorEpisodeNumber[\s\S]*episode\?\.prompts/);
});

test('导演管理协作弹框通过 document.body portal 居中且不受项目卡滚动容器遮挡', () => {
  const ui = read('src/v06/DirectorWorkspace.jsx');
  assert.match(ui, /import \{ createPortal \} from 'react-dom'/);
  assert.match(ui, /return createPortal\(/);
  assert.match(ui, /document\.body/);
});
