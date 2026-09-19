import test from 'node:test';
import assert from 'node:assert/strict';
import {uniqueAssetImages, ungeneratedAssets, reconcileAssetSelection} from './assetImages.js';

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
