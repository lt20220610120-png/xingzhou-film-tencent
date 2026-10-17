import test from 'node:test';
import assert from 'node:assert/strict';
import {uniqueAssetImages, ungeneratedAssets, reconcileAssetSelection,visibleArtAssets} from './assetImages.js';

test('member join duplicates collapse by identity, not by filename', () => {
  const rows=[{id:'a',filename:'asset.png'},{id:'a',filename:'asset.png'},{id:'b',filename:'asset.png'}];
  assert.deepEqual(uniqueAssetImages(rows).map(i=>i.id),['a','b']);
});
test('default/select-all skip reused, legacy and fresh images', () => {
  assert.deepEqual(ungeneratedAssets([{id:'new'},{id:'old',image_url:'expired'},{id:'reuse',first_episode:1,episodes:[1,2],images:[{id:'m'}]}]).map(i=>i.id),['new']);
});
test('refresh unselects completed items and preserves user opt-outs and explicit regeneration', () => {
  const previous=[{id:'a'},{id:'b'},{id:'c',images:[{id:'m'}]}];
  assert.deepEqual(reconcileAssetSelection(['a','c'],previous,[{id:'a',images:[{id:'new'}]},{id:'b'},{id:'c',images:[{id:'m'}]},{id:'d'}]),['c','d']);
});
test('missing-image view filters individual outfits and accepts legacy URLs or current image records',()=>{
 const assets=[{id:'outfit-done',name:'【杰伊-常服】',images:[{id:'saved'}]},{id:'outfit-missing',name:'【杰伊-维修服】',images:[]},{id:'legacy-done',image_url:'https://example.test/old.png'},{id:'no-image'}];
 assert.deepEqual(visibleArtAssets(assets,true).map(a=>a.id),['outfit-missing','no-image']);
 assert.equal(visibleArtAssets(assets,false).length,4);
 assets[1].images=[{id:'new'}];assert.deepEqual(visibleArtAssets(assets,true).map(a=>a.id),['no-image']);
 assert.equal(assets.length,4,'filtering never removes stored assets');
});
