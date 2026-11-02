import test from 'node:test';
import assert from 'node:assert/strict';
import {bindingVersionOptions,selectBindingVersion,saveBindingVersion,promptExportImages} from './promptBindingVersions.js';
import {proposeEntryBinding,entryBindingSignature} from './promptArtBinding.js';
import {bookSharedReferences,mergeEpisodeMedia} from './promptBook.js';
test('prompt-scoped imports never leak into siblings and override broad image pools',()=>{
 const book=mergeEpisodeMedia({}, {1:[{id:'shared',kind:'image'},{id:'voice',kind:'audio'}]}, {'1-1':[{id:'scene',kind:'image'}]}, {'1-1-1':[{id:'one',kind:'image'}]});
 assert.deepEqual(bookSharedReferences(book,{episode:1,scene:1,label:'1-1-1'}).map(r=>r.id),['voice','one']);
 assert.deepEqual(bookSharedReferences(book,{episode:1,scene:1,label:'1-1-2'}).map(r=>r.id),['shared','voice','scene']);
});
const fixture=()=>({projectId:'p',name:'剧',cards:[{uid:'c',category:'character',name:'小明',description:'青年',detailStatus:'',sceneIds:['1-1'],publishedSceneIds:[],images:[],assetId:null}],entries:[{id:'a',label:'1-1-1',sceneId:'1-1',episode:1,scene:1,prompt:'【基础信息】\n人物：小明',sceneReady:true}],issues:[]});
test('voice references never enter prompt image export',()=>{
 const snapshot=fixture();snapshot.cards=[];snapshot.entries[0].prompt='【基础信息】\n人物：无\n场景：无\n道具：无\n【对白】\n小明：回来。';snapshot.voiceCards=[{uid:'v',name:'小明',sceneIds:['1-1'],reference:{id:'voice:v',kind:'audio',filePath:'D:/a.wav'}}];
 const decision={...proposeEntryBinding(snapshot,snapshot.entries[0]),confirmed:true,speakers:[{voiceUid:'v',kind:'dialogue',evidence:'小明：回来。'}]};
 assert.deepEqual(promptExportImages(snapshot,{a:decision}),[]);
 const media=promptExportImages(snapshot,{a:decision},{includeAudio:true});assert.equal(media.length,1);assert.equal(media[0].kind,'audio');assert.deepEqual(media[0].promptIds,['1-1-1']);
});
test('新旧提示词集合隔离分发，选旧版使用当前卡片且不改变整场清单',()=>{
 const first=fixture(),decision={...proposeEntryBinding(first,first.entries[0]),confirmed:true};
 let saved=saveBindingVersion(null,first,{a:decision});
 const oldId=bindingVersionOptions(first,saved)[0].id;
 const next={...first,entries:[{...first.entries[0],id:'b',prompt:first.entries[0].prompt+'\n【镜头】新版本'}]};
 saved=saveBindingVersion(saved,next,{});
 assert.equal(bindingVersionOptions(next,saved).length,2);
 const old=selectBindingVersion(next,saved,oldId);
 assert.equal(old.snapshot.entries[0].id,'a');assert.equal(old.decisions.a.confirmed,true);
 assert.deepEqual(old.snapshot.cards,next.cards);assert.equal(selectBindingVersion(next,saved).decisions.b,undefined);
});
test('确认用途后首次出图自动接上单图，改了卡片依据则仍需审核',()=>{
 const first=fixture(),saved=saveBindingVersion(null,first,{a:{...proposeEntryBinding(first,first.entries[0]),confirmed:true}});
 const next=structuredClone(first);Object.assign(next.cards[0],{assetId:'asset',publishedSceneIds:['1-1'],images:[{id:'img',url:'test.png'}]});
 const result=selectBindingVersion(next,saved);
 assert.equal(result.decisions.a.confirmed,true);assert.equal(result.decisions.a.needs[0].imageId,'img');
 assert.equal(result.decisions.a.signature,entryBindingSignature(result.snapshot,result.snapshot.entries[0]));
 next.cards[0].description='老年';const changed=selectBindingVersion(next,saved);assert.notEqual(changed.decisions.a.signature,entryBindingSignature(changed.snapshot,changed.snapshot.entries[0]));
});

test('per-entry evidence survives another save, publication, images and unrelated added cards',()=>{
 const first=fixture(),entry=first.entries[0];const accepted={...proposeEntryBinding(first,entry),origin:'manual',confirmed:true};let saved=saveBindingVersion(null,first,{a:accepted});
 const next=structuredClone(first);next.cards.push({...next.cards[0],uid:'new',name:'另一个人'});next.cards[0].images=[{id:'image',url:'local.png'}];next.cards[0].publishedSceneIds=['1-1'];next.cards[0].assetId='asset';
 let reopened=selectBindingVersion(next,JSON.parse(JSON.stringify(saved)));assert.equal(reopened.decisions.a.signature,entryBindingSignature(reopened.snapshot,reopened.snapshot.entries[0]));assert.equal(reopened.decisions.a.needs[0].imageId,'image');
 saved=saveBindingVersion(saved,reopened.snapshot,reopened.decisions);
 const changed=structuredClone(next);changed.cards[0].description='不同身份';reopened=selectBindingVersion(changed,saved);assert.notEqual(reopened.decisions.a.signature,entryBindingSignature(reopened.snapshot,reopened.snapshot.entries[0]));
 // Another write cannot discard the original accepted baseline.
 saved=saveBindingVersion(saved,reopened.snapshot,reopened.decisions);reopened=selectBindingVersion(next,JSON.parse(JSON.stringify(saved)));assert.equal(reopened.decisions.a.signature,entryBindingSignature(reopened.snapshot,reopened.snapshot.entries[0]));
 const edited=structuredClone(saved);edited.decisions.a.needs[0].reason='人工修改';edited.decisions.a.signature='manual-draft';assert.notEqual(selectBindingVersion(next,edited).decisions.a.signature,entryBindingSignature(reopened.snapshot,reopened.snapshot.entries[0]));
});
