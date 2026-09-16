const test=require('node:test');
const assert=require('node:assert/strict');
const {parsePublicationOutput,validatePublicationAssets}=require('../cloud-backend/src/analysis-publication.cjs');
const wrap=body=>`### 第20集\n人物：\n${body}\n场景：\n- 无（本集未出现）\n道具：\n- 无（本集未出现）`;
for(const fixture of [
  {name:'late physical robot',body:'- 【系统-中控机器人】（首次）\n出场类型：实体出镜的拟人角色，具有人形四肢。\n外观：银蓝色金属外壳；显示屏头部。',expected:[['character','【系统-中控机器人】']]},
  {name:'late sound-only human fields',body:'- 【系统女声】（首次）脸型：圆脸；发型：黑色短发；服装：蓝色制服。\n出场类型：仅声音、无实体、未见出镜。',expected:[]},
  {name:'generic visible phone metadata',body:'- 【韩川手机】（实际出镜，首次）服装：西装；外观：高大；屏幕：亮起。',expected:[['prop','【韩川手机】']]},
  {name:'negated humanoid voice',body:'- 【系统VO】（首次）提示音。\n出场类型：仅声音，无实体，不具有人形，无需换装。',expected:[]},
  {name:'real person with phone state',body:'- 【韩川-商务装（电梯内手机状态）】（实际出镜，首次）服装：西装；脸型：方脸；屏幕：手持手机亮起。',expected:[['character','【韩川-商务装（电梯内手机状态）】']]},
])test(`v228 renderer/publication multiline classification: ${fixture.name}`,async()=>{
  const {parseArtAnalysis,buildAssetRows}=await import('../core/collabStore.js');
  const output=wrap(fixture.body);
  const items=buildAssetRows(parseArtAnalysis(output));
  assert.deepEqual(items.map(row=>[row.category,row.name]),fixture.expected);
  const publication=parsePublicationOutput(output,20);
  assert.deepEqual(publication.filter(entry=>entry.generatable!==false).map(entry=>[entry.category,entry.name]),fixture.expected,'backend must classify complete multi-line entries before accepting publication');
  assert.deepEqual(validatePublicationAssets(items,publication,20).map(row=>[row.category,row.name]),fixture.expected);
});
