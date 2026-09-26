import test from 'node:test';import assert from 'node:assert/strict';import {appendImportedReferences,autoReferences,bindReferencePrompt,numberedReferences,mediaSource} from './generationReferences.js';
test('local media URL preserves Windows drive and Unicode path for image audio and video previews',()=>{
 const filePath='C:\\Users\\11599\\行舟影视资料\\画布素材\\图片.png';
 const url=mediaSource({filePath});
 assert.match(url,/^xzmedia:\/\/\//);
 assert.equal(decodeURIComponent(url.slice('xzmedia:///'.length)),filePath);
 assert.equal(new URL(url).host,'');
});
test('role names become correctly numbered API references across mixed media',()=>{const refs=[{kind:'audio',name:'对白'},{kind:'image',name:'【小明】'},{kind:'video',name:'镜头'},{kind:'image',name:'【小红】'}];assert.deepEqual(numberedReferences(refs).map(r=>r.alias),['@audio1','@image1','@video1','@image2']);assert.equal(bindReferencePrompt('@【小红】 与 @小明 对话，参考 @audio1',refs),'@image2 与 @image1 对话，参考 @audio1');});
test('a locally imported image filename can be mentioned without its extension',()=>{
 assert.equal(bindReferencePrompt('参考 @【掉毛兔子玩偶】 和 @林青雪',[{kind:'image',name:'【掉毛兔子玩偶】.png'},{kind:'image',name:'林青雪.jpg'}]),'参考 @image1 和 @image2');
});
test('auto links only mentioned assets; duplicate role names require explicit image selection',()=>{const assets=[{id:'a',name:'【小明】',images:[{id:'img',url:'https://x/a.png'}]},{id:'b',name:'【路人】',images:[{id:'img2',url:'https://x/b.png'}]}];assert.equal(autoReferences('@【小明】 走来',assets).length,1);assert.equal(autoReferences('空镜',assets).length,0);assert.throws(()=>bindReferencePrompt('@小明 微笑',[{kind:'image',name:'小明'},{kind:'image',name:'【小明】'}]),/多张/);});

test('batch references append in picker order and keep numbering of existing mixed media',()=>{
 const old=[{id:'a',kind:'image',name:'原图'},{id:'b',kind:'audio',name:'原音频'}];
 const next=appendImportedReferences(old,[{filePath:'C:/one.png',name:'图片一'},{filePath:'C:/two.png',name:'图片二'}],'image',{maxImages:3});
 assert.deepEqual(numberedReferences(next).map(r=>r.alias),['@image1','@audio1','@image2','@image3']);assert.equal(next[2].name,'图片一');assert.equal(old.length,2);
 assert.throws(()=>appendImportedReferences(old,[{filePath:'C:/one.png'},{filePath:'C:/two.png'}],'image',{maxImages:2}),/本次导入后共 3/);
 assert.equal(old.length,2);
});


test('stored legacy and current picker references acquire renewable identities without switching images',async()=>{
 const {refreshAssetReferences}=await import('./generationReferences.js');
 const assets=[{id:'a',image_url:'new-legacy'},{id:'b',images:[{id:'i',url:'new-image'}]}];
 const refs=refreshAssetReferences([{id:'a',assetId:'a',url:'expired'},{id:'i',assetId:'b',url:'expired'}],assets,'p');
 assert.equal(refs[0].imageId,'legacy');assert.equal(refs[0].url,'new-legacy');
 assert.equal(refs[1].imageId,'i');assert.equal(refs[1].url,'new-image');assert.ok(refs.every(r=>r.projectId==='p'));
});
