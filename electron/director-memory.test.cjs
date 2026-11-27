const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('导演工作台记住上次打开的项目与面板，切走再回来不退回主页面', () => {
  const src = read('src/v06/DirectorWorkspace.jsx');
  assert.match(src, /projectMemory=`xz-director-last-project:\$\{accountId\}`/);
  assert.match(src, /readRemembered\(projectMemory/);
  assert.match(src, /rememberPreference\(projectMemory/);
  assert.match(src, /paneMemory=`xz-director-last-pane:\$\{accountId\}`/);
  assert.match(src, /readRemembered\(paneMemory/);
  assert.match(src, /rememberPreference\(paneMemory/);
});

test('记忆的项目已被删除时会清理，不会卡在空白页', () => {
  const src = read('src/v06/DirectorWorkspace.jsx');
  assert.match(src, /removeItem\(projectMemory\)/);
});

test('创造模式结合整场剧本与导演构想生成提示词', () => {
  const src = read('src/v06/DirectorWorkspace.jsx');
  assert.match(src, /if \(!scene\?\.content\?\.trim\(\) \|\| !vision\.trim\(\)\) return;/);
  assert.match(src, /buildCreativeSceneSubmission\(\{sceneLabel,sceneText:scene.content,vision,preamble\}\)/);
});
