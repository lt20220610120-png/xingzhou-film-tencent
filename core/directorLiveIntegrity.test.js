import test from 'node:test';import assert from 'node:assert/strict';
import * as shared from '../cloud-backend/shared/directorSharedDocument.mjs';
const {Y}=shared;
const original={name:'协作测试',script:'1-1 房间 日 内\n甲：你好。',style:'真人电影级',aspectRatio:'9:16',episodes:[{id:'e1',title:'第1集',kind:'episode',status:'待导演处理',content:'1-1 房间 日 内\n甲：你好。',prompts:[{id:'p1',sceneLabel:'1-1',content:'完整提示词'}]}]};
export function legacySeed(value){
 const doc=new Y.Doc(),fields=doc.getMap('fields');
 const walk=(v,p)=>{const key=JSON.stringify(p);if(Array.isArray(v)&&v.every(x=>x&&typeof x==='object'&&typeof x.id==='string')){fields.set(JSON.stringify([...p,'@kind']),'records');v.forEach((x,i)=>{fields.set(JSON.stringify([...p,'@rank',x.id]),i);walk(x,[...p,'@item',x.id]);});}else if(v&&typeof v==='object'&&!Array.isArray(v)){fields.set(JSON.stringify([...p,'@kind']),'object');for(const [k,x]of Object.entries(v))walk(x,[...p,k]);}else if(typeof v==='string'){fields.set(key,{text:true});doc.getText('text:'+key).insert(0,v);}else fields.set(key,v);};
 doc.transact(()=>walk(value,[]));return doc;
}
test('legacy independent initial states reproduce doubled names and IDs; repair preserves later creative work',()=>{
 const doc=legacySeed(original),other=legacySeed(original);Y.applyUpdate(doc,Y.encodeStateAsUpdate(other));
 assert.equal(shared.readDocument(doc).name,original.name.repeat(2));assert.equal(shared.readDocument(doc).episodes[0].id,'e1e1');
 const broken=shared.readDocument(doc),fields=doc.getMap('fields');
 const addMissing=(v,p)=>{const key=JSON.stringify(p);if(Array.isArray(v)&&v.every(x=>x&&x.id)){if(!fields.has(JSON.stringify([...p,'@kind'])))fields.set(JSON.stringify([...p,'@kind']),'records');v.forEach((x,i)=>{fields.set(JSON.stringify([...p,'@rank',x.id]),i);addMissing(x,[...p,'@item',x.id]);});}else if(v&&typeof v==='object'&&!Array.isArray(v)){if(!fields.has(JSON.stringify([...p,'@kind'])))fields.set(JSON.stringify([...p,'@kind']),'object');for(const[k,x]of Object.entries(v))addMissing(x,[...p,k]);}else if(!fields.has(key)){if(typeof v==='string'){fields.set(key,{text:true});doc.getText('text:'+key).insert(0,v);}else fields.set(key,v);}};
 doc.transact(()=>addMissing(broken,[]));assert.equal(shared.readDocument(doc).episodes.length,2);
 doc.transact(()=>{fields.set(JSON.stringify(['episodes','@item','e1e1','prompts','@rank','paid-later']),1);addMissing({id:'paid-later',sceneLabel:'1-1',content:'晚些时候生成的付费提示词'},['episodes','@item','e1e1','prompts','@item','paid-later']);});
 const repaired=shared.repairLegacyDocument(doc);assert.equal(repaired.needed,true);assert.equal(repaired.conflicts.length,0);assert.equal(repaired.document.name,original.name);assert.equal(repaired.document.script,original.script);assert.equal(repaired.document.episodes.length,1);assert.equal(repaired.document.episodes[0].id,'e1');assert.equal(repaired.document.episodes[0].title,'第1集');assert.equal(repaired.document.episodes[0].content,original.episodes[0].content);assert.deepEqual(repaired.document.episodes[0].prompts.map(p=>p.id).sort(),['p1','paid-later']);assert.equal(repaired.document.episodes[0].prompts.find(p=>p.id==='p1').content,'完整提示词');
});
test('schema3 metadata uses atomic values and record identity remains stable during concurrent prompt creation',()=>{
 const server=shared.seedDocument({...original,episodes:[{...original.episodes[0],prompts:[]}]}),clients=Array.from({length:5},()=>{const d=new Y.Doc();Y.applyUpdate(d,Y.encodeStateAsUpdate(server));return d;});
 for(const [i,d] of clients.entries()){const base=shared.readDocument(d),v=Y.encodeStateVector(d);shared.editDocument(d,base,{...base,episodes:[{...base.episodes[0],prompts:[{id:'same-id',sceneLabel:'1-1',status:'完成',content:'成员'+i}]}]});const delta=Y.encodeStateAsUpdate(d,v);shared.assertCompatibleUpdate(server,delta);Y.applyUpdate(server,delta);}
 const merged=shared.readDocument(server);assert.equal(merged.episodes[0].prompts.length,1);assert.equal(merged.episodes[0].prompts[0].id,'same-id');assert.equal(merged.episodes[0].prompts[0].sceneLabel,'1-1');assert.equal(merged.episodes[0].prompts[0].status,'完成');assert.equal(merged.name,original.name);
});
test('detached full initial states are refused before merging and ordinary text deltas remain accepted',()=>{
 const server=shared.seedDocument(original),other=shared.seedDocument(original);assert.throws(()=>shared.assertCompatibleUpdate(server,Y.encodeStateAsUpdate(other)),/基准/);assert.deepEqual(shared.readDocument(server),original);
 const peer=new Y.Doc();Y.applyUpdate(peer,Y.encodeStateAsUpdate(server));const v=Y.encodeStateVector(peer),base=shared.readDocument(peer);shared.editDocument(peer,base,{...base,episodes:[{...base.episodes[0],content:base.episodes[0].content+'新对白'}]});const delta=Y.encodeStateAsUpdate(peer,v);shared.assertCompatibleUpdate(server,delta);Y.applyUpdate(server,delta);assert.match(shared.readDocument(server).episodes[0].content,/新对白/);
});
