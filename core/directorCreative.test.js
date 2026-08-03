import test from 'node:test';
import assert from 'node:assert/strict';
import { getSceneVision, updateSceneVision, buildScenePromptRecords } from './directorCreative.js';

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
