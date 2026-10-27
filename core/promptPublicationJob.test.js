import test from 'node:test';import assert from 'node:assert/strict';
import {createPromptPublicationJob} from './promptPublicationJob.js';

test('publication job survives view unsubscribe, joins duplicate starts and retains failure details',async()=>{
 let release,calls=0;const gate=new Promise(r=>release=r);
 const controller=createPromptPublicationJob(async options=>{calls++;options.onProgress({phase:'publishing',total:3,done:0,active:[{episode:1,phase:'publishing'}]});await gate;options.onProgress({phase:'publishing',total:3,done:2,active:[]});return {count:3,published:2,failures:['第 2 集：网络断开']};});
 const updates=[],off=controller.subscribe(()=>updates.push(controller.snapshot()));
 const first=controller.start({actor:'u'});off();const second=controller.start({actor:'u'});
 assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);assert.equal(controller.snapshot().running,true);
 const resumed=[];const off2=controller.subscribe(()=>resumed.push(controller.snapshot()));release();await first;off2();
 assert.equal(controller.snapshot().running,false);assert.equal(controller.snapshot().result.published,2);assert.deepEqual(controller.snapshot().result.failures,['第 2 集：网络断开']);assert(resumed.length>0);
});
