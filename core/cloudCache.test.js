import test from 'node:test';import assert from 'node:assert/strict';import {createCloudCache} from './cloudCache.js';
test('expire snapshots, isolate accounts, retain paid drafts and checkpoints',()=>{
 const store={};Object.defineProperties(store,{getItem:{value:k=>store[k]??null},setItem:{value:(k,v)=>store[k]=v},removeItem:{value:k=>delete store[k]}});
 store['xz-collab-cache-projects']='old';store['analysis-checkpoint']='paid';store['asset-draft']='draft';let time=1000;
 const a=createCloudCache(store,'a',()=>time);a.write('projects',[1]);assert.deepEqual(a.read('projects'),[1]);
 const b=createCloudCache(store,'b',()=>time);assert.equal(b.read('projects'),null);assert.equal(store['xz-collab-cache-projects'],undefined);
 time+=8*86400000;createCloudCache(store,'a',()=>time);assert.equal(a.read('projects'),null);
 assert.equal(store['analysis-checkpoint'],'paid');assert.equal(store['asset-draft'],'draft');
});
