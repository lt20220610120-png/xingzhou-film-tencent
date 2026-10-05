import test from 'node:test';
import assert from 'node:assert/strict';
import {createIPProject,importIPNovel,getIPProject,applyIPPlan,appendIPVersion,ipSettingsScopeKey,beginIPFirstDraft,ipFingerprint,updateIPDraft} from './ipWorkspace.js';
import {writeIPFirstDraft,parseIPDraftBatch} from './ipFirstDraft.js';
import {runIPAdaptationFlow} from './ipAdaptationFlow.js';
const body=n=>`第${n}集 原著场面\n场景 ${n}-1 内景 客厅 日\n人物：甲\n甲：原著对白。\n△甲归还失物。\n[END_EPISODE_${n}]`;
function fixture(count=3){
 let state=createIPProject({fruitProjects:[]},{name:'连续首版'}),id=state.fruitProjects[0].id;
 state=importIPNovel(state,id,{content:'第1章 归还\n甲归还失物，与失主相识。'});
 const source=getIPProject(state,id).creator.ip.source,plan={mainline:'归还相识',ending:'相识',sourceId:source.id,episodes:Array.from({length:count},(_,i)=>({chapterIds:[source.chapters[0].id],outline:`场面${i+1}`,sourceRanges:[{start:0,end:source.content.length}]}))};
 // Short writer-only fixture; adoption itself is exercised with the real 50 floor below.
 let p=getIPProject(state,id);p.creator.ip.plan=plan;p.episodes.push(...plan.episodes.map((e,i)=>({...e,id:`e${i+1}`,type:'episode',sourceId:source.id,scriptText:'',ipVersions:[]})));
 p.episodes[0].scriptText='【故事梗概】归还相识。';p.episodes[0].settingsScopeKey=ipSettingsScopeKey(source.id,plan);
 return {state,id,p,plan};
}
test('plain batch parser rejects missing end, wrong global number and foreign scene numbers',()=>{
 assert.equal(parseIPDraftBatch([body(4),body(5)].join('\n\n'),[4,5]).length,2);
 assert.throws(()=>parseIPDraftBatch(body(1).replace('[END_EPISODE_1]',''),[1]),/未完整返回/);
 assert.throws(()=>parseIPDraftBatch(body(2),[1]),/标记/);
 assert.throws(()=>parseIPDraftBatch(body(1).replace('场景 1-1','场景 2-1'),[1]),/场号/);
});

test('all end markers returned together after the three bodies split correctly without another model request',async()=>{
 const f=fixture(),output=[1,2,3].map(n=>body(n).replace(`[END_EPISODE_${n}]`,'')).join('\n')+'\n[END_EPISODE_1]\n[END_EPISODE_2]\n[END_EPISODE_3]';
 assert.equal(parseIPDraftBatch(output,[1,2,3]).length,3);
 assert.equal(parseIPDraftBatch(output.replace('[END_EPISODE_1]\n[END_EPISODE_2]\n[END_EPISODE_3]','[END_EPISODE_3][END_EPISODE_1][END_EPISODE_2]'),[1,2,3]).length,3);
 assert.throws(()=>parseIPDraftBatch(output+'\n又续写了剧情',[1,2,3]),/未完整返回/);
 assert.throws(()=>parseIPDraftBatch(output.replace('END_EPISODE_2','END_EPISODE_1'),[1,2,3]),/未完整返回/);
 const result=await writeIPFirstDraft({project:f.p,profile:{model:'mock'},invoke:async()=>output});assert.equal(result.completed,3);
});
test('three episodes use one generation request, saving one honest pending-review version each',async()=>{
 const f=fixture(),calls=[],versions=[];
 const result=await writeIPFirstDraft({project:f.p,profile:{model:'mock'},invoke:async(...args)=>{calls.push(args);return [1,2,3].map(body).join('\n\n');},onDraft:async d=>{if(d.type==='version'){versions.push(d);assert.equal(ipFingerprint(getIPProject(f.state,f.id),d.episodeId),d.fingerprint);f.state=appendIPVersion(f.state,f.id,d.episodeId,d,{activate:true,invalidateLater:false});}}});
 assert.equal(calls.length,1);assert.equal(result.completed,3);assert.equal(result.generation.reviewStatus,'pending');
 assert.ok(versions.every(v=>v.reviewStatus==='pending'&&!v.comparison&&!v.content.includes('END_EPISODE')));
 assert.ok(getIPProject(f.state,f.id).episodes.slice(1).every(e=>e.scriptText&&e.ipVersions.length===1&&!e.finalConfirmed));
});
test('stream interruption automatically continues the same batch without rewriting completed beginning',async()=>{
 const f=fixture(),all=[1,2,3].map(body).join('\n\n'),cut=all.indexOf('第2集')+12,calls=[],checkpoints=[];
 const result=await writeIPFirstDraft({project:f.p,profile:{model:'mock'},invoke:async messages=>{calls.push(messages);if(calls.length===1)throw Object.assign(Error('断流'),{code:'STREAM_INCOMPLETE',partialText:all.slice(0,cut)});assert.equal(messages.at(-2).content,all.slice(0,cut));return all.slice(cut);},onDraft:d=>{if(d.type==='first-draft-checkpoint')checkpoints.push(d);}});
 assert.equal(result.completed,3);assert.equal(calls.length,2);assert.ok(checkpoints.some(d=>!d.complete));assert.equal(checkpoints.at(-1).complete,true);
});
test('cancel after saving the first episode reuses the remaining paid batch on resume',async()=>{
 const f=fixture(),diagnostics=[];let cancelled=false,calls=0;
 const save=d=>{if(d.type==='version'){f.state=appendIPVersion(f.state,f.id,d.episodeId,d,{activate:true,invalidateLater:false});cancelled=true;}else diagnostics.push(d);};
 await assert.rejects(writeIPFirstDraft({project:f.p,profile:{model:'mock'},invoke:async()=>{calls++;return [1,2,3].map(body).join('\n\n');},onDraft:save,isCancelled:()=>cancelled}),/已停止/);
 const p=getIPProject(f.state,f.id);p.creator.records.push({diagnostics});
 const result=await writeIPFirstDraft({project:p,profile:{model:'mock'},invoke:async()=>{throw Error('must reuse');},onDraft:d=>{if(d.type==='version')f.state=appendIPVersion(f.state,f.id,d.episodeId,d,{activate:true,invalidateLater:false});}});
 assert.equal(calls,1);assert.equal(result.completed,2);assert.ok(getIPProject(f.state,f.id).episodes.slice(1).every(e=>e.scriptText));
});
test('first flow automatically adopts, fills settings then all text; later plan is only a candidate until selected',async()=>{
 const f=fixture(50);delete f.p.creator.ip.plan;f.p.episodes=f.p.episodes.slice(0,1);f.p.episodes[0].scriptText='';
 const events=[],runTask=async input=>{events.push(input.task);if(input.task==='plan')return {type:'plan',plan:f.plan};if(input.task==='settings'){f.p.episodes[0].scriptText='【故事梗概】归还相识。';f.p.episodes[0].stale=false;f.p.episodes[0].settingsScopeKey=ipSettingsScopeKey(f.plan.sourceId,f.plan);return {};}return {type:'firstDraft',completed:50};};
 const getProject=()=>f.p,adoptPlan=(plan,options)=>{events.push('adopt');f.state=beginIPFirstDraft(f.state,f.id,plan,options);f.p=getIPProject(f.state,f.id);};
 await runIPAdaptationFlow({getProject,runTask,adoptPlan});assert.deepEqual(events,['plan','adopt','settings','firstDraft']);
 events.length=0;const candidate=await runIPAdaptationFlow({getProject,runTask,adoptPlan});assert.equal(candidate.type,'planCandidate');assert.deepEqual(events,['plan']);
 events.length=0;await runIPAdaptationFlow({getProject,runTask,adoptPlan,plan:f.plan});assert.equal(events[0],'adopt');assert.equal(events.at(-1),'firstDraft');
});
test('adopting second edition replaces every body even if mapping is unchanged and preserves old history',()=>{
 const f=fixture(50);f.state=applyIPPlan(f.state,f.id,f.plan);
 for(const e of getIPProject(f.state,f.id).episodes.filter(e=>e.type==='episode'))f.state=updateIPDraft(f.state,f.id,e.id,`原稿 ${e.id}`);
 f.state=beginIPFirstDraft(f.state,f.id,f.plan,{replace:true});
 assert.ok(getIPProject(f.state,f.id).episodes.filter(e=>e.type==='episode').every(e=>!e.scriptText&&!e.stale&&e.ipVersions.some(v=>v.content===`原稿 ${e.id}`)));
});
