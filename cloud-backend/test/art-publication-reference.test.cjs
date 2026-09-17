const test=require('node:test');
const assert=require('node:assert/strict');
const {parsePublicationOutput,validatePublicationAssets}=require('../src/analysis-publication.cjs');
const wrap=body=>`### 第58集\n人物：\n${body}\n场景：\n- 无\n道具：\n- 无`;
test('same-character referenced state-only look is a publishable character without repeated face fields',()=>{
 const output=wrap('- 【甲-外套受伤】（首次，重要状态；参考【甲-外套】）状态差异：深色外套沾有血污，额前有擦伤。');
 const parsed=parsePublicationOutput(output,58);
 assert.equal(parsed[0].generatable,true);
 assert.equal(validatePublicationAssets([{name:'【甲-外套受伤】',category:'character',episodes:[58]}],parsed,58).length,1);
});
test('reference to a different character or explicit no-body evidence is not a valid character baseline',()=>{
 for(const body of ['- 【甲-受伤】（参考【乙-外套】）状态差异：衣服沾血。','- 【系统声音】（参考【系统声音-常态】）仅声音，无实体。']){
  assert.equal(parsePublicationOutput(wrap(body),58)[0].generatable,false);
 }
});
