import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from './ipScenes.js';
import { buildCreatorText, archiveCreatorProject } from './creatorWorkspace.js';

const project = {
  id: 'ip-presentation', name: '展示稿', creator: { schemaVersion: 1, mode: 'ip' },
  episodes: [
    { id: 'settings', type: 'settings', title: '设定和小传', rawText: '# 小说原文\r\n原文保持。', scriptText: '## 人物小传\r\n女主：归还包。' },
    { id: 'one', type: 'episode', title: '第1集', rawText: '## 第一章\r\n原著 #话题。', scriptText: '## 第1集 归还\r\n\r\n### 场景1-1 外景 街道 日\r\n女主：保留 #话题 和 C#。' },
    { id: 'two', type: 'episode', title: '第2集', rawText: '第二章原文', scriptText: '### 场景2-1 内景 客厅 日\r\n△相识。' },
  ],
};

test('IP output removes heading prefixes and supplies only missing episode titles', () => {
  const before = structuredClone(project);
  assert.equal(buildCreatorText(project, 'fruit', 'output'), '【设定和小传】\n人物小传\r\n女主：归还包。\n\n第1集 归还\r\n\r\n场景1-1 外景 街道 日\r\n女主：保留 #话题 和 C#。\n\n【第2集】\n场景2-1 内景 客厅 日\r\n△相识。');
  assert.deepEqual(project, before);
});

test('IP original-side export and other creator modes retain their existing bytes and wrappers', () => {
  assert.equal(buildCreatorText(project, 'fruit', 'input'), '【设定和小传】\n# 小说原文\r\n原文保持。\n\n【第1集】\n## 第一章\r\n原著 #话题。\n\n【第2集】\n第二章原文');
  const fruit = { ...project, creator: { schemaVersion: 1, mode: 'fruit' } };
  assert.match(buildCreatorText(fruit, 'fruit', 'output'), /【第1集】\n## 第1集 归还/);
});

test('clean IP archive content is a snapshot independent of subsequent edits', () => {
  const state = { fruitProjects: [structuredClone(project)], scriptProjects: [], scriptLibrary: [] };
  const archived = archiveCreatorProject(state, project.id);
  const saved = archived.scriptLibrary[0].content;
  assert.doesNotMatch(saved, /^#{1,6}\s/m);
  assert.equal(archived.scriptLibrary[0].versions[0].episodes[1].scriptText, project.episodes[1].scriptText);
  archived.fruitProjects[0].episodes[1] = { ...archived.fruitProjects[0].episodes[1], scriptText: '后续编辑' };
  assert.equal(archived.scriptLibrary[0].content, saved);
  assert.equal(archived.scriptLibrary[0].versions[0].episodes[1].scriptText, project.episodes[1].scriptText);
});

test('IP display hides standard Markdown headings without changing literal hashes or line endings', () => {
  assert.equal(typeof scenes.formatIPScriptText, 'function');
  assert.equal(scenes.formatIPScriptText('## 第1集\r\n  ### 场景1-1 外景\r\n女主：#台词 C#。\r\n#话题\r\n####### 不属标题'), '第1集\r\n  场景1-1 外景\r\n女主：#台词 C#。\r\n#话题\r\n####### 不属标题');
});

test('no-op textarea edits retain the original heading markup and exact CRLF bytes', () => {
  assert.equal(typeof scenes.applyIPDisplayEdit, 'function');
  const source = '## 第1集\r\n### 场景1-1 外景 街道 日\r\n△原句。\r\n';
  assert.equal(scenes.applyIPDisplayEdit(source, '第1集\n场景1-1 外景 街道 日\n△原句。\n'), source);
});

test('a dialogue edit preserves existing hidden headings and untouched mixed line endings', () => {
  const source = '### 场景1-1 外景 街道 日\r\n女主：旧话。\n△原动作。\r\n';
  const edited = scenes.applyIPDisplayEdit(source, '场景1-1 外景 街道 日\n女主：新话。\n△原动作。\n');
  assert.equal(edited, '### 场景1-1 外景 街道 日\r\n女主：新话。\n△原动作。\r\n');
  assert.equal(scenes.replaceIPScene(source, scenes.splitIPScenes(source)[0].id, edited, { preserveLineEndings: true }), edited);
});

test('display edits at a hidden heading boundary can rename, remove or prepend a complete line', () => {
  const source = '### 场景1-1 外景\r\n△动作。';
  assert.equal(scenes.applyIPDisplayEdit(source, '新场景1-1 外景\n△动作。'), '### 新场景1-1 外景\r\n△动作。');
  assert.equal(scenes.applyIPDisplayEdit(source, '△动作。'), '△动作。');
  assert.equal(scenes.applyIPDisplayEdit(source, '集标题\n场景1-1 外景\n△动作。'), '集标题\r\n### 场景1-1 外景\r\n△动作。');
  assert.equal(scenes.applyIPDisplayEdit(source, '\n△动作。'), '\r\n△动作。');
  assert.equal(scenes.applyIPDisplayEdit(source, ''), '');
});

test('a no-op scene splice preserves mixed line endings as well as the unedited source', () => {
  const source = '第1集\r\n### 场景1-1 外景\r\n甲\n\r\n### 场景1-2 内景\n乙';
  const scene = scenes.splitIPScenes(source)[0];
  assert.equal(scenes.replaceIPScene(source, scene.id, scene.content), source);
});

test('editing a displayed scene retains CRLF, episode preface and the unedited scene byte-for-byte', () => {
  const source = '## 第1集 归还\r\n\r\n### 场景1-1 外景 街道 日\r\n△旧句。\r\n\r\n### 场景1-2 内景 客厅 日\r\n女主：#原样。\r\n';
  const first = scenes.splitIPScenes(source)[0];
  assert.equal(scenes.replaceIPScene(source, first.id, '场景1-1 外景 街道 日\n△新句。\n\n'), '## 第1集 归还\r\n\r\n场景1-1 外景 街道 日\r\n△新句。\r\n\r\n### 场景1-2 内景 客厅 日\r\n女主：#原样。\r\n');
});

test('a scene edit without a final newline retains the original boundary before the next scene', () => {
  const source = '第1集\r\n场景1-1 外景\r\n旧句\r\n\r\n场景1-2 内景\r\n后场原句';
  const first = scenes.splitIPScenes(source)[0];
  assert.equal(scenes.replaceIPScene(source, first.id, '场景1-1 外景\n新句'), '第1集\r\n场景1-1 外景\r\n新句\r\n\r\n场景1-2 内景\r\n后场原句');
});

test('joining headings, blanking a title or keeping leading spaces never exposes hidden markup',()=>{
 const cases=[['甲\r\n### 场景1-1 外景','甲场景1-1 外景'],['### 场景1-1 外景','\n景1-1 外景'],['### 场景1-1 外景',' 景1-1 外景'],['## 第一行\r\n### 第二行','第一行第二行'],['### 场景1-1\r\n甲\n乙','场景\n1-1\n甲\n乙']];
 for(const [source,next] of cases)assert.equal(scenes.formatIPScriptText(scenes.applyIPDisplayEdit(source,next)).replace(/\r\n|\r/g,'\n'),next);
});
