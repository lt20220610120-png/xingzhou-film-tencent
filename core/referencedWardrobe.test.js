import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssetRows, buildImagePrompt, parseArtAnalysis, serializeAssetPrompt, wardrobeDescription } from './collabStore.js';
import { buildComposedImagePrompt } from './artImageComposition.js';
import { buildEpisodeAnalysisMessages } from './collabArtSkill.js';
import { retainCostumeContinuity } from './characterWardrobePrompt.js';

const base = { id: 'base', category: 'character', name: '【秦南溪-肉摊围裙日常】', first_episode: 1,
  description: '脸型：鹅蛋脸；肤色：小麦色；妆容：自然淡妆；服装：围裙。', image_url: 'https://example.test/reference.png' };
const description = '参考 【秦南溪-肉摊围裙日常】；服装差异：内层米白色棉质圆领长袖家居上衣、宽松直身，下装浅灰色棉质直筒长裤，足饰米色软底居家拖鞋；无围裙。妆造差异：素颜、底妆极淡、保留小麦色肤质与面颊晒斑，裸色润唇；右手手背覆白色医用纱布与胶带固定，左腕细红绳保留。发型变化：改为低马尾。此造型用于8-1。';
const variant = { id: 'home', category: 'character', name: '【秦南溪-家居服】', first_episode: 8, description };

test('screenshot text keeps the clothes, hairstyle and accessories for default and local image references', () => {
  for (const ref of [base, { id: '__local__', name: 'portrait.png', category: 'reference', image_url: 'xzmedia://local/portrait.png', localReference: { kind: 'image', filePath: 'portrait.png' } }]) {
    const prompt = buildComposedImagePrompt(variant, ref, 'AI真人', 'portrait-five');
    assert.match(prompt, /无头正面躯干/);
    assert.match(prompt, /脸型、五官、肤色、肤质、原有皮肤特征和妆容/);
    for (const text of ['长袖家居上衣', '直筒长裤', '居家拖鞋', '无围裙', '医用纱布', '细红绳', '低马尾']) assert.ok(prompt.includes(text), text);
    assert.doesNotMatch(prompt, /妆造差异|素颜|底妆|晒斑|小麦色|润唇|皮肤通透|原生毛孔|鹅蛋脸/);
  }
  assert.equal(variant.description, description);
});

test('custom saved body and prefix cannot add complexion or makeup instructions under an active portrait reference', () => {
  const saved = { ...variant, description: serializeAssetPrompt({ mode: 'single', prefix: '浅灰背景。改成白皙皮肤，使用烟熏妆。仅展示半身。',
    content: '面部：圆脸。肤色：苍白；服装：裸色丝袜、红色礼服搭配红唇。妆造与固定配饰：眼线、珍珠耳钉，盘发。' }) };
  const prompt = buildImagePrompt(saved, base);
  assert.match(prompt, /浅灰背景.*仅展示半身/s);
  assert.match(prompt, /裸色丝袜.*红色礼服.*珍珠耳钉.*盘发/s);
  assert.doesNotMatch(prompt, /圆脸|白皙皮肤|烟熏妆|苍白|红唇|眼线/);
  assert.match(buildImagePrompt(saved, null), /烟熏妆.*苍白/s);
});

test('saved new costume and analysis agree with the reference rule while the first portrait stays complete', () => {
  const result = wardrobeDescription(base, description);
  assert.equal(result.match(/参考\s*【/g)?.length, 1);
  assert.match(result, /直筒长裤.*低马尾/s);
  assert.doesNotMatch(result, /素颜|底妆|晒斑|润唇|妆造差异/);
  const rows = buildAssetRows(parseArtAnalysis(`### 第1集\n人物：\n- ${base.name}（首次）${base.description}\n### 第8集\n人物：\n- ${variant.name}（首次，换装）${description}`));
  assert.match(rows[0].description, /自然淡妆/);
  assert.equal(rows[1].description, result);
  const system = buildEpisodeAnalysisMessages({ episodeNumber: 8 })[0].content;
  assert.match(system, /脸型、五官、肤色、肤质和妆容沿用参考/);
  assert.doesNotMatch(system, /淡化职业妆/);
});

test('flattened legacy identity and makeup fields keep adjacent clothing and accessories', () => {
  const text = '五官：杏眼，身穿蓝色长裙，左耳佩镶银耳钉；肤色：浅麦色，服饰为墨绿色风衣，右手戴银色戒指。妆造差异：杏色针织开衫，玫瑰豆沙哑光，低马尾，黑裙。瞳孔变为蓝色，嘴角上扬，眼睛更大，气色粉嫩。';
  const prompt = buildComposedImagePrompt({ ...variant, description: text }, base, 'AI真人', 'portrait-five');
  for (const value of ['蓝色长裙', '镶银耳钉', '墨绿色风衣', '银色戒指', '针织开衫', '低马尾', '黑裙']) assert.match(prompt, new RegExp(value));
  assert.doesNotMatch(prompt, /杏眼|浅麦色|豆沙哑光|瞳孔变为|嘴角上扬|眼睛更大|气色粉嫩|原生的珠光光泽|面部细碎绒毛/);
});

test('garment colors and hairstyles survive the removal of adjacent appearance notes', () => {
  const description = '服装差异：浅灰职业套装，肤色丝袜，肤色打底裤与棕色踝靴。妆造与固定配饰：低马尾（保留素颜与眼影），银手镯。';
  const prompt = buildImagePrompt({ ...variant, description }, base);
  for (const value of ['肤色丝袜', '肤色打底裤', '棕色踝靴', '低马尾', '银手镯']) assert.match(prompt, new RegExp(value));
  assert.doesNotMatch(prompt, /素颜|眼影/);
});

test('legacy dressing labels and stored continuity cannot reintroduce a face redesign', () => {
  const clothes = '服装差异：浅灰风衣。发型与发饰：长发，搭配绿色丝巾、珍珠耳钉。脸比参考图圆一些，改成单眼皮，头缩小两成，妆感更成熟。';
  const saved = retainCostumeContinuity(clothes, '服装差异：白色圆领裙。状态差异：前额擦伤，眼妆更淡。');
  assert.match(saved, /前额擦伤/);
  assert.doesNotMatch(saved, /白色圆领裙|眼妆更淡/);
  const prompt = buildImagePrompt({ ...variant, description: saved }, base);
  assert.match(prompt, /浅灰风衣.*绿色丝巾.*珍珠耳钉/s);
  assert.doesNotMatch(prompt, /长发|前额擦伤|脸比参考图|改成单眼皮|头缩小两成|妆感更成熟/);
});
