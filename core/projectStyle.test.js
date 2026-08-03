import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, importDirectorProject,
  setDirectorProjectStyle, setDirectorProjectRatio, buildProjectPreamble,
  PROJECT_STYLES, PROJECT_RATIOS,
} from './projectStore.js';

const seed = () => {
  const s0 = createInitialState();
  const s1 = importDirectorProject(s0, null, 'upload', '(1)场景一内容');
  return { state: s1, project: s1.directorProjects[0] };
};

test('设置风格后项目携带 style 字段', () => {
  const { state, project } = seed();
  const next = setDirectorProjectStyle(state, project.id, '2D动漫');
  assert.equal(next.directorProjects[0].style, '2D动漫');
});

test('设置画幅后项目携带 aspectRatio 字段', () => {
  const { state, project } = seed();
  const next = setDirectorProjectRatio(state, project.id, '9:16');
  assert.equal(next.directorProjects[0].aspectRatio, '9:16');
});

test('风格与画幅可同时设置且互不覆盖', () => {
  const { state, project } = seed();
  let next = setDirectorProjectStyle(state, project.id, '真人电影集');
  next = setDirectorProjectRatio(next, project.id, '16:9');
  assert.equal(next.directorProjects[0].style, '真人电影集');
  assert.equal(next.directorProjects[0].aspectRatio, '16:9');
});

test('buildProjectPreamble 输出以项目设定开头，风格画幅齐全', () => {
  const preamble = buildProjectPreamble({ style: '3DCG动漫', aspectRatio: '9:16' });
  assert.ok(preamble.startsWith('【项目设定 · 请先读取】'));
  assert.match(preamble, /本项目风格：3DCG动漫/);
  assert.match(preamble, /本项目画幅：9:16/);
  assert.match(preamble, /严格符合上述风格与画幅/);
});

test('未设置风格画幅时 preamble 为空，不污染 Skill 输入', () => {
  assert.equal(buildProjectPreamble({}), '');
  assert.equal(buildProjectPreamble(null), '');
});

test('只设置其中一项时 preamble 仅包含该项', () => {
  const onlyStyle = buildProjectPreamble({ style: '2D动漫' });
  assert.match(onlyStyle, /本项目风格：2D动漫/);
  assert.doesNotMatch(onlyStyle, /本项目画幅/);
  const onlyRatio = buildProjectPreamble({ aspectRatio: '16:9' });
  assert.match(onlyRatio, /本项目画幅：16:9/);
  assert.doesNotMatch(onlyRatio, /本项目风格/);
});

test('风格与画幅选项符合产品定义', () => {
  assert.deepEqual(PROJECT_STYLES, ['真人电影集', '3DCG动漫', '2D动漫']);
  assert.deepEqual(PROJECT_RATIOS, ['9:16', '16:9']);
});
