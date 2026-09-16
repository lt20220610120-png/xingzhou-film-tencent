import test from 'node:test';
import assert from 'node:assert/strict';
import {validateArtOutput,sourceSceneIdentities} from './artAnalysisRunner.js';
const wrap=entries=>`### 第20集\n人物：\n- 无（本集未出现）\n场景：\n${entries.map(name=>`- ${name}（首次，内外推断）空间：真实地点布局。`).join('\n')}\n道具：\n- 无（本集未出现）`;

for(const prior of ['existing','same-output'])test(`v228 missing time cannot recreate an established hospital (${prior})`,()=>{
  const baseline={category:'scene',name:'【医院-日-内】',description:'布局：医院基准空间。',first_episode:1};
  const entries=prior==='existing'?['【医院-内】']:['【医院-日-内】','【医院-内】'];
  const rows=validateArtOutput(wrap(entries),20,'20-1 医院 日 内',prior==='existing'?[baseline]:[]);
  assert.deepEqual(rows.map(row=>row.name),prior==='existing'?[]:['【医院-日-内】']);
  assert.match(rows.validationWarnings.join('\n'),/医院-内.*非光线/);
  const lighting=validateArtOutput(wrap(['【医院-内】']).replace('空间：真实地点布局。','光线：冷白光；色温：偏冷。'),20,'20-1 医院 日 内',[baseline]);
  assert.deepEqual(lighting.map(row=>row.name),['【医院-内】']);
  assert.equal(lighting.validationWarnings.length,0);
});

test('v228 narrative parentheses are not physical aliases in marked scene headers',()=>{
  const source='20-1 医院（回忆） 日 内\n人物在医院。';
  const rows=validateArtOutput(wrap(['【医院-日-内】','【回忆-日-内】']),20,source);
  assert.deepEqual(rows.map(row=>row.name),['【医院-日-内】']);
  assert.match(rows.validationWarnings.join('\n'),/回忆/);
  assert.equal(sourceSceneIdentities(source,20).some(item=>item.location==='回忆'),false);
});

test('v228 unmarked narrative scene stays one hospital rather than hospital interior plus memory exterior',()=>{
  const rows=validateArtOutput(wrap(['【医院-白日-内】','【回忆-白日-外】']),20,'20-1 医院（回忆）-白日\n人物交谈。');
  assert.deepEqual(rows.map(row=>row.name),['【医院-白日-内】']);
  assert.match(rows.validationWarnings.join('\n'),/回忆/);
});

test('v228 only explicit physical alias evidence can consume the same original unmarked scene',()=>{
  const source='20-1 景：医院（别名：仁心医院）-白日';
  const rows=validateArtOutput(wrap(['【医院-白日-内】','【仁心医院-白日-外】']),20,source);
  assert.deepEqual(rows.map(row=>row.name),['【医院-白日-内】']);
  assert.match(rows.validationWarnings.join('\n'),/内外/);
  const identities=sourceSceneIdentities(source,20);
  assert.ok(identities.some(item=>item.location==='仁心医院'),'explicit physical alias must not be erased');
  assert.equal(new Set(identities.map(item=>item.sourceSceneId)).size,1);
});

test('v228 unsupported parenthesized subplaces are not automatically aliases',()=>{
  const rows=validateArtOutput(wrap(['【医院东院-白日-内】','【东院-白日-外】']),20,'20-1 场景：医院（东院）-白日');
  assert.deepEqual(rows.map(row=>row.name),['【医院东院-白日-内】']);
  assert.match(rows.validationWarnings.join('\n'),/东院/);
});

test('v228 geographical full name and evidenced terminal name share one source identity',()=>{
  const rows=validateArtOutput(wrap(['【天竺国度月银沙漠-白日-外】','【月银沙漠-白日-内】']),20,'20-1天竺国度，月银沙漠-白日');
  assert.deepEqual(rows.map(row=>row.name),['【天竺国度月银沙漠-白日-外】']);
  assert.match(rows.validationWarnings.join('\n'),/内外/);
  const terminal=validateArtOutput(wrap(['【月银沙漠-白日-外】']),20,'20-1天竺国度，月银沙漠-白日');
  assert.deepEqual(terminal.map(row=>row.name),['【月银沙漠-白日-外】']);
  assert.equal(terminal.validationWarnings.length,0);
});

for(const tag of ['梦境','闪回','幻觉'])test(`v228 narrative tag ${tag} never becomes a place`,()=>{
  const rows=validateArtOutput(wrap(['【医院-日-内】',`【${tag}-日-内】`]),20,`20-1 医院（${tag}） 日 内`);
  assert.deepEqual(rows.map(row=>row.name),['【医院-日-内】']);
  assert.match(rows.validationWarnings.join('\n'),new RegExp(tag));
});

for(const tag of ['童年回忆','回忆中'])test(`v228 narrative tag ${tag} is not folded into the physical hospital name`,()=>{
  const source=`20-1 医院（${tag}） 日 内\n人物在医院。`;
  const identities=sourceSceneIdentities(source,20);
  assert.deepEqual([...new Set(identities.map(item=>item.physicalLocation))],['医院']);
  const rows=validateArtOutput(wrap(['【医院-日-内】',`【医院${tag}-日-外】`]),20,source);
  assert.deepEqual(rows.map(row=>row.name),['【医院-日-内】']);
});
