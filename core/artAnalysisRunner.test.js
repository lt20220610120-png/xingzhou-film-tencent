import test from 'node:test';import assert from 'node:assert/strict';
import {runArtAnalysis,splitAnalysisText} from './artAnalysisRunner.js';
import {ART_RUNTIME_SKILL,COLLAB_ART_SKILL} from './collabArtSkill.js';
const output=n=>`### 第${n}集\n人物：\n- 【角色${n}】（首次）五官、完整服装\n场景：\n无（本段未出现）\n道具：\n无（本段未出现）`;
function fixture(count=75){let disk=null;const calls=[],published=[];const profile={id:'chosen',name:'所选接口',model:'chosen-model',endpoint:'https://chosen.example/v1',apiKey:'chosen-key'};
 const args={project:{id:'p',episodes:Array.from({length:count},(_,i)=>({title:`第${i+1}集`,content:'剧本'}))},genre:'都市',profile,job:{},load:async()=>structuredClone(disk),save:async v=>{disk=structuredClone(v);},api:{aiChat:async p=>{calls.push(p);const n=Number(p.messages.at(-1).content.match(/现在分析第(\d+)集/)[1]);return {ok:true,output:output(n)};},collabPublishAnalysis:async p=>published.push(p)}};
 return {args,calls,published,get disk(){return disk;}};
}
test('75 episodes: failure at 26 preserves first 25; resume calls only unfinished and captures selected endpoint/key/model',async()=>{
 const f=fixture();const original=f.args.api.aiChat;f.args.api.aiChat=async p=>{if(f.calls.length===25){f.calls.push(p);return {ok:false,error:'模型只返回了推理过程',partialText:''};}return original(p);};
 await assert.rejects(runArtAnalysis(f.args),/推理/);assert.equal(f.published.length,25);assert.ok(f.disk.episodes[25].published);
 f.args.api.aiChat=original;await runArtAnalysis({...f.args,job:{}});assert.equal(f.calls.length,76);assert.equal(f.published.length,75);
 for(const p of f.calls){assert.equal(p.model,'chosen-model');assert.equal(p.apiKey,'chosen-key');assert.equal(p.endpoint,'https://chosen.example/v1');assert.equal(p.profileId,'chosen');assert.ok(p.messages[0].content.length<6000);}
});
test('cloud save failure retries saved content without another paid request',async()=>{
 const f=fixture(3);f.args.api.collabPublishAnalysis=async()=>{throw new Error('offline');};const result=await runArtAnalysis(f.args);assert.equal(result.pending,3);assert.equal(f.calls.length,3);
 f.args.api.collabPublishAnalysis=async()=>{};await f.args.job.sync();assert.equal(f.calls.length,3);assert.equal(f.args.job.pending,0);
});
test('changed episode invalidates only its own checkpoint; original input is split without omission',async()=>{
 const f=fixture(2);await runArtAnalysis(f.args);f.args.project.episodes[1].content='修改剧本';await runArtAnalysis(f.args);assert.equal(f.calls.length,3);
 const text=('原文段落\n'.repeat(1600));const pieces=splitAnalysisText(text);assert.equal(pieces.join(''),text);assert.ok(pieces.every(p=>p.length<=2401));assert.ok(ART_RUNTIME_SKILL.length<COLLAB_ART_SKILL.length/3);
});
test('no successful result marked on malformed/truncated content; partial output kept for review',async()=>{
 const f=fixture(1);f.args.api.aiChat=async()=>({ok:false,error:'模型输出被截断',partialText:'部分正文'});await assert.rejects(runArtAnalysis(f.args),/截断/);assert.equal(f.disk.episodes[1].failure.partialText,'部分正文');assert.equal(f.published.length,0);
});
