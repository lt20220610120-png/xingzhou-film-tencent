import test from 'node:test';import assert from 'node:assert/strict';
import {promptDisplayParts,recommendedPromptDuration} from './promptDisplay.js';
import {createProjectBindingCache,projectBindingCache,projectBindingScope,bindingStorageEpoch,resetBindingStorage} from './projectBindingCache.js';
const gate=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)}};
test('highlight only exact attached media aliases, preserving source text byte for byte',()=>{
 const text='甲（参考@image1），声@audio1。\n未关联@image2、@image10；邮箱x@image1.com，长名@image1x。😀@video1';
 const refs=[{id:'i',kind:'image',name:'甲'},{id:'a',kind:'audio',name:'甲声'},{id:'v',kind:'video',name:'画面'}];
 const parts=promptDisplayParts(text,refs);assert.equal(parts.map(p=>p.text).join(''),text);assert.deepEqual(parts.filter(p=>p.reference).map(p=>p.text),['@image1','@audio1','@video1']);assert.equal(promptDisplayParts(text,[]).filter(p=>p.reference).length,0);
});
test('duration display accepts existing 34-second metadata but does not infer duration from prose or change settings',()=>{
 assert.equal(recommendedPromptDuration({recommendedDurationSeconds:34}),34);assert.equal(recommendedPromptDuration({recommendedDurationSeconds:'34'}),null);assert.equal(recommendedPromptDuration({duration:4,prompt:'分镜01约34秒'}),null);assert.equal(recommendedPromptDuration({recommendedDurationSeconds:Infinity}),null);assert.equal(recommendedPromptDuration({recommendedDurationSeconds:0}),null);
});
test('binding cache returns a read snapshot immediately on remount, merges concurrent loads, and refreshes only changed inputs',async()=>{
 const cache=createProjectBindingCache(),inputs=[{},{}],g=gate();let calls=0;const load=()=>{calls++;return g.promise;};
 const first=cache.load(inputs,load),second=cache.load(inputs,load);assert.equal(calls,1);g.resolve({snapshot:{entries:[1]}});await Promise.all([first,second]);assert.deepEqual(cache.snapshot().data.snapshot.entries,[1]);await cache.load(inputs,load);assert.equal(calls,1);
 const updated=gate();const third=cache.load([inputs[0],{}],()=>{calls++;return updated.promise;});assert.deepEqual(cache.snapshot().data.snapshot.entries,[1]);assert.equal(cache.snapshot().loading,false);updated.resolve({snapshot:{entries:[2]}});await third;assert.equal(calls,2);assert.deepEqual(cache.snapshot().data.snapshot.entries,[2]);
});
test('invalidation during a pending read prevents old results replacing a newer binding',async()=>{
 const cache=createProjectBindingCache(),old=gate();const promise=cache.load([1],()=>old.promise);cache.invalidate();await cache.load([1],async()=>({snapshot:{editionId:'new'}}));old.resolve({snapshot:{editionId:'old'}});await promise;assert.equal(cache.snapshot().data.snapshot.editionId,'new');
});
test('permission failures clear cached references, transient failures preserve display and surface the error',async()=>{
 const cache=createProjectBindingCache();await cache.load([1],async()=>({snapshot:{cards:[1]}}));await cache.load([2],async()=>{throw Error('network offline')});assert.deepEqual(cache.snapshot().data.snapshot.cards,[1]);assert.match(cache.snapshot().error,/offline/);await cache.load([3],async()=>{throw Error('project_access_denied')});assert.equal(cache.snapshot().data.snapshot,undefined);assert.match(cache.snapshot().data.error,/access_denied/);
});
test('failed binding reads retry with identical inputs, and numeric authorization status clears old references',async()=>{
 const cache=createProjectBindingCache();let calls=0;await cache.load([1],async()=>{calls++;throw Error('offline')});await cache.load([1],async()=>{calls++;return {snapshot:{cards:['new']}}});assert.equal(calls,2);
 for(const status of [401,403]){await cache.load([status],async()=>{throw Object.assign(Error('Forbidden'),{status})});assert.equal(cache.snapshot().data.snapshot,undefined);}
});
test('binding snapshots are isolated by source edition and data directory epoch, including offscreen invalidation',async()=>{
 const api={},project={id:'p',director_project_id:'d',episodes:[{promptEditionId:'A'}]},source={episodes:[{promptEditionId:'A'}]};
 const a=projectBindingCache(api,'user','p',projectBindingScope(project,source));await a.load([1],async()=>({snapshot:{editionId:'A'}}));
 const b=projectBindingCache(api,'user','p',projectBindingScope({...project,episodes:[{promptEditionId:'B'}]},source));assert.equal(b.snapshot().data,null);
 const otherSource=projectBindingCache(api,'user','p',projectBindingScope(project,{episodes:[{promptEditionId:'C'}]}));assert.equal(otherSource.snapshot().data,null);
 assert.equal(projectBindingCache(api,'other','p',projectBindingScope(project,source)).snapshot().data,null);
 const epoch=bindingStorageEpoch();resetBindingStorage();assert.equal(bindingStorageEpoch(),epoch+1);assert.equal(a.snapshot().data,null);assert.notEqual(projectBindingCache(api,'user','p',projectBindingScope(project,source)),a);
});
test('inactive project cache retention is bounded while the most recently viewed project stays warm',async()=>{
 const api={},first=projectBindingCache(api,'u','first');await first.load([1],async()=>({snapshot:{cards:[1]}}));
 for(let n=0;n<30;n++)projectBindingCache(api,'u','p'+n);
 assert.notEqual(projectBindingCache(api,'u','first'),first);const recent=projectBindingCache(api,'u','p29');assert.equal(projectBindingCache(api,'u','p29'),recent);
});
