const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// 功能区由 sectionsForRole(project.myRole) 决定。
// 后端不返回 myRole 时会退化成只有『项目群』——这正是回归事故的表现。
test('制片人角色可见全部协作功能区', async () => {
  const store = await import('../core/collabStore.js');
  const sections = store.sectionsForRole('producer');
  for (const s of ['info', 'art', 'assets', 'storyboard', 'invite', 'stats', 'group']) {
    assert.ok(sections.includes(s), '缺少功能区 ' + s);
  }
  assert.ok(sections.length >= 7);
});

test('缺少 myRole 会退化为只有项目群（说明后端必须提供该字段）', async () => {
  const store = await import('../core/collabStore.js');
  assert.deepEqual(store.sectionsForRole(undefined), ['group']);
});

test('后端 project-get / project-list / project-create 都注入 myRole', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'cloud-backend', 'src', 'collab.cjs'), 'utf8');
  assert.match(src, /async function attachRole/);
  const getLine = src.split('\n').find((l) => l.includes("action === 'project-get'"));
  assert.match(getLine, /attachRole/);
  assert.match(src, /project-list[\s\S]{0,220}attachRole/);
  assert.match(src, /project-create[\s\S]{0,260}attachRole/);
});

test('创建项目时所有者写入成员表，避免群成员为 0', () => {
  const repo = fs.readFileSync(path.join(__dirname, '..', 'cloud-backend', 'src', 'postgres-repository.cjs'), 'utf8');
  assert.match(repo, /insert into collab_members[\s\S]{0,200}producer/);
});
