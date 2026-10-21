import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeArtAssets, displayAssetName} from './collabStore.js';
import {autoReferences, bindReferencePrompt, refreshAssetReferences} from './generationReferences.js';
import {matchBasicReferences, projectReferenceCandidates} from './automaticReferences.js';

const assets = () => [
 {id:'person',category:'character',name:'【Elena Suh-日常服】',description:'已核实角色',reviewedCategory:true},
 {id:'guitar',project_id:'p',category:'prop',name:'【Elena Suh-旧木吉他】',description:'民谣吉他，原木色面板。',sceneIds:['1-1'],episodes:[1],images:[{id:'i1',url:'https://example.test/guitar.png'}]},
 {id:'bag',project_id:'p',category:'prop',name:'【旧吉他琴袋-Elena Suh】',description:'深灰琴袋。',sceneIds:['1-1'],episodes:[1],images:[{id:'i2',url:'https://example.test/bag.png'}]},
];

test('legacy prop labels project object-first while identity, images and scene associations stay intact',()=>{
 const original=assets(),before=structuredClone(original),rows=normalizeArtAssets(original),prop=rows.find(a=>a.id==='guitar');
 assert.equal(displayAssetName(prop),'旧木吉他-Elena Suh');
 assert.equal(prop.name,'【Elena Suh-旧木吉他】');
 assert.deepEqual(prop.images,before[1].images);assert.deepEqual(prop.sceneIds,['1-1']);assert.deepEqual(original,before);
 assert.equal(displayAssetName(rows.find(a=>a.id==='bag')),'旧吉他琴袋-Elena Suh');
});

test('both legacy and object-first mentions resolve to the same existing prop image',()=>{
 const rows=normalizeArtAssets(assets());
 for(const name of ['Elena Suh-旧木吉他','旧木吉他-Elena Suh']){
  const refs=autoReferences(`参考 @【${name}】`,rows);
  assert.equal(refs.length,1);assert.equal(refs[0].assetId,'guitar');assert.equal(refs[0].imageId,'i1');
  assert.equal(bindReferencePrompt(`参考 @【${name}】`,refs),'参考 @image1');
 }
 const refreshed=refreshAssetReferences([{id:'i1',imageId:'i1',assetId:'guitar',name:'【Elena Suh-旧木吉他】',kind:'image'}],rows,'p');
 assert.equal(bindReferencePrompt('@【旧木吉他-Elena Suh】',refreshed),'@image1');
});

test('storyboard prop matching recognizes object names and exact ownership without matching a prop to its owner',()=>{
 const rows=normalizeArtAssets(assets());const candidates=projectReferenceCandidates(rows,[],'p',1,'1-1');
 for(const name of ['旧木吉他','旧木吉他-Elena Suh','Elena Suh-旧木吉他']){
  const matched=matchBasicReferences({prompt:`【基础设定】\n道具：${name}（参考@）。`,references:[]},candidates,{allowedKinds:['image']});
  assert.deepEqual(matched.references.map(r=>r.assetId),['guitar']);assert.match(matched.prompt,/@image1/);
 }
 const none=matchBasicReferences({prompt:'【基础设定】\n道具：Elena Suh（参考@）。',references:[]},candidates,{allowedKinds:['image']});
 assert.equal(none.references.length,0);
});

test('unknown prefixes and existing object-first states are not blindly reversed',()=>{
 const rows=normalizeArtAssets(assets());
 assert.equal(displayAssetName({category:'prop',name:'【旧木吉他-破损】'},rows),'旧木吉他-破损');
 assert.equal(displayAssetName({category:'prop',name:'【陌生人-信件】'},rows),'陌生人-信件');
 assert.equal(displayAssetName(rows[0]),'【Elena Suh-日常服】');
});
