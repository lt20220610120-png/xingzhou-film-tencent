const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ui = () => fs.readFileSync(path.join(root, 'src/v06/DirectorWorkspace.jsx'), 'utf8');
const store = () => fs.readFileSync(path.join(root, 'core/projectStore.js'), 'utf8');
const css = () => fs.readFileSync(path.join(root, 'src/v100-compat.css'), 'utf8');

test('核心层提供风格与画幅常量及设置函数', () => {
  const src = store();
  assert.match(src, /PROJECT_STYLES\s*=\s*\['真人电影集',\s*'3DCG动漫',\s*'2D动漫'\]/);
  assert.match(src, /PROJECT_RATIOS\s*=\s*\['9:16',\s*'16:9'\]/);
  assert.match(src, /export const setDirectorProjectStyle/);
  assert.match(src, /export const setDirectorProjectRatio/);
  assert.match(src, /export const buildProjectPreamble/);
});

test('buildProjectPreamble 生成的前置声明包含风格与画幅', () => {
  const src = store();
  assert.match(src, /【项目设定 · 请先读取】/);
  assert.match(src, /本项目风格：/);
  assert.match(src, /本项目画幅：/);
});

test('导演台头部渲染项目设定功能区，创造/快速模式共用', () => {
  const src = ui();
  assert.match(src, /project-style-bar/);
  assert.match(src, /PROJECT_STYLES\.map/);
  assert.match(src, /PROJECT_RATIOS\.map/);
  // 功能区位于 header 之后、mode === 'creative' 分支之前（两模式共用）
  const barIdx = src.indexOf('project-style-bar');
  const creativeIdx = src.indexOf("mode === 'creative' && (");
  assert.ok(barIdx > 0 && creativeIdx > barIdx, '项目设定功能区必须在模式分支之前渲染');
});

test('三种运行路径都会先注入项目风格与画幅再执行 Skill', () => {
  const src = ui();
  // runSkill / runCreativeScene / runQuickScene 都调用 buildProjectPreamble
  const matches = src.match(/buildProjectPreamble\(project\)/g) || [];
  assert.ok(matches.length >= 3, `应有至少3处调用 buildProjectPreamble，实际 ${matches.length}`);
  // preamble 拼在输入文本之前
  assert.match(src, /preamble \? `\$\{preamble\}\\n\\n\$\{inputText\}` : inputText/);
  assert.match(src, /\$\{preamble \? `\$\{preamble\}\\n\\n` : ''\}【剧本场景/);
});

test('项目设定功能区拥有配套样式', () => {
  const styles = css();
  assert.match(styles, /\.project-style-bar\{/);
  assert.match(styles, /\.style-chip\{/);
  assert.match(styles, /\.style-chip\.active\{/);
});
