import test from 'node:test';import assert from 'node:assert/strict';
import {inferAssetPromptMode,readAssetPrompt,serializeAssetPrompt,CHARACTER_PROMPT_PREFIXES,characterAppearanceIssue} from './collabStore.js';
import {readComposedAssetPrompt,buildComposedImagePrompt,serializeComposedAssetPrompt,defaultComposedAssetPromptPrefix} from './artImageComposition.js';
const dog={category:'character',name:'【小黄-流浪狗】',description:'主体类型：生物；物种：犬。四足，黄褐色短毛，垂耳，黑鼻，尾巴向上弯曲。'};
test('dogs and dragons automatically use creature three views for every style and project composition',()=>{
 for(const asset of [dog,{...dog,name:'【三首龙-魔兽】',description:'非人巨型魔兽形态，三首并列，龙鳞与翼膜。'},{...dog,name:'【旺财】',description:'一条能说话的黑狗，四足犬类身体，不具有人形。'}]){
  assert.equal(inferAssetPromptMode(asset),'creature');assert.equal(characterAppearanceIssue(asset),'');
  for(const style of ['AI真人','3D动漫','2D动漫'])for(const layout of ['portrait-four','portrait-five']){
   const prompt=buildComposedImagePrompt(asset,null,style,layout);assert.match(prompt,/正面.*侧面.*背面/s);assert.match(prompt,/不要出现任何人物/);assert.match(prompt,/不要场景/);assert.doesNotMatch(prompt,/4格|脸颈面板|真人写实人像|同一人物|画风：AI真人/);
  }
 }
});
test('human dog owner, humanoid animal and prop statues retain their own modes',()=>{
 assert.equal(inferAssetPromptMode({...dog,name:'【狗蛋-便服】',description:'人类男性，方脸，短发，蓝衬衫，脚边站着一条狗。'}),'single');
 assert.equal(inferAssetPromptMode({...dog,name:'【犬族侍卫】',description:'主体类型：人形。人形四肢、直立，犬耳，穿黑色铠甲。'}),'single');
 assert.equal(inferAssetPromptMode({...dog,category:'prop',name:'【狗雕像】'}),'prop');
 assert.equal(inferAssetPromptMode({...dog,name:'【狗头军师】',description:'人类中年男子，长脸、留须。'}),'single');
});
test('legacy automatic human envelopes migrate for animals but custom free composition survives',()=>{
 const old={...dog,description:serializeComposedAssetPrompt({mode:'single',composition:'project',prefix:CHARACTER_PROMPT_PREFIXES['AI真人'],content:dog.description})};
 const settings=readComposedAssetPrompt(old,'AI真人','portrait-five');assert.equal(settings.mode,'creature');assert.match(settings.prefix,/三视图/);assert.equal(settings.content,dog.description);
 const ref={...dog,id:'ref',images:[{url:'https://test/dog.png'}]};
 assert.doesNotMatch(buildComposedImagePrompt(old,ref,'AI真人','portrait-five'),/保持同一人物|脸型五官发型身材|服装设定/);
 const custom={...dog,description:serializeAssetPrompt({mode:'free',prefix:'手工指定兽群远景',content:dog.description})};assert.equal(readAssetPrompt(custom).prefix,'手工指定兽群远景');
 const roundtrip={...dog,description:serializeComposedAssetPrompt({...settings,composition:'project'})};assert.equal(readComposedAssetPrompt(roundtrip,'AI真人').mode,'creature');
 for(const composition of ['project','portrait-five']){
  const five={...dog,description:serializeComposedAssetPrompt({mode:'single',composition,prefix:defaultComposedAssetPromptPrefix(dog,'AI真人','single','portrait-five'),content:dog.description})};
  assert.equal(readComposedAssetPrompt(five,'AI真人','portrait-five').mode,'creature');assert.doesNotMatch(buildComposedImagePrompt(five,null,'AI真人','portrait-five'),/同一人物|无头正面躯干/);
 }
 for(const layout of ['portrait-four','portrait-five']){
  const prefix=defaultComposedAssetPromptPrefix(dog,'AI真人','single',layout);
  const explicit={...dog,description:serializeComposedAssetPrompt({mode:'single',composition:'custom',prefix,content:dog.description})};
  assert.equal(readComposedAssetPrompt(explicit,'AI真人').mode,'single');assert.equal(readComposedAssetPrompt(explicit,'AI真人').prefix,prefix);
 }
});
