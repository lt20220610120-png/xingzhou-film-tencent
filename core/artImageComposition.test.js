import test from 'node:test';import assert from 'node:assert/strict';
import{CHARACTER_PROMPT_PREFIXES,serializeAssetPrompt,normalizeArtAssets}from'./collabStore.js';
import{CHARACTER_COMPOSITIONS,readComposedAssetPrompt,serializeComposedAssetPrompt,defaultComposedAssetPromptPrefix,buildComposedImagePrompt}from'./artImageComposition.js';
const person={id:'p',category:'character',name:'【林舟-日常服】',description:'方脸，黑色短发，蓝衬衫。'};
test('saving an automatic composition and reloading preserves wardrobe identity filtering',()=>{
 const baseline={...person,first_episode:1,images:[{url:'https://example.invalid/ref.png'}]};
 const variant={...person,id:'v',name:'【林舟-礼服】',first_episode:2,description:'脸型：圆脸；五官：圆眼；服装：黑礼服。'};
 for(const composition of ['project','portrait-four','portrait-five']){
  const saved={...variant,description:serializeComposedAssetPrompt({...readComposedAssetPrompt(variant,'3D动漫'),composition})};
  const refreshed=normalizeArtAssets([baseline,saved])[1];
  const prompt=buildComposedImagePrompt(refreshed,baseline,'3D动漫','portrait-five');
  assert.match(prompt,/黑礼服/);assert.doesNotMatch(prompt,/圆脸|圆眼|构图绑定/);
 }
});
test('all three styles compose with either layout, preserving exact four-grid default and five-grid geometry',()=>{
 for(const style of Object.keys(CHARACTER_PROMPT_PREFIXES)){
  assert.equal(defaultComposedAssetPromptPrefix(person,style,'single','portrait-four'),CHARACTER_PROMPT_PREFIXES[style]);
  const text=defaultComposedAssetPromptPrefix(person,style,'single','portrait-five');assert.ok(text.endsWith(CHARACTER_COMPOSITIONS['portrait-five'].prefix));assert.ok(!text.includes('4格统一排版'));
  assert.ok(text.startsWith(CHARACTER_PROMPT_PREFIXES[style].split('白色背景，4格统一排版')[0]));
 }
 const five=CHARACTER_COMPOSITIONS['portrait-five'].prefix;for(const phrase of ['横向 16:9','2/3','1/3','细冷灰分隔线','头部、下巴和脖子不得出现','完整头部、头发至鞋底','45 度左侧脸与脖子'])assert.ok(five.includes(phrase));
});
test('old plain and factory-envelope cards follow project defaults; custom and empty prefixes never change',()=>{
 const old={...person,description:serializeAssetPrompt({mode:'single',prefix:CHARACTER_PROMPT_PREFIXES['AI真人'],content:person.description})};
 for(const asset of [person,old]){const s=readComposedAssetPrompt(asset,'3D动漫','portrait-five');assert.equal(s.composition,'project');assert.match(s.prefix,/3D CG/);assert.ok(s.prefix.includes('无头正面躯干'));assert.equal(s.content,person.description);}
 for(const prefix of ['',CHARACTER_PROMPT_PREFIXES['AI真人']+'\n自定义：仅半身。','手写特殊构图']){const custom={...person,description:serializeAssetPrompt({mode:'single',prefix,content:person.description})};const s=readComposedAssetPrompt(custom,'3D动漫','portrait-five');assert.equal(s.prefix,prefix);assert.equal(s.composition,'custom');}
});
test('explicit card choice persists across defaults, and following project stays dynamic after round trip',()=>{
 for(const composition of ['portrait-four','portrait-five','project','custom']){
  const encoded=serializeComposedAssetPrompt({mode:'single',composition,prefix:composition==='custom'?'特殊前置':'保存时旧前置',content:person.description});
  const s=readComposedAssetPrompt({...person,description:encoded},'2D动漫','portrait-five');assert.equal(s.composition,composition);
  if(composition==='portrait-four')assert.match(s.prefix,/4格统一排版/);else if(composition==='custom')assert.equal(s.prefix,'特殊前置');else assert.match(s.prefix,/无头正面躯干/);
  assert.equal(s.content,person.description);assert.ok(!s.prefix.includes('构图绑定'));
 }
});
test('group, scene, prop and free compositions never receive single-person five-grid',()=>{
 for(const asset of [{...person,name:'【群演】',description:'6位不同人物'}, {...person,category:'scene'}, {...person,category:'prop'}, {...person,description:serializeAssetPrompt({mode:'free',prefix:'自由全景',content:person.description})}])assert.doesNotMatch(buildComposedImagePrompt(asset,null,'3D动漫','portrait-five'),/无头正面躯干|4格统一排版/);
});
test('preview/generation use selected layout once and preserve current wardrobe-difference projection and references',()=>{
 const description=serializeComposedAssetPrompt({mode:'single',composition:'project',prefix:CHARACTER_PROMPT_PREFIXES['AI真人'],content:'原始人物基准和服装'});
 const asset={...person,description,generationDescription:'穿着差异：红色外套。',generationDescriptionSource:description};const ref={...person,id:'ref',images:[{url:'https://example.invalid/ref.png'}]};
 const prompt=buildComposedImagePrompt(asset,ref,'3D动漫','portrait-five');assert.equal(prompt.split('无头正面躯干').length-1,1);assert.match(prompt,/红色外套/);assert.match(prompt,/参考角色图片/);assert.ok(!prompt.includes('原始人物基准和服装'));assert.ok(!prompt.includes('构图绑定'));
});
