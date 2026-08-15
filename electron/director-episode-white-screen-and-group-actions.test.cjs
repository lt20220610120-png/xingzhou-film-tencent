const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('导演分集编辑器导入 useEffect，打开第一集不会因未定义 Hook 白屏', () => {
  const source = read('src/v06/DirectorWorkspace.jsx');
  assert.match(source, /import React, \{[^}]*useEffect[^}]*\} from 'react'/);
  assert.match(source, /React\.useEffect\(\(\) => \{/);
  assert.match(source, /function EpisodeDirector[\s\S]*?\n\s*useEffect\(/);
});

test('导演分组操作区使用不重叠的网格布局并允许窄屏横向滚动', () => {
  const css = read('src/v100-compat.css');
  assert.match(css, /\.director-group-toolbar\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css, /\.group-actions\{[^}]*white-space:nowrap/);
  assert.match(css, /\.group-tabs\{[^}]*overflow-x:auto/);
});
