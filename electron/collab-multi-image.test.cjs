const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('资产图片采用追加式多图记录而不是覆盖 image_url', () => {
  const sql = read('scripts/supabase-collab-setup.sql');
  const edge = read('supabase/functions/xingzhou-api/index.ts');
  const service = read('electron/collab-service.cjs');
  assert.match(sql, /asset_id uuid references collab_assets/);
  assert.match(sql, /object_path text/);
  assert.match(edge, /asset-image-record/);
  assert.match(edge, /asset-image-delete/);
  assert.match(edge, /asset-images-clear/);
  assert.match(service, /asset-image-record/);
  assert.doesNotMatch(service, /updates:\s*\{\s*image_url:/);
});

test('美术资产界面支持多图选择、删除、单图下载和批量导出', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  const preload = read('electron/preload.cjs');
  const main = read('electron/main.cjs');
  for (const text of ['删除图片', '单独下载', '导出本集图片', '导出整部剧图片', '清除图片缓存']) assert.match(ui, new RegExp(text));
  assert.match(preload, /collabDeleteAssetImage/);
  assert.match(preload, /collabExportImages/);
  assert.match(main, /collab-export-images/);
});

test('美术单项生成使用按资产隔离的并发状态', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /generatingAssetIds/);
  assert.match(ui, /onGenerateImage/);
  assert.match(ui, /setGeneratingAssetIds/);
});

test('取消全选后单独勾选不会被资产刷新重新覆盖', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.match(ui, /useEffect\(\(\) => \{[\s\S]*setBatchSelectedIds\([\s\S]*\}, \[episode\]\)/);
  assert.match(ui, /collab-art-head-left/);
  assert.match(ui, /collab-art-head-right/);
});

test('单图下载使用文件保存对话框，整集下载才创建文件夹', () => {
  const main = read('electron/main.cjs');
  assert.match(main, /archive\s*=\s*true/);
  assert.match(main, /showSaveDialog/);
  assert.match(main, /const dir=ensureDir\(path\.join/);
  assert.match(main, /const uniqueFile=/);
  assert.match(main, /没有可导出的图片/);
});

test('美术和资产总览均使用同步请求锁，并忽略过期的并发刷新', () => {
  const ui = read('src/v06/CollabWorkspace.jsx');
  assert.ok((ui.match(/generatingAssetIdsRef = useRef/g) || []).length >= 2);
  assert.match(ui, /refreshRequestRef/);
  assert.match(ui, /requestId !== refreshRequestRef\.current/);
  assert.match(ui, /const openProject = async \(id\) => \{\s*const requestId = \+\+refreshRequestRef\.current/);
  assert.match(ui, /collab-back[\s\S]{0,180}refreshRequestRef\.current \+= 1/);
});
