import test from 'node:test';import assert from 'node:assert/strict';
import {runContinuousArtAnalysis} from './artContinuousAnalysis.js';
import {artScriptFingerprint} from './artScriptContext.js';
function fixture(){
 const job={},project={id:crypto.randomUUID(),genre:'旧手填题材',episodes:[1,2].map(n=>({episodeNumber:n,title:`第${n}集`,content:`${n}-1 街道 日 外\n林舟牵着狗。`}))};
 let disk={episodes:{},scriptContext:{signature:artScriptFingerprint(project),complete:true,summary:{warnings:['原文族群未明确，请核对']},genre:'背景：现代纽约\n时代：现代\n人种与族群：未明确\n风格：都市奇幻'}},calls=[];
 const inventory=n=>`### 第${n}集\n人物：\n- 【旺财-狗】主体类型：生物；物种：犬。黄毛，四足。\n场景：\n- 无\n道具：\n- 无\n【逐场资产对应表】\n${JSON.stringify({scenes:[{sceneId:`${n}-1`,assets:[{category:'character',name:'【旺财-狗】'}]}]})}`;
 const api={artReviewLoadLocal:async()=>disk,artReviewSaveLocal:async p=>{disk=structuredClone(p.data)},analysisLoad:async()=>null,collabUpdateProject:async()=>project,aiChat:async p=>{calls.push(p);const n=Number(p.messages.map(m=>m.content).join('').match(/当前输出只包含第(\d+)集/)?.[1]||1);return {ok:true,output:inventory(n)}}};
 return {project,api,calls,inventory,job,profile:{id:'model',model:'mock'},waitForRetry:async()=>{if(calls.length>12){job.cancelled=true;throw Error('test retry guard exceeded')}},get disk(){return disk}};
}
test('continuous run automatically retries a failed episode then completes the entire script without another click',async()=>{
 const f=fixture(),original=f.api.aiChat;let once=true;
 f.api.aiChat=async p=>{if(once){once=false;f.calls.push(p);throw Error('模型连接暂时失败')}return original(p)};
 const result=await runContinuousArtAnalysis(f);assert.deepEqual(result.errors,[]);assert.equal(result.workflow.phase,'complete');assert.equal(f.calls.length,3);
 assert.match(f.calls[1].messages.map(m=>m.content).join(''),/模型连接暂时失败/);assert.match(f.calls[1].messages.map(m=>m.content).join(''),/现代纽约/);assert.ok(result.warnings.some(w=>w.includes('自动修复')));
 const count=f.calls.length;await runContinuousArtAnalysis(f);assert.equal(f.calls.length,count,'complete episodes incur no new model calls');
});
test('bad scene mapping is repaired before next episode and missing descriptions are retried automatically',async()=>{
 const f=fixture(),original=f.api.aiChat;let missing=true,badMap=true;
 f.api.aiChat=async p=>{
  const text=p.messages.map(m=>m.content).join('');
  if(text.includes('requestedItems')){f.calls.push(p);if(missing){missing=false;return {output:'{"items":[]}'}}const data=JSON.parse(p.messages[1].content).untrustedData;return {output:JSON.stringify({items:data.requestedItems.map(item=>({...item,description:'主体类型：生物；物种：犬。四足黄毛，尖耳，完整尾巴。'}))})};}
  if(badMap){badMap=false;f.calls.push(p);return {output:f.inventory(1).replace('主体类型：生物；物种：犬。黄毛，四足。','（首次）').replace('【旺财-狗】"','【未列出的狗】"')};}
  if(text.includes('只补齐对应表')){f.calls.push(p);return {output:'【逐场资产对应表】\n'+JSON.stringify({scenes:[{sceneId:'1-1',assets:[{category:'character',name:'【旺财-狗】'}]}]})};}
  return original(p);
 };
 const result=await runContinuousArtAnalysis(f);assert.equal(result.workflow.phase,'complete');assert.deepEqual(result.errors,[]);assert.ok(f.calls.length>=5);assert.equal(f.disk.episodes[2].status,'generated');
});
test('waiting can be stopped and resumes without claiming complete or retrying during checkpoint failure',async()=>{
 const f=fixture(),job={};f.api.aiChat=async()=>{throw Error('余额不足')};
 const result=await runContinuousArtAnalysis({...f,job,waitForRetry:async()=>{job.cancelled=true}});assert.notEqual(result.workflow.phase,'complete');assert.equal(f.disk.analysisRun.status,'stopped');
 const broken=fixture();broken.api.artReviewSaveLocal=async()=>{throw Error('disk full')};await assert.rejects(runContinuousArtAnalysis(broken),/disk full/);assert.equal(broken.calls.length,0);
});
test('a parseable but interrupted inventory must be retried, never falsely completed or skipped',async()=>{
 const f=fixture(),original=f.api.aiChat;let once=true;
 f.api.aiChat=async p=>{const r=await original(p);if(once){once=false;return {...r,ok:false,error:'输出截断'}}return r;};
 const result=await runContinuousArtAnalysis(f);assert.equal(f.calls.length,3);assert.equal(result.workflow.phase,'complete');assert.deepEqual(result.errors,[]);assert.ok(!f.disk.episodes[1].failure);assert.equal(f.disk.episodes[1].generation.status,'saved');
});
test('interrupted detail cards keep their text but are rechecked before the next episode',async()=>{
 const f=fixture(),original=f.api.aiChat;let once=true,details=0;
 f.api.aiChat=async p=>{
  if(p.messages[1]?.content.includes('requestedItems')){details++;f.calls.push(p);const data=JSON.parse(p.messages[1].content).untrustedData;return {ok:details!==1,error:details===1?'描述回包截断':undefined,output:JSON.stringify({items:data.requestedItems.map(i=>({...i,description:'主体类型：生物；物种：犬。四足黄毛、完整尾巴。'}))})};}
  const r=await original(p);if(once){once=false;r.output=r.output.replace('主体类型：生物；物种：犬。黄毛，四足。','');}return r;
 };
 const result=await runContinuousArtAnalysis(f);assert.equal(result.workflow.phase,'complete');assert.equal(details,2);assert.equal(f.disk.episodes[1].roster[0].ready,true);
});
test('an interrupted nonvisual decision cannot silently mark an unfinished card complete',async()=>{
 const f=fixture(),original=f.api.aiChat;let once=true,details=0;
 f.api.aiChat=async p=>{
  if(p.messages[1]?.content.includes('requestedItems')){details++;f.calls.push(p);const data=JSON.parse(p.messages[1].content).untrustedData;return {ok:details!==1,error:'回包中断',output:JSON.stringify({items:data.requestedItems.map(i=>details===1?{...i,visible:false,reason:'仅声音'}:{...i,description:'主体类型：生物；物种：犬。四足黄毛。'})})};}
  const r=await original(p);if(once){once=false;r.output=r.output.replace('主体类型：生物；物种：犬。黄毛，四足。','');}return r;
 };
 const result=await runContinuousArtAnalysis(f);assert.equal(result.workflow.phase,'complete');assert.equal(details,2);assert.notEqual(f.disk.episodes[1].roster[0].detailStatus,'nonvisual');
});
