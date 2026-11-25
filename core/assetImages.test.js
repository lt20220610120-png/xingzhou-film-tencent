import test from 'node:test';
import assert from 'node:assert/strict';
import {uniqueAssetImages, ungeneratedAssets, reconcileAssetSelection,visibleArtAssets,removeAssetImages} from './assetImages.js';

test('member join duplicates collapse by identity, not by filename', () => {
  const rows=[{id:'a',filename:'asset.png'},{id:'a',filename:'asset.png'},{id:'b',filename:'asset.png'}];
  assert.deepEqual(uniqueAssetImages(rows).map(i=>i.id),['a','b']);
});
test('confirmed asset image deletion updates only the affected card and follows its latest remaining image',()=>{
 const art={id:'art',name:'衣服',images:[{id:'old',url:'old.png'},{id:'newer',url:'newer.png'},{id:'last',url:'last.png'}],adoptedImageId:'old',image_url:'old.png'};
 const other={...art,id:'other'};
 const initial=[art,other];
 const ignored=removeAssetImages(initial,{assetId:art.id,imageId:'absent'});
 assert.equal(ignored[0],art);
 const nonAdopted=removeAssetImages(initial,{assetId:art.id,imageId:'newer'});
 assert.equal(nonAdopted[0].adoptedImageId,'old');
 assert.deepEqual(nonAdopted[0].images.map(image=>image.id),['old','last']);
 assert.equal(nonAdopted[1],other);
 const adoptLatest=removeAssetImages(initial,{assetId:art.id,imageId:'old'});
 assert.equal(adoptLatest[0].adoptedImageId,'last');
 assert.equal(adoptLatest[0].image_url,'last.png');
 const single=[{...art,images:[art.images[0]]},other];
 assert.deepEqual(removeAssetImages(single,{assetId:art.id,imageId:'old'})[0],{...art,images:[],adoptedImageId:null,image_url:''});
 const legacy={...single[0],adoptedImageId:null,image_url:'legacy.png'};
 assert.deepEqual(removeAssetImages([legacy],{assetId:art.id,imageId:'old'})[0],{...legacy,images:[]});
 assert.deepEqual(removeAssetImages(initial,{clear:true}).map(asset=>[asset.images,asset.adoptedImageId,asset.image_url]),[[[],null,''],[[],null,'']]);
 assert.equal(art.images.length,3);
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
test('without-reference outfits remain searchable and leave default selection on refresh',()=>{
 const previous=[{id:'makeup-day',images:[{id:'i',url:'https://example.test/day.png'}]},{id:'makeup-night'},{id:'mug'}];
 const assets=previous.map(row=>row.id==='makeup-night'?{...row,noReferenceImage:true}:row);
 assert.deepEqual(ungeneratedAssets(assets).map(a=>a.id),['mug']);
 assert.deepEqual(visibleArtAssets(assets,false),assets);
 assert.deepEqual(reconcileAssetSelection(['makeup-day','makeup-night','mug'],previous,assets),['makeup-day','mug']);
 assert.deepEqual(ungeneratedAssets(previous).map(a=>a.id),['makeup-night','mug']);
});
