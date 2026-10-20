import test from 'node:test';
import assert from 'node:assert/strict';
import {requestAssetImage,readAssetImageRecovery,clearAssetImageRecovery} from './assetImageRecovery.js';
import {planAssetImageRecovery,runAssetImageRecoveryBatch,abandonAssetImageRecoveries} from './assetImageRecoveryBatch.js';
const asset=(id,images=[])=>({id,name:`【${id}】`,category:'prop',images,first_episode:3});
async function receipt(project,id){await assert.rejects(requestAssetImage({mediaGenerateImage:async()=>({pendingDownload:{id:'receipt-'+id,reason:'upstream',httpStatus:477}})},project,id,{}));}

test('recovery scope is exactly supplied unfinished assets with existing results, deduplicated',async()=>{
 const p='batch-plan';await receipt(p,'a');await receipt(p,'done');await receipt(p,'outside');
 const plan=planAssetImageRecovery(p,[asset('a'),asset('a'),asset('never'),asset('done',[{url:'image.png'}])]);
 assert.deepEqual(plan.targets.map(a=>a.id),['a']);assert.deepEqual(plan.skipped.map(a=>a.id),['never']);
 for(const id of ['a','done','outside'])clearAssetImageRecovery(p,id);
});

test('mixed recovery saves successes, lists failure names, and never submits paid generation',async()=>{
 const p='batch-mixed';for(const id of ['ok','bad'])await receipt(p,id);let paid=0,reads=0,attached=[];
 const api={mediaGenerateImage:async()=>{paid++;throw Error('must not generate');},mediaRetryImageDownload:async({receiptId})=>{reads++;return receiptId==='receipt-ok'?{filePath:'ok.png'}:{pendingDownload:{id:receiptId,reason:'upstream',httpStatus:477},error:'源图片已过期（HTTP 477）'};}};
 const report=await runAssetImageRecoveryBatch(api,p,[asset('ok'),asset('bad'),asset('never')],{attach:async(a,r)=>{attached.push(a.id);return {url:r.filePath};}});
 assert.equal(paid,0);assert.equal(reads,2);assert.deepEqual(attached,['ok']);assert.equal(report.results.filter(r=>r.status==='fulfilled').length,1);const failed=report.results.find(r=>r.status==='rejected');assert.equal(failed.asset.name,'【bad】');assert.match(failed.reason.message,/477/);assert.equal(report.skipped.length,1);assert.equal(readAssetImageRecovery(p,'ok'),null);assert(readAssetImageRecovery(p,'bad'));clearAssetImageRecovery(p,'bad');
});

test('cleared receipts cannot fall through to generation; attach failure keeps local recovery',async()=>{
 const p='batch-race';let paid=0;const api={mediaGenerateImage:async()=>{paid++;return{};}};
 await assert.rejects(requestAssetImage(api,p,'cleared',{}, {recoveryOnly:true}),/没有待恢复/);assert.equal(paid,0);
 await receipt(p,'local');api.mediaRetryImageDownload=async()=>({filePath:'kept.png'});
 const result=await runAssetImageRecoveryBatch(api,p,[asset('local')],{attach:async()=>{throw Error('保存失败');}});assert.equal(result.results[0].status,'rejected');assert.equal(readAssetImageRecovery(p,'local').filePath,'kept.png');clearAssetImageRecovery(p,'local');
});

test('bulk abandon only clears scoped idle unfinished recovery and never starts generation',async()=>{
 const p='batch-abandon';for(const id of ['a','busy','done','outside'])await receipt(p,id);await receipt('other-project','a');
 const result=abandonAssetImageRecoveries(p,[asset('a'),asset('busy'),asset('never'),asset('done',[{url:'done.png'}])],{isBusy:id=>id==='busy'});
 assert.deepEqual(result.cleared.map(a=>a.id),['a']);assert.equal(readAssetImageRecovery(p,'a'),null);for(const id of ['busy','done','outside'])assert(readAssetImageRecovery(p,id));assert(readAssetImageRecovery('other-project','a'));
 for(const id of ['busy','done','outside'])clearAssetImageRecovery(p,id);clearAssetImageRecovery('other-project','a');
});

test('stop prevents not-yet-started recoveries while preserving their receipts',async()=>{
 const p='batch-stop';await receipt(p,'a');await receipt(p,'b');let stop=false,reads=0;
 const report=await runAssetImageRecoveryBatch({mediaRetryImageDownload:async()=>{reads++;return {filePath:'original.png'};}},p,[asset('a'),asset('b')],{concurrency:1,isStopped:()=>stop,attach:async()=>{stop=true;return {url:'image.png'};}});
 assert.equal(reads,1);assert.equal(report.remaining,1);assert(readAssetImageRecovery(p,'b'));clearAssetImageRecovery(p,'b');
});
