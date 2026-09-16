import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArtAnalysis,buildAssetRows,normalizeArtAssets,buildImagePrompt} from './collabStore.js';

const baseline={id:'base',name:'【林夏-基准造型】',category:'character',first_episode:1,episodes:[1],images:[{id:'face',url:'https://example.test/base.png'}],description:'身份与依据：青年女性；脸型骨相与五官：鹅蛋脸；发型发色：黑发；身形与肤质：修长；服装与鞋履：白色棉衬衣、蓝色长裤、黑色皮鞋。'};
const raw='身份与依据：青年女性。脸型骨相与五官：鹅蛋脸。鼻唇与耳部：直鼻薄唇。身形与肤质：修长。服装与鞋履：红色礼服与银色鞋履。妆造与固定配饰：红唇、珍珠耳钉。';

test('v228 V5 wardrobe and makeup field grammar survives identity removal into actual image prompt',()=>{
  const variant={id:'gown',name:'【林夏-礼服】',category:'character',first_episode:2,episodes:[2],description:raw};
  const normalized=normalizeArtAssets([baseline,variant])[1];
  assert.ok(normalized.generationDescription);
  assert.match(normalized.generationDescription,/红色礼服与银色鞋履/);
  assert.match(normalized.generationDescription,/红唇、珍珠耳钉/);
  assert.doesNotMatch(normalized.generationDescription,/鹅蛋脸|直鼻薄唇|身份与依据|身形与肤质/);
  const prompt=buildImagePrompt(normalized,baseline,'AI真人');
  assert.match(prompt,/红色礼服与银色鞋履/);
  assert.match(prompt,/红唇、珍珠耳钉/);
  assert.doesNotMatch(prompt,/鹅蛋脸|直鼻薄唇/);
  assert.equal(variant.description,raw);
  const rows=buildAssetRows(parseArtAnalysis(`### 第1集\n人物：\n- ${baseline.name}（实际出镜，首次）${baseline.description}\n场景：\n- 无（本集未出现）\n道具：\n- 无（本集未出现）\n### 第2集\n人物：\n- ${variant.name}（实际出镜，首次，换装）${raw}\n场景：\n- 无（本集未出现）\n道具：\n- 无（本集未出现）`));
  assert.match(rows[1].description,/红色礼服与银色鞋履/);
  assert.match(rows[1].description,/红唇、珍珠耳钉/);
  assert.doesNotMatch(rows[1].description,/鹅蛋脸|直鼻薄唇/);
});

test('v228 V5 NA garment fields do not become differences or retain repeated facial identity',()=>{
  const description='脸型骨相与五官：鹅蛋脸；鼻唇与耳部：直鼻薄唇；服装与鞋履：N/A；【内层】：不适用；【中层】：无；【外层】：红色丝绒披肩；妆造与固定配饰：不适用；状态差异：无。';
  const variant={id:'shawl',name:'【林夏-披肩】',category:'character',first_episode:2,episodes:[2],description};
  const normalized=normalizeArtAssets([baseline,variant])[1];
  assert.match(normalized.generationDescription,/红色丝绒披肩/);
  assert.doesNotMatch(normalized.generationDescription,/N\/A|不适用|【中层】：无|状态差异：无|鹅蛋脸|直鼻薄唇/);
});

test('v228 all NA difference fields keep an empty projection rather than resurrecting the face',()=>{
  const variant={id:'na',name:'【林夏-无差异】',category:'character',first_episode:2,episodes:[2],description:'脸型骨相与五官：鹅蛋脸；鼻唇与耳部：直鼻薄唇；服装与鞋履：N/A；妆造与固定配饰：不适用。'};
  const normalized=normalizeArtAssets([baseline,variant])[1];
  assert.equal(normalized.generationDescription,'');
  assert.doesNotMatch(buildImagePrompt(normalized,baseline,'AI真人'),/鹅蛋脸|直鼻薄唇|N\/A|不适用/);
});

test('v228 semicolon continuations inside V5 wardrobe and makeup fields stay in the delta prompt',()=>{
  const description='脸型骨相与五官：鹅蛋脸。服装与鞋履：红色丝绒礼服；内搭米白色衬裙；足穿银色细跟鞋。妆造与固定配饰：红唇；双耳各一枚珍珠耳钉。';
  const variant={id:'gown-long',name:'【林夏-晚宴礼服】',category:'character',first_episode:2,episodes:[2],description};
  const normalized=normalizeArtAssets([baseline,variant])[1];
  const prompt=buildImagePrompt(normalized,baseline);
  assert.match(prompt,/红色丝绒礼服/);
  assert.match(prompt,/内搭米白色衬裙/);
  assert.match(prompt,/足穿银色细跟鞋/);
  assert.match(prompt,/双耳各一枚珍珠耳钉/);
  assert.doesNotMatch(prompt,/鹅蛋脸/);
});
