import test from 'node:test';
import assert from 'node:assert/strict';
import {getArtModelQueue,requestArtModel} from './artModelQueue.js';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
test('33 automatic requests use five actual slots, reserve the sixth for manual work and report the rest queued',async()=>{
 const hold=gate();let active=0,peak=0,calls=0;
 const api={aiChat:async()=>{calls++;active++;peak=Math.max(peak,active);await hold.promise;active--;return 'ok'}};
 const jobs=Array.from({length:33},()=>requestArtModel(api,{},{}));
 await new Promise(r=>setImmediate(r));const queue=getArtModelQueue(api);
 assert.equal(calls,5);assert.deepEqual(queue.status(),{active:5,queued:28,limit:6});
 const manual=requestArtModel(api,{},{manual:true});await new Promise(r=>setImmediate(r));assert.equal(calls,6);assert.equal(queue.status().queued,28);
 hold.resolve();await Promise.all([...jobs,manual]);assert.equal(peak,6);assert.equal(queue.status().active,0);
});
test('cancelled queued work does not call the API and cannot block an independent task',async()=>{
 const hold=gate(),job={cancelled:false};let calls=0;
 const api={aiChat:async()=>{calls++;await hold.promise}};
 const running=Array.from({length:5},()=>requestArtModel(api,{}));
 const cancelled=requestArtModel(api,{}, {job}).catch(e=>e);job.cancelled=true;
 const independent=requestArtModel(api,{}, {manual:true});hold.resolve();await Promise.all([...running,independent]);
 assert.match((await cancelled).message,/停止/);assert.equal(calls,6);
});
