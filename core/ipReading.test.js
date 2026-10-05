import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runReadingPool,normalizeReadConcurrency} from './ipReading.js';
test('reading pool obeys concurrency and keeps completed results with out-of-order responses',async()=>{
 let active=0,peak=0;const done=[];
 await runReadingPool([0,1,2,3,4],async i=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,i===0?30:2));done.push(i);active--;},{concurrency:3});
 assert.equal(peak,3);assert.equal(active,0);assert.deepEqual(done.slice().sort(),[0,1,2,3,4]);assert.notEqual(done[0],0);
 assert.equal(normalizeReadConcurrency(99),8);assert.equal(normalizeReadConcurrency(-2),1);
});
test('failure stops assigning new intervals and drains successful in-flight reads',async()=>{
 const saved=[],started=[];
 await assert.rejects(runReadingPool([0,1,2,3,4],async i=>{started.push(i);if(i===0)throw new Error('quota');await new Promise(r=>setTimeout(r,15));saved.push(i);},{concurrency:2}),/quota/);
 assert.deepEqual(started,[0,1]);assert.deepEqual(saved,[1]);
});
test('cancellation drains running reads and starts no further requests',async()=>{
 let cancelled=false,active=0,started=0;
 await assert.rejects(runReadingPool([0,1,2,3],async()=>{started++;active++;cancelled=true;await new Promise(r=>setTimeout(r,5));active--;},{concurrency:3,isCancelled:()=>cancelled}),e=>e.name==='AbortError');
 assert.equal(started,1);assert.equal(active,0);
});
