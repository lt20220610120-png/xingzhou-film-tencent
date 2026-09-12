const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('项目协作分析把当前配置的模型名称传给 ai-chat', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  const run = ui.match(/const runAnalysis[\s\S]*?const stopAnalysis/)?.[0] || '';
  assert.match(run, /api\.aiChat\(\{[\s\S]*?model:\s*profile\.model/);
});

test('项目协作资产图片可点击进入居中预览并用滚轮缩放', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  const cloud = read('cloud-backend/src/collab.cjs');
  assert.match(ui, /function ImageLightbox/);
  assert.match(ui, /createPortal/);
  assert.match(ui, /onWheel/);
  assert.match(ui, /setPreviewImage/);
  assert.match(ui, /collab-image-lightbox/);
  assert.match(ui, /setLocalImages/);
  assert.match(ui, /return attached/);
  assert.match(cloud, /asset-image-record[\s\S]*?signDownload/);
});

test('切换人物、场景或道具时图片状态按资产 ID 隔离，不能串台', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /<AssetDetail key=\{selected\.id\}/);
  assert.match(ui, /setLocalImages\(\[\]\)/);
  assert.match(ui, /\[asset\.id\]/);
});

test('分析不再重复上传整部剧本，画风不发送给美术清单 Agent', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  const run = ui.match(/const runAnalysis[\s\S]*?const stopAnalysis/)?.[0] || '';
  const skill = read('core/collabArtSkill.js');
  assert.doesNotMatch(run, /updates:\s*\{\s*script,\s*genre/);
  assert.match(ui, /selectedStyle/);
  const perEpisode = skill.match(/export const buildEpisodeAnalysisMessages[\s\S]*?\];/)?.[0] || '';
  assert.doesNotMatch(perEpisode, /画风：/);
});

test('腾讯云 PostgreSQL 列表查询不会按项目成员数量复制资产和媒体', () => {
  const repo = read('cloud-backend/src/postgres-repository.cjs');
  const listAssets = repo.match(/async listAssets[\s\S]*?async createAsset/)?.[0] || '';
  const listMedia = repo.match(/async listMedia[\s\S]*?async findMedia/)?.[0] || '';
  assert.doesNotMatch(listAssets, /left join collab_members/);
  assert.match(listAssets, /exists\s*\(select 1 from collab_members/i);
  assert.doesNotMatch(listMedia, /left join collab_members/);
  assert.match(listMedia, /exists\s*\(select 1 from collab_members/i);
});

test('三种人物画风前置保持启用，分析恢复为稳定的逐集请求', () => {
  const store = read('core/collabStore.js');
  const skill = read('core/collabArtSkill.js');
  const ui = read('src/v06/CollabWorkspace.jsx');
  for (const style of ['AI真人', '3D动漫', '2D动漫']) assert.match(store, new RegExp(`'${style}'`));
  assert.match(store, /真人拍摄，但不能跟现实当中任何的明星撞脸/);
  assert.match(store, /新中式3D国漫角色/);
  assert.match(store, /日本二次元动画风格/);
  assert.match(skill, /buildEpisodeAnalysisMessages/);
  assert.match(ui, /for \(const \[index, episode\] of analysisEpisodes\.entries\(\)\)/);
  assert.doesNotMatch(ui, /index \+= 3/);
});

test('资产人物区按角色主档案组织，并在角色下选择不同妆造分支', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /groupCharacterAssets/);
  assert.match(ui, /角色主档案/);
  assert.match(ui, /服装选择/);
  assert.match(ui, /character-outfit-picker/);
});
