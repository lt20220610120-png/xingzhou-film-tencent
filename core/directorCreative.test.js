import test from 'node:test';
import assert from 'node:assert/strict';
import { getSceneVision, updateSceneVision, buildScenePromptRecords, creativePromptsForScene, directorPromptMode,buildCreativeSceneSubmission } from './directorCreative.js';
import {executeSkillWithAi} from './skillExecution.js';
import { appendDirectorEpisodePrompts, appendDirectorPromptHistory, collectDirectorPromptHistory, updateDirectorPromptEverywhere, deleteDirectorPromptsEverywhere } from './projectStore.js';

test('creative submission preserves the complete scene and shooting intent as separate inputs',()=>{
 const scene='7-1 大厅 日 内\n'+('左侧原文（1）（2）对白与动作。'.repeat(2800))+'\n末尾对白：Thank you, brother.';
 const vision='冷色侧逆光，先双人全景，再缓推到哥哥近景。';
 const input=buildCreativeSceneSubmission({sceneLabel:'7-1',sceneText:scene,vision,preamble:'风格：真人电影级；画幅：9:16'});
 assert.ok(input.includes(scene));assert.ok(input.includes(vision));assert.match(input,/拍什么/);assert.match(input,/怎么拍/);assert.match(input,/所选.*Skill/);
 assert.throws(()=>buildCreativeSceneSubmission({sceneLabel:'7-1',sceneText:'',vision}),/剧本/);
 assert.throws(()=>buildCreativeSceneSubmission({sceneLabel:'7-1',sceneText:scene,vision:' '}),/导演构想/);
});
test('creative scene, intent and selected full Skill reach the chosen model and remain with the saved output',async()=>{
 let captured;
 const input=buildCreativeSceneSubmission({sceneLabel:'7-1',sceneText:'7-1 大厅 日 内\n凯尔向哥哥道谢。\n最后动作：握手。',vision:'金色轮廓光，稳定双人镜头。',preamble:'本项目画幅：16:9'});
 const skill={id:'chosen',name:'导演完整规则',importMethod:'skill-folder',content:'SELECTED_SKILL_MAIN：按编号输出提示词。',files:[{path:'references/camera.md',content:'SELECTED_CAMERA_RULE：保持轴线。'}]};
 const response=await executeSkillWithAi({api:{aiChat:async args=>{captured=args;return '7-1-1\n固定全景，金色轮廓光，凯尔握住哥哥的手。';}},state:{skills:[skill],apiProfiles:[]},profile:{id:'selected-model',model:'mock-director'},skillId:skill.id,input});
 const messages=captured.messages.map(m=>m.content).join('\n');assert.match(messages,/最后动作：握手/);assert.match(messages,/金色轮廓光/);assert.match(messages,/SELECTED_SKILL_MAIN/);assert.match(messages,/SELECTED_CAMERA_RULE/);assert.equal(captured.profileId,'selected-model');
 const [record]=buildScenePromptRecords({sceneLabel:'7-1',parts:[{content:response.output}],generationMode:'creative',sourceText:input,skill:skill.name});assert.equal(record.sourceText,input);assert.match(record.content,/凯尔握住哥哥/);assert.equal(record.sceneLabel,'7-1');
});

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
