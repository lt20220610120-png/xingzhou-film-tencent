import test from 'node:test';
import assert from 'node:assert/strict';
import { getSceneVision, updateSceneVision, buildScenePromptRecords, creativePromptsForScene, directorPromptMode } from './directorCreative.js';
import { appendDirectorEpisodePrompts, appendDirectorPromptHistory, collectDirectorPromptHistory, updateDirectorPromptEverywhere, deleteDirectorPromptsEverywhere } from './projectStore.js';

test('导演构想按场景独立保存并可重新读取', () => {
  const episode = { sceneVisions: { '1-1': '旧构想' } };
  assert.equal(getSceneVision(episode, '1-1'), '旧构想');
  const updated = updateSceneVision(episode, '1-2', '光影：逆光\n运镜：缓慢推进');
  assert.equal(updated.sceneVisions['1-1'], '旧构想');
  assert.equal(updated.sceneVisions['1-2'], '光影：逆光\n运镜：缓慢推进');
});

test('提示词严格按集数-场景-场景内序号命名并接续已有编号', () => {
  const existing = [
    { label: '1-1-1', sceneLabel: '1-1' },
    { label: '1-2-1', sceneLabel: '1-2' },
  ];
  const firstScene = buildScenePromptRecords({ sceneLabel: '1-1', parts: [{ content: 'A' }, { content: 'B' }], existing, skill: '导演Skill', now: 100 });
  assert.deepEqual(firstScene.map(item => item.label), ['1-1-2', '1-1-3']);
  const secondEpisode = buildScenePromptRecords({ sceneLabel: '2-3', parts: [{ content: 'C' }], existing: [], skill: '导演Skill', now: 200 });
  assert.deepEqual(secondEpisode.map(item => item.label), ['2-3-1']);
});

test('生成记录保存剧本场景和导演构想组成的输入来源', () => {
  const [record] = buildScenePromptRecords({ sceneLabel: '2-3', parts: [{ content: '结果' }], existing: [], skill: '镜头Skill', sourceText: '剧本\n\n【导演构想】\n构想', now: 300 });
  assert.equal(record.sceneLabel, '2-3');
  assert.equal(record.skill, '镜头Skill');
  assert.match(record.sourceText, /导演构想/);
});

test('创造模式只展示当前场景的创造结果，兼容旧版输入来源且保留未知来源记录', () => {
  const prompts = [
    { id: 'c', sceneLabel: '1-1', generationMode: 'creative', content: '新创造' },
    { id: 'q', sceneLabel: '1-1', generationMode: 'quick', sourceText: '【导演构想】\n用户在快速输入中写了同名标题', content: '快速' },
    { id: 'old-c', label: '1-1-2', sourceText: '项目画幅\n\n【导演构想】\n逆光近景', content: '旧创造' },
    { id: 'old-q', label: '1-1-3', sourceText: '1-1 日 内\n剧本内容', content: '【导演构想】\n模型输出的标题' },
    { id: 'unknown', label: '1-1-4', content: '未知来源旧记录' },
    { id: 'other-scene', sceneLabel: '1-2', generationMode: 'creative', content: '其他场景' },
    { id: 'other-episode', sceneLabel: '2-1', generationMode: 'creative', content: '其他集' },
  ];
  assert.deepEqual(creativePromptsForScene(prompts, '1-1').map((item) => item.id), ['c', 'old-c']);
  assert.equal(directorPromptMode(prompts[3]), 'quick');
  assert.equal(directorPromptMode(prompts[4]), 'unknown');
  assert.equal(collectDirectorPromptHistory({ episodes: [{ prompts }] }).length, prompts.length);
});

test('创造与快速生成的来源随历史保存和编辑保留，过滤展示不影响删除', () => {
  const creative = buildScenePromptRecords({ sceneLabel: '1-1', parts: [{ content: '创造结果' }], generationMode: 'creative' });
  const quick = buildScenePromptRecords({ sceneLabel: '1-1', parts: [{ content: '快速结果' }], generationMode: 'quick' });
  let state = { directorProjects: [{ id: 'p', episodes: [{ id: 'ep', prompts: [] }] }] };
  state = appendDirectorEpisodePrompts(state, 'p', 'ep', [...creative, ...quick]);
  state = appendDirectorPromptHistory(state, 'p', [...creative, ...quick]);
  state = updateDirectorPromptEverywhere(state, 'p', creative[0].id, { content: '修改后的创造结果' });
  const saved = JSON.parse(JSON.stringify(state.directorProjects[0]));
  assert.equal(saved.episodes[0].prompts[0].generationMode, 'creative');
  assert.equal(saved.episodes[0].prompts[1].generationMode, 'quick');
  assert.equal(creativePromptsForScene(collectDirectorPromptHistory(saved), '1-1')[0].content, '修改后的创造结果');
  state = deleteDirectorPromptsEverywhere(state, 'p', [creative[0].id]);
  assert.deepEqual(collectDirectorPromptHistory(state.directorProjects[0]).map((item) => item.generationMode), ['quick']);
});
