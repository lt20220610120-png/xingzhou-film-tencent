import test from 'node:test';
import assert from 'node:assert/strict';
import {planArtImageBatch,runArtImageBatch,pendingCharacterBaselines,planAssetCategoryBatch} from './artImageBatch.js';
import {reconcileAssetSelection} from './assetImages.js';
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


test('reference-only batch follows declared roots, deduplicates people and skips existing images',()=>{
 const rows=[asset('v','【林舟-西服】',1,{description:'参考【林舟-日常服】；黑色西服'}),asset('b','【林舟-日常服】',2),asset('solo','【小白】',1),asset('done','【安宁-日常服】',1,{images:[{id:'i',url:'stored'}]}),asset('later','【安宁-礼服】',2),asset('prop','茶杯',1,{category:'prop'}),asset('archived','【旧人物】',1,{sceneIds:[],episodes:[]})];
 const ids=pendingCharacterBaselines(rows);assert.deepEqual(ids,['b','solo']);
 assert.deepEqual(planAssetCategoryBatch(rows,{category:'character',selectedIds:ids}).map(j=>j.asset.id).sort(),['b','solo']);
 assert(planAssetCategoryBatch(rows,{category:'character',selectedIds:['v','b','solo','later']}).some(j=>j.asset.id==='v'));
});

test('a historic cross-category selection preserves the required same-character batch dependency',()=>{
 const rows=[asset('variant','【林舟-宴会】',2),asset('base','【林舟-日常】',1),asset('room','会厅',1,{category:'scene',image_url:'room.png'})];
 const variant=planArtImageBatch(rows,{readReference:id=>id==='variant'?'room':null}).find(row=>row.asset.id==='variant');
 assert.equal(variant.dependency,'base');
});

test('bulk restoring exempt rows reselects only ungenerated assets while preserving unaffected choices',()=>{
 const before=[asset('skip','角色甲',1,{noReferenceImage:true}),asset('unchecked','角色乙',1),asset('old','角色丙',1,{noReferenceImage:true,images:[{id:'old-image'}]})];
 const restored=before.map(item=>({...item,noReferenceImage:false}));
 assert.deepEqual(reconcileAssetSelection([],before,restored),['skip']);
});

test('asset exemptions suppress default, explicitly selected, and reference-only batch dispatch',async()=>{
 const rows=[asset('skip','【张三】',1,{noReferenceImage:true}),asset('keep','【王五】',1),asset('prop','小道具',1,{category:'prop',noReferenceImage:true})];
 assert.deepEqual(planArtImageBatch(rows).map(j=>j.asset.id),['keep']);
 assert.deepEqual(planAssetCategoryBatch(rows,{category:'character',selectedIds:['skip','keep']}).map(j=>j.asset.id),['keep']);
 assert.deepEqual(pendingCharacterBaselines(rows),['keep']);
 const calls=[];
 await runArtImageBatch(planArtImageBatch(rows),{generate:async item=>{calls.push(item.id);return {url:'mock'};}});
 assert.deepEqual(calls,['keep']);
});

test('unlimited mode launches all independent images without running a variant before the baseline',async()=>{
 const rows=[asset('b','【林舟-日常】',1),asset('v','【林舟-宴会】',2),...Array.from({length:10},(_,i)=>asset('p'+i,'道具'+i,1,{category:'prop'}))];
 const releases=new Map(),started=[];
 const run=runArtImageBatch(planArtImageBatch(rows),{concurrency:Infinity,generate:a=>{
  started.push(a.id);return new Promise(resolve=>releases.set(a.id,()=>resolve({url:a.id})));
 }});
 await new Promise(setImmediate);
 assert.equal(started.length,11);assert(!started.includes('v'));
 releases.get('b')();
 await new Promise(setImmediate);
 assert(started.includes('v'));
 for(const release of releases.values())release();
 assert.equal((await run).results.length,12);
});
