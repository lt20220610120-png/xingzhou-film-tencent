const test=require('node:test');
const assert=require('node:assert/strict');
const {parsePublicationOutput,validatePublicationAssets}=require('../src/analysis-publication.cjs');

test('renderer and publication agree on brief historical phone descriptions',async()=>{
 const {parseArtAnalysis,buildAssetRows}=await import('../../core/collabStore.js');
 const output='### 第20集\n人物：\n- 【苏橙橙手机】（首次）黑色直板智能手机，用于拼单外卖界面。配饰随身物属性，非人物资产。\n场景：\n- 无\n道具：\n- 无';
 const items=buildAssetRows(parseArtAnalysis(output));
 assert.equal(items.length,1);
 assert.equal(items[0].category,'prop');
 const parsed=parsePublicationOutput(output,20);
 const checked=validatePublicationAssets(items,parsed,20);
 assert.equal(checked.length,1);
 assert.equal(checked[0].category,'prop');
});
