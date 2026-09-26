import test from 'node:test';
import assert from 'node:assert/strict';
import {activePromptMention,insertPromptReference,matchingPromptReferences} from './promptMentions.js';

test('typing @ or placing the caret after it opens a mention; ordinary text and email do not',()=>{
 assert.deepEqual(activePromptMention('参考@',3),{start:2,end:3,query:''});
 assert.deepEqual(activePromptMention('前文 @苏洲',6),{start:3,end:6,query:'苏洲'});
 assert.equal(activePromptMention('前文 @苏洲 后文',9),null);
 assert.equal(activePromptMention('a@example.com',13),null);
 assert.equal(activePromptMention('参考@苏洲',3,5),null);
});

test('selecting a suggestion replaces only the active @ query and restores the caret there',()=>{
 const source='第一段 @苏洲 第二段\n结尾';
 const result=insertPromptReference(source,7,7,'@image2');
 assert.equal(result.text,'第一段 @image2 第二段\n结尾');
 assert.equal(result.caret,'第一段 @image2'.length);
 assert.equal(insertPromptReference('甲 @image1 乙',9,9,'@image3').text,'甲 @image3 乙');
 assert.equal(insertPromptReference('甲@乙',2,2,'@image2').text,'甲@image2 乙');
});

test('the existing reference chip inserts at the caret or replaces a selected range',()=>{
 assert.deepEqual(insertPromptReference('前文后文',2,2,'@image1'),{text:'前文 @image1 后文',caret:'前文 @image1'.length});
 assert.deepEqual(insertPromptReference('前文旧词后文',2,4,'@video1'),{text:'前文 @video1 后文',caret:'前文 @video1'.length});
 assert.deepEqual(insertPromptReference('',0,0,'@audio1'),{text:'@audio1',caret:7});
});

test('mention picker filters the already numbered mixed media by alias or filename',()=>{
 const refs=[{kind:'image',name:'苏洲.jpg'},{kind:'audio',name:'对白.wav'},{kind:'image',name:'【掉毛兔子】.png'},{kind:'video',name:'镜头.mp4'}];
 assert.deepEqual(matchingPromptReferences(refs,'').map(ref=>ref.alias),['@image1','@audio1','@image2','@video1']);
 assert.deepEqual(matchingPromptReferences(refs,'掉毛').map(ref=>ref.alias),['@image2']);
 assert.deepEqual(matchingPromptReferences(refs,'image2').map(ref=>ref.name),['【掉毛兔子】.png']);
 assert.deepEqual(matchingPromptReferences(refs,'对白').map(ref=>ref.alias),['@audio1']);
});
