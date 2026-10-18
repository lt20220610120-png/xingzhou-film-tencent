import test from 'node:test';import assert from 'node:assert/strict';
test('same-time cloud refresh does not rearrange known cards or costumes; new records append and removed records disappear',async()=>{
 const {retainAssetOrder}=await import('./stableAssetOrder.js');
 const old=['first','second','third'].map(id=>({id,created_at:'same'}));const next=[{id:'new'},...old.slice().reverse().map(a=>({...a,description:'changed'}))];
 assert.deepEqual(retainAssetOrder(old,next).map(a=>a.id),['first','second','third','new']);assert(retainAssetOrder(old,next).slice(0,3).every(a=>a.description==='changed'));
 assert.deepEqual(retainAssetOrder(old,[next[0],next[1]]).map(a=>a.id),['third','new']);
 assert.deepEqual(old.map(a=>a.id),['first','second','third']);
});
