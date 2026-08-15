const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('API 页面将语言、图片和视频接口分区展示', () => {
  const ui = read('src/v06/GlobalTools.jsx');
  const media = read('src/v06/CanvasWorkspace.jsx');
  assert.match(ui, /图片生成 API/);
  assert.match(ui, /视频生成 API/);
  assert.match(media, /renderProfiles\('image'\)/);
  assert.match(media, /renderProfiles\('video'\)/);
});

test('美术按集支持全选、取消全选和并发批量生成', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /一键生成/);
  assert.match(ui, /取消全选/);
  assert.match(ui, /Promise\.allSettled\(jobs\.map/);
  assert.match(ui, /checked=\{batchSelectedIds\.includes/);
});
