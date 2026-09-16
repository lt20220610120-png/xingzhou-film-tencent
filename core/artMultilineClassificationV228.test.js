import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArtAnalysis,buildAssetRows,normalizeArtAssets} from './collabStore.js';

const wrap=body=>`### 第20集\n人物：\n${body}\n场景：\n- 无（本集未出现）\n道具：\n- 无（本集未出现）`;

const nonVisualCases=[
  ['电话音','仅声音出场，无实体形象。外观：矩形；界面：蓝色；'],
  ['系统VO','仅声音出场，未实际出镜，无实体形象。脸型：圆脸；发型：黑发；服装：制服。'],
  ['系统VO','仅声音出场，未实际出镜，无实体形象。外观：矩形；界面：蓝色；'],
  ['系统VO','未实际出镜。脸型：圆脸；发型：黑发；服装：制服。'],
  ['机器人音','仅声音出场，无实体形象。拟人角色，具有人形四肢；外观：银色；界面：蓝色。'],
];
for(const category of ['character','prop']){
  for(const [index,[name,description]] of nonVisualCases.entries())test(`v228 hard nonvisual evidence wins before ${category} classification (${index})`,()=>{
    const body=`- 【${name}】（首次）${description}`;
    const output=category==='character'?wrap(body):`### 第20集\n人物：\n- 无（本集未出现）\n场景：\n- 无（本集未出现）\n道具：\n${body}`;
    const parsed=parseArtAnalysis(output);
    assert.equal(parsed.episodes[0][category][0]?.generatable,false,'audio must remain non-generatable, not migrate to a visual prop');
    assert.deepEqual(buildAssetRows(parsed),[]);
    const raw={id:`sound-${index}`,category,name:`【${name}】`,description};
    const saved=structuredClone(raw);
    assert.deepEqual(normalizeArtAssets([raw]),[]);
    assert.deepEqual(buildAssetRows({episodes:[{episode:20,[category]:[raw]}]}),[]);
    assert.deepEqual(raw,saved,'read-only normalization does not delete stored data');
  });
  test(`v228 nonvisual metadata is not lost before ${category} classification`,()=>{
    const body='- 【电话音】（仅声音出场，无实体形象，首次）外观：矩形；界面：蓝色。';
    const output=category==='character'?wrap(body):`### 第20集\n人物：\n- 无（本集未出现）\n场景：\n- 无（本集未出现）\n道具：\n${body}`;
    assert.deepEqual(buildAssetRows(parseArtAnalysis(output)),[]);
  });
}

test('v228 late physical evidence restores the complete anthropomorphic character',()=>{
  const output=wrap('- 【系统-中控机器人】（首次）\n出场类型：实体出镜的拟人角色，具有人形四肢。\n外观：银蓝色金属外壳；显示屏头部。');
  const parsed=parseArtAnalysis(output);
  assert.notEqual(parsed.episodes[0].character[0].generatable,false);
  const rows=buildAssetRows(parsed);
  assert.deepEqual(rows.map(row=>[row.category,row.name]),[['character','【系统-中控机器人】']]);
  assert.deepEqual(normalizeArtAssets(rows).map(row=>row.name),rows.map(row=>row.name));
});

test('v228 late sound-only evidence overrides invented human fields in parser and persisted view',()=>{
  const output=wrap('- 【系统女声】（首次）脸型：圆脸；发型：黑色短发；服装：蓝色制服。\n出场类型：仅声音、无实体、未见出镜。');
  const parsed=parseArtAnalysis(output);
  assert.equal(parsed.episodes[0].character[0].generatable,false);
  assert.deepEqual(buildAssetRows(parsed),[]);
  const raw=parsed.episodes[0].character[0];
  assert.deepEqual(normalizeArtAssets([{...raw,id:'sound',generatable:undefined}]),[]);
});

test('v228 physical evidence on a later line corrects an object-like first line',()=>{
  const output=wrap('- 【手机-精灵】（首次）外观：银色屏幕；材质：金属机身。\n出场类型：实体出镜的拟人角色，具有人形四肢。');
  assert.deepEqual(buildAssetRows(parseArtAnalysis(output)).map(row=>[row.category,row.name]),[['character','【手机-精灵】']]);
});

test('v228 one invented clothing field cannot turn a visible phone into a human',()=>{
  const output=wrap('- 【韩川手机】（首次）服装：西装；外观：高大；屏幕：亮起。');
  const rows=buildAssetRows(parseArtAnalysis(output));
  assert.deepEqual(rows.map(row=>[row.category,row.name]),[['prop','【韩川手机】']]);
  assert.deepEqual(normalizeArtAssets([{id:'phone',category:'character',name:'【韩川手机】',description:'服装：西装；外观：高大；屏幕：亮起。'}]).map(row=>[row.category,row.name]),[['prop','【韩川手机】']]);
});

test('v228 generic actual-visible metadata does not override strong phone evidence',()=>{
  const output=wrap('- 【韩川手机】（实际出镜，首次）服装：西装；外观：高大；屏幕：亮起。');
  assert.deepEqual(buildAssetRows(parseArtAnalysis(output)).map(row=>[row.category,row.name]),[['prop','【韩川手机】']]);
});

test('v228 negated humanoid and wardrobe phrases do not revive a voice-only entry',()=>{
  const output=wrap('- 【系统VO】（首次）提示音。\n出场类型：仅声音，无实体，不具有人形，无需换装。');
  assert.deepEqual(buildAssetRows(parseArtAnalysis(output)),[]);
});

test('v228 real person with phone in the name retains character identity',()=>{
  const output=wrap('- 【手机先生】（首次）脸型：长脸；发型：黑发；服装：西装；屏幕：亮起。\n- 【韩川手机-精灵人形】（首次）出场类型：实体出镜的拟人角色，具有人形四肢；屏幕：亮起；外观：银色。');
  const rows=buildAssetRows(parseArtAnalysis(output));
  assert.deepEqual(rows.map(row=>[row.category,row.name]),[['character','【手机先生】'],['character','【韩川手机-精灵人形】']]);
  assert.deepEqual(normalizeArtAssets(rows).map(row=>[row.category,row.name]),rows.map(row=>[row.category,row.name]));
});

test('v228 two real legacy fields include clothing called 穿着 without weakening the single-field threshold',()=>{
  const output=wrap('- 【姜蓝-常服】（首次）脸型五官：面容清俊。\n穿着：深蓝色立领剑道服。');
  const rows=buildAssetRows(parseArtAnalysis(output));
  assert.deepEqual(rows.map(row=>[row.category,row.name]),[['character','【姜蓝-常服】']]);
  assert.match(rows[0].description,/面容清俊/);
  assert.match(rows[0].description,/深蓝色立领剑道服/);
});

test('v228 two applicable V5 garment and makeup fields count as structured human evidence',()=>{
  const output=wrap('- 【姜蓝-礼服】（首次）服装与鞋履：红色礼服与银色鞋履；妆造与固定配饰：红唇、耳钉。');
  assert.deepEqual(buildAssetRows(parseArtAnalysis(output)).map(row=>[row.category,row.name]),[['character','【姜蓝-礼服】']]);
});

test('v228 V5 NA wardrobe and makeup labels do not fabricate a human for a phone',()=>{
  const output=wrap('- 【韩川手机-面板】（首次）服装与鞋履：N/A；妆造与固定配饰：不适用；外观：矩形；屏幕：蓝色亮起。');
  assert.deepEqual(buildAssetRows(parseArtAnalysis(output)).map(row=>[row.category,row.name]),[['prop','【韩川手机-面板】']]);
});

test('v228 full-stop separated legacy human fields count once each, not as one swallowed value',()=>{
  const output=wrap('- 【姜蓝-常服】（首次）脸型五官：面容清俊。穿着：深蓝色立领剑道服。');
  assert.deepEqual(buildAssetRows(parseArtAnalysis(output)).map(row=>[row.category,row.name]),[['character','【姜蓝-常服】']]);
});
