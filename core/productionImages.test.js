import test from 'node:test';import assert from 'node:assert/strict';
import {produceImages} from './productionImages.js';import {productionDefaults} from './productionFurnace.js';
function setup(n=4){const assets=Array.from({length:n},(_,i)=>({id:'a'+i,name:`【杯子${i}】`,category:'prop',description:'透明玻璃杯',images:[]})),p={id:crypto.randomUUID(),name:'测试'},run={id:crypto.randomUUID(),status:'running',config:{...productionDefaults(),imageConcurrency:1,imageAttempts:1},imageItems:{}},ctx={run,guard:()=>{if(run.status!=='running')throw Error('paused');},checkpoint:async()=>{},log:async()=>{}},primary={id:'p',profileId:'p',model:'primary',endpoint:'https://primary.invalid'},fallback={id:'f',profileId:'f',model:'fallback',endpoint:'https://fallback.invalid'},calls=[];
 const api={mediaGenerateImage:async m=>{calls.push(m.model);return {filePath:'fixture.png'};},collabAttachGeneratedAssetImage:async v=>{const a=assets.find(a=>a.id===v.assetId);a.images=[{id:'img',url:'https://example.invalid/'+a.id}];return {url:a.images[0].url};},collabListAssets:async()=>assets};return {ctx,api,project:p,assets,primary,fallback,calls,delay:async()=>{}};}
test('funding rejection trips that channel once, tries configured fallback and preserves generation budget',async()=>{const f=setup(8);f.api.mediaGenerateImage=async m=>{f.calls.push(m.model);if(m.model==='primary')throw Error('Not enough quota to pre-consume');return {filePath:'fixture.png'};};const result=await produceImages(f);assert.equal(result.partial,false);assert.equal(f.calls.filter(v=>v==='primary').length,1);assert.equal(f.calls.filter(v=>v==='fallback').length,8);assert(Object.values(f.ctx.run.imageItems).every(i=>i.attempts===1));});
test('two empty channels do not make every asset send another rejected generation',async()=>{const f=setup(136);f.api.mediaGenerateImage=async m=>{f.calls.push(m.model);throw Error('insufficient_quota');};const result=await produceImages(f);assert.equal(result.partial,true);assert.equal(f.calls.length,2);assert.equal(f.ctx.run.imageErrors.length,136);assert(f.ctx.run.imageErrors.every(e=>/余额|quota/.test(e.error)));});
test('replenished image funding recovers legacy exhausted quota records without resubmitting unknown tasks',async()=>{const f=setup(2);f.ctx.run.imageItems.a0={attempts:4,status:'configuration',error:'Not enough quota to pre-consume'};f.ctx.run.imageItems.a1={attempts:1,status:'uncertain',error:'timeout'};await produceImages(f);assert.equal(f.calls.length,1);assert.equal(f.ctx.run.imageItems.a0.status,'done');assert.equal(f.ctx.run.imageItems.a1.status,'uncertain');});
test('pending generation is polled with original model credentials even when its attempt reached fallback boundary',async()=>{const f=setup(1);f.api.mediaGenerateImage=async m=>{f.calls.push(m.model);return {pendingGeneration:{id:'old-job',provider:'fixture'}};};f.api.generationRefresh=async v=>{assert.equal(v.endpoint,f.primary.endpoint);return {status:'success',filePath:'fixture.png'};};const result=await produceImages(f);assert.equal(result.partial,false);assert.deepEqual(f.calls,['primary']);});

test('three image models use ordered independent attempts and final model ratio',async()=>{
 const f=setup(1);f.policies=[{...f.primary,attempts:1,imageConcurrency:1,imageRatio:'16:9',policyKey:'primary'},{...f.fallback,attempts:2,imageConcurrency:2,imageRatio:'1:1',policyKey:'backup1'},{id:'last',model:'last',attempts:1,imageConcurrency:3,imageRatio:'9:16',policyKey:'backup2'}];
 f.api.mediaGenerateImage=async request=>{f.calls.push(request.model);if(request.model!=='last')throw Error('model failed');assert.equal(request.size,'9:16');return {filePath:'last.png'};};
 const result=await produceImages(f);assert.equal(result.partial,false);assert.deepEqual(f.calls,['primary','fallback','fallback','last']);
});

test('queued assets do not consume attempts or become unknown when a low-concurrency model is paused',async()=>{
 const f=setup(8);f.policies=[{...f.primary,attempts:1,imageConcurrency:1,policyKey:'primary'},{...f.fallback,attempts:1,imageConcurrency:8,policyKey:'backup'}];f.delay=ms=>new Promise(r=>setTimeout(r,Math.min(ms,2)));
 f.api.mediaGenerateImage=async request=>{f.calls.push(request.model);await new Promise(r=>setTimeout(r,8));f.ctx.run.status='paused';throw Error('paused');};
 await produceImages(f);assert.equal(f.calls.length,1);const queued=Object.values(f.ctx.run.imageItems).filter(i=>!i.activeModel);assert.equal(queued.length,7);assert(queued.every(i=>i.attempts===0&&i.status!=='submitting'));
});
test('queued primary assets recheck a funding circuit after acquiring a model slot',async()=>{
 const f=setup(8);f.policies=[{...f.primary,attempts:1,imageConcurrency:1,policyKey:'primary'},{...f.fallback,attempts:1,imageConcurrency:8,policyKey:'backup'}];f.delay=ms=>new Promise(r=>setTimeout(r,Math.min(ms,2)));
 f.api.mediaGenerateImage=async request=>{f.calls.push(request.model);await new Promise(r=>setTimeout(r,2));if(request.model==='primary')throw Error('insufficient_quota');return {filePath:'fixture.png'};};
 const result=await produceImages(f);assert.equal(result.partial,false);assert.equal(f.calls.filter(m=>m==='primary').length,1);assert.equal(f.calls.filter(m=>m==='fallback').length,8);
});
test('pause during durable pre-submit checkpoint rolls back an attempt that never left the client',async()=>{
 const f=setup(1);f.ctx.checkpoint=async()=>{if(f.ctx.run.imageItems.a0?.status==='submitting')f.ctx.run.status='paused';};await produceImages(f);
 assert.equal(f.calls.length,0);assert.equal(f.ctx.run.imageItems.a0.attempts,0);assert.equal(f.ctx.run.imageItems.a0.status,'queued');
});
test('actual image requests respect independent primary and fallback concurrency',async()=>{
 const f=setup(9),live={primary:0,fallback:0},peak={primary:0,fallback:0};f.policies=[{...f.primary,attempts:1,imageConcurrency:1,policyKey:'primary'},{...f.fallback,attempts:1,imageConcurrency:3,policyKey:'backup'}];f.delay=ms=>new Promise(r=>setTimeout(r,Math.min(ms,1)));
 f.api.mediaGenerateImage=async request=>{const key=request.model;live[key]++;peak[key]=Math.max(peak[key],live[key]);await new Promise(r=>setTimeout(r,key==='primary'?1:20));live[key]--;if(key==='primary')throw Error('model unavailable');return {filePath:'fixture.png'};};
 const result=await produceImages(f);assert.equal(result.partial,false);assert.equal(peak.primary,1);assert.equal(peak.fallback,3);
});
