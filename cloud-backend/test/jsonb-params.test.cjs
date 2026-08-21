const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'postgres-repository.cjs'), 'utf8');

// collab_projects.episodes 与 collab_assets.episodes 类型不同：
//   collab_projects.episodes 是 jsonb  -> 必须 JSON.stringify
//   collab_assets.episodes   是 int[]  -> 必须保持数组
test('写入 collab_projects.episodes（jsonb）必须序列化为 JSON 文本', () => {
  const createLine = src.split('\n').find((l) => l.includes('async createProject('));
  assert.ok(createLine, 'createProject 不存在');
  assert.match(createLine, /JSON\.stringify\(/, 'createProject 未对 jsonb 参数做 JSON.stringify');
});

test('更新 collab_projects.episodes（jsonb）同样必须序列化', () => {
  const updateLine = src.split('\n').find((l) => l.includes('async updateProject('));
  assert.ok(updateLine, 'updateProject 不存在');
  assert.match(updateLine, /JSON\.stringify\(/, 'updateProject 未对 jsonb 参数做 JSON.stringify');
});
