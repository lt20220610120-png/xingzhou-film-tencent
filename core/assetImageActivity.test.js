import test from 'node:test';
import assert from 'node:assert/strict';
import {assetImageActivity,beginAssetImageDirectorySwitch,finishAssetImageDirectorySwitch,revokeAssetImageActivities} from './assetImageActivity.js';
import {resetBindingStorage} from './projectBindingCache.js';

const job=(id,dependency=null)=>({asset:{id,name:id},dependency});
const turn=()=>new Promise(setImmediate);
function mockGeneration() {
 const calls=[],waiting=new Map(),attachments=[];
 return {calls,attachments,
  generate:async(asset,{referenceImage,guard})=>{
   calls.push({id:asset.id,reference:referenceImage?.url});
   await new Promise(resolve=>waiting.set(asset.id,resolve));
   guard();
   if(asset.id==='broken')throw Error('模拟接口失败');
   return {url:asset.id+'.png'};
  },
  onAttached:(asset,image)=>attachments.push([asset.id,image.url]),
  release:id=>waiting.get(id)(),
 };
}

test('project activity outlives both views and merges independent batches without duplicate asset calls',async()=>{
 const owner='qa',project='parallel',activity=assetImageActivity(project,owner),fake=mockGeneration();
 const props=activity.start([job('p1'),job('p2')],{...fake,label:'道具',concurrency:1});
 const unsubscribe=activity.subscribe(()=>{});
 const baseline=activity.start([job('b')],{...fake,label:'基准',concurrency:2});
 const extra=activity.start([job('p1'),job('b'),job('v','b')],{...fake,label:'妆造',concurrency:Infinity});
 unsubscribe();
 const other=assetImageActivity('other-project',owner);
 assert.notEqual(other,activity);
 assert.equal(await activity.runSingle('b',()=>assert.fail('paid twice')),undefined);
 await turn();
 assert.deepEqual(fake.calls.map(call=>call.id),['p1','b']);
 fake.release('b');await baseline;await turn();
 assert.deepEqual(fake.calls.at(-1),{id:'v',reference:'b.png'});
 fake.release('p1');fake.release('v');await extra;await turn();
 assert.equal(fake.calls.at(-1).id,'p2');fake.release('p2');await props;
 const resumed=assetImageActivity(project,owner).snapshot();
 assert.deepEqual([...resumed.ids],[]);
 assert.deepEqual(resumed.batches.map(b=>[b.completed,b.failed,b.running]),[[2,0,false],[1,0,false],[1,0,false]]);
 assert.equal(fake.attachments.length,4);
});

test('stop interrupts external dependency waits while a separate batch drains',async()=>{
 const activity=assetImageActivity('stop','qa'),fake=mockGeneration();
 const base=activity.start([job('b')],{...fake,label:'基准'});
 const variants=activity.start([job('v','b')],{...fake,label:'妆造'});
 await turn();
 activity.stop(activity.snapshot().batches[1].id);
 await variants;
 assert.equal(activity.snapshot().batches[1].remaining,1);
 assert.equal(activity.snapshot().batches[0].running,true);
 fake.release('b');await base;
 assert.deepEqual(fake.calls.map(call=>call.id),['b']);
});

test('directory switch drains submitted images and blocks new work before rebinding scopes',async()=>{
 const activity=assetImageActivity('directory','qa'),fake=mockGeneration();
 const batch=activity.start([job('running'),job('not-started')],{...fake,label:'道具',concurrency:1});
 await turn();
 const stopped=beginAssetImageDirectorySwitch();
 try{
  assert.equal(activity.start([job('new')],{...fake,label:'角色'}),undefined);
  fake.release('running');
  await stopped;await batch;
  assert.deepEqual(fake.attachments,[['running','running.png']]);
  assert.equal(activity.snapshot().batches[0].remaining,1);
  resetBindingStorage();
  assert.throws(activity.guard,/资料目录/);
  assert.deepEqual(assetImageActivity('directory','qa').snapshot().batches,[]);
 }finally{finishAssetImageDirectorySwitch();}
});

test('logout fences delayed results and stops queued work across projects',async()=>{
 const activity=assetImageActivity('logout','old-account'),fake=mockGeneration();
 const batch=activity.start([job('old'),job('queued')],{...fake,label:'道具',concurrency:1});
 await turn();
 revokeAssetImageActivities();
 fake.release('old');await batch;
 assert.deepEqual(fake.attachments,[]);
 assert.deepEqual(fake.calls.map(call=>call.id),['old']);
 assert.equal(activity.snapshot().batches[0].remaining,1);
 assert.deepEqual(assetImageActivity('logout','new-account').snapshot().batches,[]);
});
