import test from 'node:test';
import assert from 'node:assert/strict';
import {requestAssetImage,clearAssetImageRecovery,readAssetImageRecovery,assetImageRecoverySummary} from './assetImageRecovery.js';
test('FT recovery forwards current original-site credentials and never submits again',async()=>{
 let paid=0;const payload={endpoint:'https://fanke2026.xyz/v1',apiKey:'new-key'};const api={mediaGenerateImage:async()=>{paid++;return {pendingGeneration:{id:'saved',provider:'fnko'}};},generationRefresh:async p=>{assert.deepEqual(p,{id:'saved',...payload});return {status:'success',filePath:'original.png'};}};
 await assert.rejects(requestAssetImage(api,'ft','asset',payload),/原任务/);assert.equal((await requestAssetImage(api,'ft','asset',payload)).filePath,'original.png');assert.equal(paid,1);clearAssetImageRecovery('ft','asset');
});
test('confirmed failed recovery clears the block while uncertain original jobs stay protected',async()=>{
 const api={mediaGenerateImage:async()=>({pendingGeneration:{id:'confirmed',provider:'fnko'}}),generationRefresh:async()=>({status:'failed',error:'original failed'})};
 await assert.rejects(requestAssetImage(api,'terminal','asset',{}));await assert.rejects(requestAssetImage(api,'terminal','asset',{}),/original failed/);assert.equal(readAssetImageRecovery('terminal','asset'),null);
});
test('LibTV asset recovery uses original generation job without another paid submission',async()=>{let paid=0,queries=0;const api={mediaGenerateImage:async()=>{paid++;return{pendingGeneration:{id:'libtv-job'},error:'官方任务待恢复'};},generationRefresh:async()=>{queries++;return queries===1?{id:'libtv-job',status:'submitted',warning:'仍在运行'}:{id:'libtv-job',status:'success',filePath:'original.png'};}};await assert.rejects(requestAssetImage(api,'libtv','asset',{}),/待恢复/);await assert.rejects(requestAssetImage(api,'libtv','asset',{}),/仍在运行/);assert.equal((await requestAssetImage(api,'libtv','asset',{})).filePath,'original.png');assert.equal(paid,1);assert.equal(queries,2);clearAssetImageRecovery('libtv','asset');});
test('expired receipt blocks repeated downloads and generation until explicit reset',async()=>{
 let paid=0,reads=0;const api={mediaGenerateImage:async()=>{paid++;return {pendingDownload:{id:'old',reason:'expired'},error:'链接不可用'};},mediaRetryImageDownload:async()=>{reads++;}};
 await assert.rejects(requestAssetImage(api,'expired','a',{}),/不可用/);
 await assert.rejects(requestAssetImage(api,'expired','a',{}),/找回原图/);
 assert.equal(readAssetImageRecovery('expired','a').reason,'expired');assert.equal(paid,1);assert.equal(reads,0);clearAssetImageRecovery('expired','a');
});
test('download/save recovery never repeats paid generation, even when storage is full',async()=>{
  globalThis.localStorage={getItem:()=>null,setItem:()=>{throw Error('quota');},removeItem:()=>{}};
  let paid=0,downloads=0;
  const api={mediaGenerateImage:async()=>{paid++;return {pendingDownload:{id:'receipt'}};},mediaRetryImageDownload:async()=>{downloads++;return {filePath:'result.png'};}};
  await assert.rejects(requestAssetImage(api,'p','a',{}),/原图尚未取回/);
  assert.equal((await requestAssetImage(api,'p','a',{})).filePath,'result.png');
  assert.equal((await requestAssetImage(api,'p','a',{})).filePath,'result.png');
  assert.equal(paid,1);assert.equal(downloads,1);
  clearAssetImageRecovery('p','a'); delete globalThis.localStorage;
});

test('upstream 477 remains recoverable without a paid request; only explicit reset permits a new one',async()=>{
 let paid=0,reads=0;const failure={pendingDownload:{id:'receipt477',reason:'upstream',httpStatus:477,imageVerified:false},error:'源图片不存在或已过期'};
 const api={mediaGenerateImage:async()=>{paid++;return paid===1?failure:{filePath:'new.png'};},mediaRetryImageDownload:async()=>{reads++;return failure;}};
 await assert.rejects(requestAssetImage(api,'477','asset',{}),/已过期/);
 const pending=readAssetImageRecovery('477','asset');assert.equal(pending.httpStatus,477);assert.equal(pending.imageVerified,false);assert.match(assetImageRecoverySummary(pending),/上游.*477/);
 await assert.rejects(requestAssetImage(api,'477','asset',{}),/已过期/);assert.equal(paid,1);assert.equal(reads,1);
 clearAssetImageRecovery('477','asset');assert.equal(paid,1);assert.equal((await requestAssetImage(api,'477','asset',{})).filePath,'new.png');assert.equal(paid,2);clearAssetImageRecovery('477','asset');
});
