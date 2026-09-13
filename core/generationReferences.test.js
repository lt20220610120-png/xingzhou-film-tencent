import test from 'node:test';import assert from 'node:assert/strict';import {appendImportedReferences,autoReferences,bindReferencePrompt,numberedReferences} from './generationReferences.js';
test('role names become correctly numbered API references across mixed media',()=>{const refs=[{kind:'audio',name:'对白'},{kind:'image',name:'【小明】'},{kind:'video',name:'镜头'},{kind:'image',name:'【小红】'}];assert.deepEqual(numberedReferences(refs).map(r=>r.alias),['@audio1','@image1','@video1','@image2']);assert.equal(bindReferencePrompt('@【小红】 与 @小明 对话，参考 @audio1',refs),'@image2 与 @image1 对话，参考 @audio1');});
test('auto links only mentioned assets; duplicate role names require explicit image selection',()=>{const assets=[{id:'a',name:'【小明】',images:[{id:'img',url:'https://x/a.png'}]},{id:'b',name:'【路人】',images:[{id:'img2',url:'https://x/b.png'}]}];assert.equal(autoReferences('@【小明】 走来',assets).length,1);assert.equal(autoReferences('空镜',assets).length,0);assert.throws(()=>bindReferencePrompt('@小明 微笑',[{kind:'image',name:'小明'},{kind:'image',name:'【小明】'}]),/多张/);});

test('batch references append in picker order and keep numbering of existing mixed media',()=>{
 const old=[{id:'a',kind:'image',name:'原图'},{id:'b',kind:'audio',name:'原音频'}];
 const next=appendImportedReferences(old,[{filePath:'C:/one.png',name:'图片一'},{filePath:'C:/two.png',name:'图片二'}],'image',{maxImages:3});
 assert.deepEqual(numberedReferences(next).map(r=>r.alias),['@image1','@audio1','@image2','@image3']);assert.equal(next[2].name,'图片一');assert.equal(old.length,2);
 assert.throws(()=>appendImportedReferences(old,[{filePath:'C:/one.png'},{filePath:'C:/two.png'}],'image',{maxImages:2}),/本次导入后共 3/);
 assert.equal(old.length,2);
});
