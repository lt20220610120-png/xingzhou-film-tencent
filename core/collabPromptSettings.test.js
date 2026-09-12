import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_PROMPT_PREFIXES, buildImagePrompt, inferAssetPromptMode, readAssetPrompt, serializeAssetPrompt, defaultAssetPromptPrefix } from './collabStore.js';

const crowd = { category: 'character', name: '【城中百姓】', description: '纯白背景。六个人，男女老幼群像；粗布衣物，面貌各异。' };

test('image prompts retain style and authored content without injecting the analysis genre', () => {
  for (const category of ['character', 'scene', 'prop']) {
    const asset = { category, name: '资产', description: '古代街市，保留这段手写描述。' };
    for (const reference of [null, { ...asset, description: '蓝色衣物。' }]) {
      const prompt = buildImagePrompt(asset, reference, '3D动漫', '现代都市，萌宝，豪门总裁');
      assert.match(prompt, /画风：3D动漫/);
      assert.match(prompt, /古代街市，保留这段手写描述/);
      assert.doesNotMatch(prompt, /题材设定|豪门总裁|现代都市/);
    }
  }
});

test('existing crowd assets use distinct people instead of hidden single-character panels for every style', () => {
  for (const style of Object.keys(CHARACTER_PROMPT_PREFIXES)) {
    const prompt = buildImagePrompt(crowd, null, style, '古代');
    assert.match(prompt, /六位不同人物/);
    assert.match(prompt, /同一张完整画面/);
    assert.doesNotMatch(prompt, /4格统一排版|所有画面中的主体完全一致/);
  }
});

test('legacy embedded single-person presets are stripped before inferring the crowd layout', () => {
  const legacy = { ...crowd, description: CHARACTER_PROMPT_PREFIXES['AI真人'] + '\n' + crowd.description };
  assert.equal(readAssetPrompt(legacy, '3D动漫').content, crowd.description);
  assert.doesNotMatch(buildImagePrompt(legacy, null, '3D动漫'), /4格统一排版|真人拍摄/);
});

test('ordinary occupations retain the single-character default; explicit counts select group mode', () => {
  assert.equal(inferAssetPromptMode({ category:'character', name:'工作人员', description:'三人称叙述，黑色制服。' }), 'single');
  assert.equal(inferAssetPromptMode({ category:'character', name:'值班人员', description:'8个人，身高不同。' }), 'group');
  assert.equal(inferAssetPromptMode({ category:'scene', name:'百姓街市', description:'人群聚集的地方。' }), 'scene');
});

test('custom prefixes, explicit single overrides, and intentionally empty prefixes round-trip through cloud descriptions', () => {
  for (const prefix of ['白底，8人同框，脸与衣服各不相同。', '']) {
    const settings = { mode:'group', prefix, content: crowd.description };
    const asset = { ...crowd, description:serializeAssetPrompt(settings) };
    assert.deepEqual(readAssetPrompt(asset), { ...settings, customized:true });
    const prompt = buildImagePrompt(asset, null, '2D动漫');
    assert.doesNotMatch(prompt, /4格统一排版|生图前置 ·|【资产描述】/);
    if (prefix) assert.ok(prompt.includes(prefix));
  }
  const explicitSingle = { ...crowd, description:serializeAssetPrompt({mode:'single',prefix:defaultAssetPromptPrefix(crowd,'AI真人','single'),content:crowd.description}) };
  assert.match(buildImagePrompt(explicitSingle, null, 'AI真人'), /4格统一排版/);
});

test('group references never reintroduce single-character identity or legacy panels', () => {
  const reference = { ...crowd, name:'城中百姓-节庆', description:CHARACTER_PROMPT_PREFIXES['AI真人'] + '\n红色衣物。' };
  const prompt = buildImagePrompt(crowd, reference, 'AI真人');
  assert.doesNotMatch(prompt, /同一人物，保持|4格统一排版/);
  assert.match(prompt, /六位不同人物/);
  assert.match(prompt, /红色衣物/);
});

test('scene and prop custom prefixes are editable and may be cleared without being silently reapplied', () => {
  for (const category of ['scene','prop']) {
    const asset = { category, name:'资产', description:serializeAssetPrompt({mode:category,prefix:'',content:'暗红背景的抽象设计'}) };
    assert.equal(buildImagePrompt(asset), '暗红背景的抽象设计');
  }
});
