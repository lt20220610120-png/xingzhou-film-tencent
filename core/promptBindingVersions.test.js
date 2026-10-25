import test from 'node:test';
import assert from 'node:assert/strict';
import {bindingVersionOptions,selectBindingVersion,saveBindingVersion} from './promptBindingVersions.js';
import {proposeEntryBinding,entryBindingSignature} from './promptArtBinding.js';
import {bookSharedReferences,mergeEpisodeMedia} from './promptBook.js';
test('prompt-scoped imports never leak into siblings and override broad image pools',()=>{
 const book=mergeEpisodeMedia({}, {1:[{id:'shared',kind:'image'},{id:'voice',kind:'audio'}]}, {'1-1':[{id:'scene',kind:'image'}]}, {'1-1-1':[{id:'one',kind:'image'}]});
 assert.deepEqual(bookSharedReferences(book,{episode:1,scene:1,label:'1-1-1'}).map(r=>r.id),['voice','one']);
 assert.deepEqual(bookSharedReferences(book,{episode:1,scene:1,label:'1-1-2'}).map(r=>r.id),['shared','voice','scene']);
});
const fixture=()=>({projectId:'p',name:'剧',cards:[{uid:'c',category:'character',name:'小明',description:'青年',detailStatus:'',sceneIds:['1-1'],publishedSceneIds:[],images:[],assetId:null}],entries:[{id:'a',label:'1-1-1',sceneId:'1-1',episode:1,scene:1,prompt:'【基础信息】\n人物：小明',sceneReady:true}],issues:[]});
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
