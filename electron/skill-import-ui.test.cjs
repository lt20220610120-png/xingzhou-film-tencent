const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

test('主进程提供完整 Skill 目录与普通文档两个独立导入接口', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  assert.match(main, /ipcMain\.handle\('import-skill-directory'/);
  assert.match(main, /properties:\s*\['openDirectory'\]/);
  assert.match(main, /ipcMain\.handle\('import-skill-document'/);
  assert.match(main, /extensions:\s*\['txt','md','markdown','text'\]/);
});

test('preload 只暴露结构化 Skill 导入能力，不向渲染器暴露任意文件系统', () => {
  const preload = fs.readFileSync(path.join(__dirname, 'preload.cjs'), 'utf8');
  assert.match(preload, /importSkillDirectory:/);
  assert.match(preload, /importSkillDocument:/);
  assert.doesNotMatch(preload, /require\('fs'\)/);
});

test('Skill 库明确呈现三种创建方式', () => {
  const ui = fs.readFileSync(path.join(root, 'src/v06/GlobalTools.jsx'), 'utf8');
  assert.match(ui, /导入完整 Skill/);
  assert.match(ui, /导入文档/);
  assert.match(ui, /手动编写/);
});
