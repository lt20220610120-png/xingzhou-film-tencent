import test from 'node:test';
import assert from 'node:assert/strict';
import {requestAssetImage,clearAssetImageRecovery,readAssetImageRecovery} from './assetImageRecovery.js';
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
  await assert.rejects(requestAssetImage(api,'p','a',{}),/已生成/);
  assert.equal((await requestAssetImage(api,'p','a',{})).filePath,'result.png');
  assert.equal((await requestAssetImage(api,'p','a',{})).filePath,'result.png');
  assert.equal(paid,1);assert.equal(downloads,1);
  clearAssetImageRecovery('p','a'); delete globalThis.localStorage;
});
