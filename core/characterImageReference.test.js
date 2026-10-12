import test from 'node:test';import assert from 'node:assert/strict';
import{normalizeArtAssets,isCharacterWardrobeVariant,resolveAssetReference,parseArtAnalysis,buildAssetRows,characterReferenceName}from './collabStore.js';
import{planArtImageBatch}from './artImageBatch.js';
const rows=()=>[
 {id:'shirt',category:'character',name:'【苏烨-素色长衫】',first_episode:1,sceneIds:['1-2'],description:'首次，换装；参考 【苏烨-囚服】。服装差异：灰色长衫。',images:[]},
 {id:'prison',category:'character',name:'【苏烨-囚服】',first_episode:1,sceneIds:['1-1'],description:'首次。脸型：长脸；五官：黑眼；服装：囚服。',images:[]}
];
test('explicit reference determines original identity even when a same-episode variant is returned first',()=>{
 const input=rows(),view=normalizeArtAssets(input),shirt=view.find(a=>a.id==='shirt'),base=view.find(a=>a.id==='prison');
 assert.equal(shirt.characterBaselineName,base.name);assert.equal(base.characterBaselineName,undefined);
 assert.equal(isCharacterWardrobeVariant(shirt,view),true);assert.equal(isCharacterWardrobeVariant(base,view),false);
 assert.deepEqual(input,rows());
 assert.equal(planArtImageBatch(view).find(j=>j.asset.id==='shirt').dependency,'prison');
});
test('missing baseline image never falls back to a later costume; ready baseline is actually referenced',()=>{
 const input=rows();input.push({...input[0],id:'formal',name:'【苏烨-礼服】',description:'参考【苏烨-素色长衫】；服装差异：礼服。',images:[{url:'later-costume'}]});
 const view=normalizeArtAssets(input),shirt=view[0];assert.equal(resolveAssetReference(shirt,view),null);
 view.find(a=>a.id==='prison').images=[{url:'first-face'}];assert.equal(resolveAssetReference(shirt,view).id,'prison');
 assert.equal(resolveAssetReference(view[2],view).id,'prison');
 assert.equal(resolveAssetReference(shirt,view,'formal').id,'formal');assert.equal(resolveAssetReference(shirt,view,''),null);
});
test('reference relationship survives an episode projection that does not contain the first card',()=>{
 const shirt=rows()[0];assert.equal(isCharacterWardrobeVariant(shirt,[shirt]),true);assert.equal(resolveAssetReference(shirt,[shirt]),null);
 const projected={...shirt,description:'手动修改的服装描述',characterBaselineName:'【苏烨-囚服】',images:[{url:'later-shirt'}]};
 const formal={...projected,id:'formal',name:'【苏烨-礼服】',images:[]};
 assert.equal(resolveAssetReference(formal,[projected,formal]),null);
});

test('first scene breaks same-episode ties without a reference tag and missing or circular tags stay guarded',()=>{
 const input=rows();input[0].description='服装：灰色长衫。';
 const view=normalizeArtAssets(input);assert.equal(view[0].characterBaselineName,'【苏烨-囚服】');
 assert.equal(isCharacterWardrobeVariant(view[1],view),false);
 const missing=rows().slice(0,1);assert.equal(isCharacterWardrobeVariant(missing[0],missing),true);assert.equal(resolveAssetReference(missing[0],missing),null);
 const cycle=rows();cycle[1].description='参考【苏烨-素色长衫】。服装差异：囚服。';
 for(const a of cycle){assert.equal(isCharacterWardrobeVariant(a,cycle),true);assert.equal(resolveAssetReference(a,cycle),null);}
});

test('reverse-order analysis preserves original face and fixes stale baseline metadata in the read-only view',()=>{
 const input=buildAssetRows(parseArtAnalysis('### 第1集\n人物：\n- 【苏烨-素色长衫】（首次，换装）参考 【苏烨-囚服】；服装差异：长衫。\n- 【苏烨-囚服】（首次）脸型：长脸；五官：黑眼；服装：囚服。'));
 assert.match(input.find(a=>a.name==='【苏烨-囚服】').description,/脸型：长脸/);
 assert.equal(input[0].characterBaselineName,'【苏烨-囚服】');assert.equal(input[1].characterBaselineName,undefined);
 const older=rows();older[1].characterBaselineName=older[0].name;
 const view=normalizeArtAssets(older);assert.equal(view[1].characterBaselineName,undefined);
 assert.equal(isCharacterWardrobeVariant(view[1],view),false);assert.equal(planArtImageBatch(view).find(j=>j.asset.id==='prison').dependency,null);
 assert.equal(older[1].characterBaselineName,older[0].name);
});

test('manual description changes invalidate previous reference projections',()=>{
 const asset={...rows()[0],generationDescriptionSource:rows()[0].description,generationDescription:'服装差异：长衫。',description:'参考【苏烨-礼服】；服装差异：白衫。'};
 assert.equal(characterReferenceName(asset),'【苏烨-礼服】');
});
