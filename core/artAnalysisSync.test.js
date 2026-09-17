import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisFingerprint,runArtAnalysis,buildExistingAssetContext} from './artAnalysisRunner.js';
import {syncSavedArtAnalysis,summarizeArtSync} from './artAnalysisSync.js';
const text=n=>`### 第${n}集\n人物：\n- 无\n场景：\n- 无\n道具：\n- 【文件${n}】（首次）纸质文件。`;
async function setup(count){const project={id:'sync-test',genre:'都市',episodes:Array.from({length:count},(_,i)=>({title:`第${i+1}集`,content:`${i+1}-1 家 日 内`}))};let disk={episodes:{}};for(const[e,ep]of project.episodes.entries())disk.episodes[e+1]={fingerprint:await analysisFingerprint('都市',ep),chunks:[ep.content],outputs:[text(e+1)],published:count>37&&e<37};return {project,get disk(){return disk},load:async()=>structuredClone(disk),save:async v=>{disk=structuredClone(v)}};}
test('restart sync needs no model profile, proceeds after episode38 failure, and persists exact pending error',async()=>{
 const f=await setup(80),calls=[],raw=JSON.stringify(f.disk);let aiCalls=0;const job={};
 const result=await syncSavedArtAnalysis({...f,job,api:{aiChat:async()=>{aiCalls++;throw Error('no paid calls')},collabPublishAnalysis:async p=>{calls.push(p.episodeNumber);if(p.episodeNumber===38)throw Error('格式错误示例')}}});
 assert.equal(aiCalls,0);assert.equal(calls.length,43);assert.equal(calls.at(-1),80);assert.deepEqual(result.pendingEpisodes,[38]);assert.match(job.error,/38.*格式错误/);assert.equal(f.disk.episodes[80].published,true);assert.equal(f.disk.episodes[38].published,false);
 for(const[k,r]of Object.entries(JSON.parse(raw).episodes))assert.deepEqual(f.disk.episodes[k].outputs,r.outputs);
 assert.equal(summarizeArtSync(f.disk).pending,1);
});
test('changed source stays pending with a visible error and does not invoke model or publish',async()=>{
 const f=await setup(1);f.project.episodes[0].content='1-1 街道 日 外';let calls=0;
 const result=await syncSavedArtAnalysis({...f,api:{collabPublishAnalysis:async()=>{calls++}}});
 assert.equal(calls,0);assert.deepEqual(result.pendingEpisodes,[1]);assert.match(result.syncErrors[0].error,/原文|题材/);
});
test('retry reconciles successful cloud publication after local acknowledgement was lost',async()=>{
 const f=await setup(1);const r=f.disk.episodes[1];f.project.analysis_progress={1:{fingerprint:r.fingerprint,output:text(1)}};let calls=0;
 const result=await syncSavedArtAnalysis({...f,api:{collabPublishAnalysis:async()=>{calls++}}});
 assert.equal(calls,0);assert.equal(result.pending,0);assert.equal(f.disk.episodes[1].published,true);
});
test('same project sync clicks share a single writer',async()=>{
 const f=await setup(1);let calls=0;const args={...f,api:{collabPublishAnalysis:async()=>{calls++;await new Promise(r=>setTimeout(r,20));}}};
 await Promise.all([syncSavedArtAnalysis(args),syncSavedArtAnalysis(args)]);assert.equal(calls,1);
});
test('current episode unpublished look is never introduced as a prior reuse anchor',()=>{
 const context=buildExistingAssetContext([{category:'character',name:'【经理-西装】',first_episode:38,episodes:[38],description:'本集原来的脸'}],{episodeNumber:38,content:'经理出场'});
 assert.doesNotMatch(context,/本集原来的脸|【经理-西装】/);
});
