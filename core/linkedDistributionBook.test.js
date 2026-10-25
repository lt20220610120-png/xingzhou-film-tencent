import test from 'node:test';
import assert from 'node:assert/strict';
import {linkedDistributionBook} from './linkedDistributionBook.js';
import {importedSnapshot,importedDecision} from './importedArtBinding.js';
import {bookSharedReferences} from './promptBook.js';
test('未提前分发的联动项目载入原提示词与本场图片池，可独立分发但不能修改场景清单',()=>{
 const snapshot={projectId:'p',versionId:'v1',name:'剧',entries:[{id:'a',episode:1,scene:1,number:1,label:'1-1-1',sceneId:'1-1',prompt:'【基础信息】\n人物：甲',sceneReady:true}],cards:[{uid:'c',assetId:'asset',category:'character',name:'甲',sceneIds:['1-1'],publishedSceneIds:['1-1'],images:[{id:'image',url:'https://example.com/a.png'}]}],issues:[]};
 const book=linkedDistributionBook(snapshot,{},'user');
 assert.equal(book.linkedProjectId,undefined);assert.equal(book.sourceLinkedProjectId,'p');assert.equal(book.bindingVersionId,'v1');assert.equal(book.importedBinding.stage,'review');
 assert.equal(bookSharedReferences(book,book.entries[0])[0].assetId,'asset');
 const imported=importedSnapshot(book),decision=importedDecision(imported,imported.entries[0]);assert.ok(decision.needs[0].cardUid);assert.equal(decision.confirmed,false);
});
