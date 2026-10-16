import test from 'node:test';
import assert from 'node:assert/strict';
import {projectReferenceCandidates} from './automaticReferences.js';
import {cleanStoryboardReferenceValue} from './storyboardReferences.js';

const assets=[{id:'hero',project_id:'p',name:'林舟',sceneIds:['1-1'],images:[{id:'pic',url:'https://test/hero.png'}]}];
const assetRow={id:'pic',projectId:'p',assetId:'hero',kind:'asset-image',episode:1,url:'https://test/hero.png',filename:'1792084419220.png'};
test('asset-image storage rows are not reference media or voice samples; scene images come from assets once',()=>{
 const rows=[assetRow,{...assetRow,id:'other-scene',assetId:'other'},
  {id:'voice',kind:'audio',projectId:'p',episode:1,scene:'1-1',url:'https://test/voice.wav'},
  {id:'foreign',kind:'audio',projectId:'another',episode:1,scene:'1-1'},
  {id:'foreign-snake',kind:'image',project_id:'another',episode:1},
  {id:'file',kind:'file',episode:1},{id:'second',kind:'audio',episode:2}];
 const refs=projectReferenceCandidates(assets,rows,'p',1,'1-1');
 assert.deepEqual(refs.map(r=>[r.id,r.kind]),[['pic','image'],['voice','audio']]);
 assert.deepEqual(projectReferenceCandidates(assets,[assetRow],'p',1,'1-1').map(r=>r.kind),['image']);
});
test('legacy saved/draft raw asset rows are removed without deleting legitimate project uploads or local references',()=>{
 const image={id:'pic',kind:'image',projectId:'p',assetId:'hero',url:'https://test/hero.png'};
 const voice={id:'voice',kind:'audio',projectId:'p',url:'https://test/voice.wav'};
 const local={id:'manual',kind:'video',filePath:'C:/manual.mp4'};
 const value={prompt:'人物（参考@image2），音色@audio1。',references:[{id:'foreign',kind:'image',projectId:'other'},image,assetRow,voice,local],autoReferenceOrder:[{key:'image:foreign',alias:'@image1'},{key:'image:pic',alias:'@image2'},{key:'audio:voice',alias:'@audio1'}],autoReferenceSignature:'stale',libtvParams:{audio:'on'}};
 const next=cleanStoryboardReferenceValue(value,'p');
 assert.deepEqual(next.references,[image,voice,local]);
 assert.equal(next.prompt,'人物（参考@image1），音色@audio1。');
 assert.equal(next.autoReferenceSignature,null);
 assert.deepEqual(next.libtvParams,value.libtvParams);
 assert.equal(value.references.length,5,'input and source media remain untouched');
 assert.strictEqual(cleanStoryboardReferenceValue(next,'p'),next,'idempotent on reopen');
});
test('a clean storyboard remains identical and unknown media never get silently reclassified as audio',()=>{
 const value={prompt:'正常分镜',references:[{id:'audio',kind:'audio',project_id:'p'},{id:'img',kind:'image',projectId:'p'}]};
 assert.strictEqual(cleanStoryboardReferenceValue(value,'p'),value);
 assert.deepEqual(cleanStoryboardReferenceValue({references:[{id:'x',kind:'file'},assetRow]},'p').references,[]);
});
