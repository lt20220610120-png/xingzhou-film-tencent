import test from 'node:test';
import assert from 'node:assert/strict';
import * as books from './promptBook.js';
import {matchBasicReferences,removeGenerationReference,generationReferenceKey} from './automaticReferences.js';

test('restore one removed shared asset keeps other exclusions and other entries, and repairs numbered references',()=>{
 let book=books.parsePromptBook('【1-1-1】【基础设定】\n人物：甲；乙；丙\n音色：甲\n【1-1-2】其他条','测试','restore');
 const refs=['甲','乙','丙'].map((name,i)=>({id:String(i),kind:'image',name}));
 refs.push({id:'voice',kind:'audio',name:'甲'});
 book=books.mergeEpisodeMedia(book,{'1':refs});const entry=book.entries[0];
 const save=value=>{book=books.saveEntryValue(book,entry.id,value);};
 save(matchBasicReferences(books.entryValue(book,entry),refs));
 for(const ref of [refs[0],refs[1],refs[3]])save(removeGenerationReference(books.entryValue(book,entry),generationReferenceKey(ref)));
 const before=JSON.stringify(book),other=books.entryValue(book,book.entries[1]);
 const restored=books.restoreEntryReference(book,entry.id,refs[0].id);
 assert.equal(JSON.stringify(book),before);
 assert.deepEqual(restored.drafts[entry.id].excludedIds,['1','voice']);
 let value=matchBasicReferences(books.entryValue(restored,entry),refs);
 assert.deepEqual(value.references.map(r=>r.id),['0','2']);
 assert.match(value.prompt,/甲（参考@image1）/);assert.match(value.prompt,/丙（参考@image2）/);
 assert(!value.autoReferenceExclusions.includes('image:0'));assert(value.autoReferenceExclusions.includes('image:1'));
 const persisted=JSON.parse(JSON.stringify(books.saveEntryValue(restored,entry.id,value)));
 assert.deepEqual(books.entryValue(persisted,entry).references.map(r=>r.id),['0','2']);
 assert.deepEqual(books.entryValue(persisted,book.entries[1]),other);
 assert.equal(books.restoreEntryReference(persisted,entry.id,'0'),persisted);
 const voice=books.restoreEntryReference(persisted,entry.id,'voice');
 assert.deepEqual(books.entryValue(voice,entry).references.map(r=>r.id),['0','2','voice']);
 assert.deepEqual(voice.drafts[entry.id].excludedIds,['1']);
});

test('restore rejects absent, out of scene, and locked association targets',()=>{
 let book=books.parsePromptBook('【1-1-1】第一条','测试','r');const id=book.entries[0].id;
 assert.equal(books.restoreEntryReference(book,id,'missing'),book);
 book=books.mergeEpisodeMedia(book,{'1':[{id:'ref',kind:'image',name:'甲'}],'2':[{id:'outside',kind:'image',name:'乙'}]});
 book.drafts[id]={excludedIds:['ref','outside'],autoReferenceExclusions:['image:ref','image:outside']};
 assert.equal(books.restoreEntryReference(book,id,'outside'),book);
 for(const bound of [{...book,linkedProjectId:'project'},{...book,importedBinding:{stage:'review'}},{...book,drafts:{[id]:{...book.drafts[id],referenceBindingMode:'confirmed'}}}]){
  assert.equal(books.restoreEntryReference(bound,id,'ref'),bound);
 }
 assert.deepEqual(books.restoreEntryReference({...book,importedBinding:{stage:'manual'}},id,'ref').drafts[id].excludedIds,['outside']);
});
