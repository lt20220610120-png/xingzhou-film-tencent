import test from 'node:test';
import assert from 'node:assert/strict';
import {planArtImageBatch,runArtImageBatch} from './artImageBatch.js';
const asset=(id,name,ep,extra={})=>({id,name,category:'character',first_episode:ep,episodes:[ep],...extra});
test('whole plan deduplicates reuse, skips completed images and waits for baselines',()=>{
 const rows=[asset('v','【林舟-西服】',2),asset('b','【林舟-日常服】',1,{episodes:[1,2,3]}),asset('old','【安宁】',1,{images:[{id:'i',url:'stored'}]}),asset('b','【林舟-日常服】',1)];
 const plan=planArtImageBatch(rows);assert.deepEqual(plan.map(j=>[j.asset.id,j.dependency]),[['b',null],['v','b']]);
 assert.equal(planArtImageBatch(rows,{readReference:()=>''}).find(j=>j.asset.id==='v').dependency,null);
 assert.equal(planArtImageBatch(rows,{readRecovery:id=>id==='v'?{receiptId:'saved'}:null}).find(j=>j.asset.id==='v').dependency,null);
});
test('pool bounds concurrency, finishes baseline before variant and records failures once',async()=>{
 const rows=[asset('v','【林舟-西服】',2),asset('b','【林舟-日常服】',1),...Array.from({length:5},(_,n)=>asset('p'+n,'道具'+n,1,{category:'prop'}))];
 let active=0,peak=0,baseDone=false;const calls=[];
 const result=await runArtImageBatch(planArtImageBatch(rows),{concurrency:2,generate:async a=>{calls.push(a.id);active++;peak=Math.max(peak,active);if(a.id==='v')assert.equal(baseDone,true);await new Promise(r=>setTimeout(r,4));active--;if(a.id==='b')baseDone=true;if(a.id==='p2')throw Error('provider failure');return {url:'image'};}});
 assert.equal(peak,2);assert.equal(calls.length,7);assert.equal(result.results.filter(r=>r.status==='rejected').length,1);
});
test('baseline failure prevents paid variant generation, stop leaves unstarted jobs resumable',async()=>{
 const plan=planArtImageBatch([asset('b','【林舟-日常服】',1),asset('v','【林舟-西服】',2)]),calls=[];
 const result=await runArtImageBatch(plan,{generate:async a=>{calls.push(a.id);throw Error('download pending');}});
 assert.deepEqual(calls,['b']);assert.equal(result.results.length,2);
 let stop=false;
 const paused=await runArtImageBatch(Array.from({length:4},(_,n)=>({asset:asset('p'+n,'p'+n,1)})),{concurrency:1,isStopped:()=>stop,generate:async()=>{stop=true;return {url:'saved'};}});
 assert.equal(paused.remaining,3);assert.equal(paused.results.length,1);
 await assert.rejects(runArtImageBatch([],{concurrency:0}),/并发/);
});
