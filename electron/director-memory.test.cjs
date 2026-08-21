const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('导演工作台记住上次打开的项目与面板，切走再回来不退回主页面', () => {
  const src = read('src/v06/DirectorWorkspace.jsx');
  assert.match(src, /localStorage\.getItem\('xz-director-last-project'\)/);
  assert.match(src, /localStorage\.setItem\('xz-director-last-project'/);
  assert.match(src, /localStorage\.getItem\('xz-director-last-pane'\)/);
  assert.match(src, /localStorage\.setItem\('xz-director-last-pane'/);
});

test('记忆的项目已被删除时会清理，不会卡在空白页', () => {
  const src = read('src/v06/DirectorWorkspace.jsx');
  assert.match(src, /removeItem\('xz-director-last-project'\)/);
});

test('创造模式只依据导演构想生成提示词', () => {
  const src = read('src/v06/DirectorWorkspace.jsx');
  assert.match(src, /if \(!vision\.trim\(\)\) return;/);
  assert.doesNotMatch(src, /scene\?\.content\?\.trim\(\) \|\| !vision/);
});
