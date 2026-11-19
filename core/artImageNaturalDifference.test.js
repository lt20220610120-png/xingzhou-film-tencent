import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeArtAssets,buildImagePrompt,serializeAssetPrompt,buildAssetRows,parseArtAnalysis} from './collabStore.js';
import {buildComposedImagePrompt} from './artImageComposition.js';
import {requestAssetImage,clearAssetImageRecovery} from './assetImageRecovery.js';

const base={id:'base',category:'character',name:'【郑立成-日常西装】',description:'脸型：长脸；服装：藏青西装。',first_episode:1,episodes:[1],image_url:'https://example.test/reference-suit.png'};
const description='参考【郑立成-日常西装】；本次差异：服装改为日常居家服一套，日常居家服一套，上身浅灰色棉质圆领短袖T恤，外搭深藏青色薄棉长袖开衫家居服；下装深灰色棉质直筒家居长裤，松紧腰；足穿深灰色软底居家拖鞋。妆造：无底妆，眉毛自然未修但浓整有型，唇色自然偏淡；无配饰。';
const variant={id:'home',category:'character',name:'【郑立成-居家服】',first_episode:9,episodes:[9],description};
const expected=['服装改为日常居家服','浅灰色棉质圆领短袖T恤','深藏青色薄棉长袖开衫','深灰色棉质直筒家居长裤','深灰色软底居家拖鞋'];
function retainsChange(prompt){for(const text of expected)assert.ok(prompt.includes(text),`Missing ${text}`);assert.doesNotMatch(prompt,/唇色自然偏淡|无底妆|眉毛自然未修/);}

test('natural-language wardrobe changes survive normalization, composition and repeated normalization',()=>{
  let assets=normalizeArtAssets([base,variant]);
  for(let i=0;i<3;i++){
    assert.equal(assets[1].description,description);
    retainsChange(buildComposedImagePrompt(assets[1],assets[0],'AI真人','portrait-five'));
    assets=normalizeArtAssets(assets);
  }
});

test('natural changes before and after identity fields survive without repeating identity',()=>{
  const a={...variant,description:'换上红色外套；脸型：错误方脸；战斗后左臂有擦伤。服装：黑色长裤；足穿棕色靴子。发型发色：黑色短发；右手缠白色绷带。妆造：无。'};
  const prompt=buildImagePrompt(a,base);
  for(const text of ['红色外套','黑色长裤','棕色靴子','右手缠白色绷带'])assert.ok(prompt.includes(text));
  assert.doesNotMatch(prompt,/错误方脸|黑色短发|妆造：无|左臂有擦伤/);
});

test('saved and edited asset prompts keep natural wardrobe instructions',()=>{
  const saved={...variant,description:serializeAssetPrompt({mode:'single',prefix:'白底人物多视图。',content:description})};
  const normalized=normalizeArtAssets([base,saved]);
  retainsChange(buildComposedImagePrompt(normalized[1],base,'AI真人'));
  const edited={...normalized[1],description};
  retainsChange(buildImagePrompt(edited,base,'AI真人'));
});

test('analysis publication retains natural wardrobe differences',()=>{
  const rows=buildAssetRows(parseArtAnalysis(`### 第1集\n人物：\n- ${base.name}（实际出镜，首次）${base.description}\n场景：\n- 无\n道具：\n- 无\n### 第9集\n人物：\n- ${variant.name}（实际出镜，换装）${description}\n场景：\n- 无\n道具：\n- 无`));
  retainsChange(rows.find(row=>row.name===variant.name).description);
});

test('generation receives the changed clothing prompt and saves the distinct output rather than reference',async()=>{
  const [reference,asset]=normalizeArtAssets([base,variant]);
  let requests=0;
  const api={mediaGenerateImage:async payload=>{
    requests++;retainsChange(payload.prompt);
    assert.equal(payload.references[0].url,base.image_url);
    return {filePath:'C:/generated/home-clothes.png'};
  }};
  try{
    const result=await requestAssetImage(api,'natural-difference',asset.id,{prompt:buildComposedImagePrompt(asset,reference,'AI真人'),references:[{url:reference.image_url,kind:'image'}]});
    assert.equal(result.filePath,'C:/generated/home-clothes.png');
    assert.equal(requests,1);
  }finally{clearAssetImageRecovery('natural-difference',asset.id);}
});
