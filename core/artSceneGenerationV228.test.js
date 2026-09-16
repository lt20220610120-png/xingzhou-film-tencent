import test from 'node:test';
import assert from 'node:assert/strict';
import {buildImagePrompt,normalizeArtAssets,resolveAssetReference,serializeAssetPrompt} from './collabStore.js';

const baseline={id:'hospital-base',category:'scene',name:'【医院-日-内】',first_episode:1,episodes:[1],description:'布局：旧病房；时间光线：白日。',images:[{url:'https://example.test/hospital.png'}]};

for(const manual of [false,true]){
  for(const [label,content,expected] of [
    ['no-lighting','布局：床移到右侧；窗户：扩大成落地窗；地板：换成大理石。',/本次时间\/光线差异：保持参考图的时间与光线不变/],
    ['lighting-fields','布局：床移到右侧；时间差异：黄昏；光线：柔和暖光；色温：偏暖；地板：换成大理石。',/时间差异：黄昏；光线：柔和暖光；色温：偏暖/],
    ['sentence-fields','光线：柔和暖光。布局：床移到右侧。窗户：扩大成落地窗。地板：换成大理石。',/柔和暖光/],
  ])test(`v228 no-time scene generation uses only lighting (${label}, manual=${manual})`,()=>{
    const asset={id:'hospital-later',category:'scene',name:'【医院-内】',first_episode:2,episodes:[2],description:manual?serializeAssetPrompt({mode:'scene',prefix:'只要场景不要出现任何人物。',content}):content};
    const saved=structuredClone([baseline,asset]);
    const normalized=normalizeArtAssets([baseline,asset]);
    const current=normalized[1];
    const ref=resolveAssetReference(current,normalized);
    assert.equal(ref.id,baseline.id);
    for(const candidate of [asset,current]){
      const prompt=buildImagePrompt(candidate,ref,'AI真人');
      assert.match(prompt,/参考场景图片.*hospital-base/);
      assert.match(prompt,expected);
      assert.doesNotMatch(prompt,/床移到右侧|落地窗|大理石|旧病房/);
    }
    assert.equal(current.description,asset.description,'stored/manual description is not rewritten');
    if(manual)assert.equal(current.generationDescription,undefined,'customized storage contract stays unchanged');
    assert.deepEqual([baseline,asset],saved);
  });
}