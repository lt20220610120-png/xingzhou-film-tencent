import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePromptBook,bookOutline,entryValue,saveEntryValue,mergeEpisodeMedia,referencePolicy} from './promptBook.js';

test('only bracketed triplets split blocks; gaps and duplicate occurrence order survive',()=>{
 const text='说明 9-9-9\r\n【2-3-4】\r\n 原文\r\n第二行 \r\n【1-1-1】一\n[2-3-4]二【2-3-4】三';
 const book=parsePromptBook(text,'全剧.docx','b');
 assert.deepEqual(book.entries.map(e=>e.label),['2-3-4','1-1-1','2-3-4（1）','2-3-4（2）']);
 assert.equal(book.entries[0].prompt,'\r\n 原文\r\n第二行 \r\n');
 assert.equal(new Set(book.entries.map(e=>e.id)).size,4);
 assert.deepEqual(bookOutline(book).map(e=>[e.number,e.scenes.map(s=>[s.number,s.entries.length])]),[[1,[[1,1]]],[2,[[3,3]]]]);
 assert.throws(()=>parsePromptBook('1-1-1 无括号'),/编号/);
 assert.throws(()=>parsePromptBook('【0-1-1】内容'),/正整数/);
});

test('episode references are shared, exclusions and edits belong only to one entry and survive JSON',()=>{
 let book=parsePromptBook('【1-1-1】甲【1-1-2】乙【2-1-1】丙','全剧','b');
 const [a,b,c]=book.entries;
 book=mergeEpisodeMedia(book,{'1':[{id:'i',kind:'image',name:'图'},{id:'v',kind:'video',name:'视频'}]});
 book=saveEntryValue(book,a.id,{...entryValue(book,a),prompt:'修改',references:[{id:'v',kind:'video',name:'视频',role:'reference_video'}]});
 book=JSON.parse(JSON.stringify(book));
 assert.equal(entryValue(book,a).prompt,'修改');
 assert.deepEqual(entryValue(book,a).references.map(r=>r.id),['v']);
 assert.deepEqual(entryValue(book,b).references.map(r=>r.id),['i','v']);
 assert.deepEqual(entryValue(book,c).references,[]);
 assert.equal(book.drafts[a.id].references,undefined);
 book=mergeEpisodeMedia(book,{'1':[{id:'i',kind:'image'},{id:'new',kind:'audio'}],'2':[]});
 assert.deepEqual(entryValue(book,a).references.map(r=>r.id),['v','new']);
 assert.deepEqual(book.episodeMedia[1].map(r=>r.id),['i','v','new']);
});

test('model policy hides unsupported types without modifying the shared library',()=>{
 assert.deepEqual(referencePolicy(false,{}),{maxImages:1,maxVideos:0,maxAudios:0});
 assert.deepEqual(referencePolicy(true,{maxImages:9,maxVideos:0,maxAudios:2}),{maxImages:9,maxVideos:0,maxAudios:2});
});

test('a late file picker cannot exclude shared media added after it opened',()=>{
 let book=parsePromptBook('【1-1-1】正文','全剧','b');
 const entry=book.entries[0],before=entryValue(book,entry);
 book=mergeEpisodeMedia(book,{'1':[{id:'shared',kind:'image'}]});
 book=saveEntryValue(book,entry.id,{...before,references:[{id:'local',kind:'image'}]},before);
 assert.deepEqual(entryValue(book,entry).references.map(r=>r.id),['shared','local']);
 assert.deepEqual(book.drafts[entry.id].excludedIds,[]);
});
