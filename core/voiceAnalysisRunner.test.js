import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureEpisodeVoices,readProjectVoices} from './voiceAnalysisRunner.js';
test('information reading fills missing speakers, reuses current data and reports invalid replies',async()=>{
 const episode={episodeNumber:1,content:'1-1 日 内\n小林：回家。'};
 let record={sourceContent:episode.content,scenes:[{id:'1-1',source:episode.content,items:[]}]},calls=0;
 const store={snapshot:()=>({episodes:{1:record}}),update:async(n,fn)=>{record=fn(record);}};
 const api={aiChat:async()=>{calls++;return JSON.stringify({scenes:[{sceneId:'1-1',speakers:[{name:'小林',ageStage:'default',quote:'回家。',evidence:'小林：回家。',kind:'dialogue',instructions:'青年男性，声线清晰自然。',language:'Chinese'}]}]});}};
 await ensureEpisodeVoices({episode,store,api,profile:{id:'test'},job:{}});
 assert.equal(record.voiceAnalysis.scenes[0].speakers[0].name,'小林');
 await ensureEpisodeVoices({episode,store,api,profile:{id:'test'},job:{}});assert.equal(calls,1);
 record={...record,voiceAnalysis:null};api.aiChat=async()=>'{"scenes":[]}';
 await assert.rejects(ensureEpisodeVoices({episode,store,api,profile:{id:'test'},job:{}}),/完整覆盖/);
});
test('one click retries malformed age evidence then continues every remaining episode, preserving successful checkpoints',async()=>{
 const episodes=Array.from({length:60},(_,i)=>({episodeNumber:i+1,content:`${i+1}-1 日 内\n小林：回家。`})),records=Object.fromEntries(episodes.map(e=>[e.episodeNumber,{sourceContent:e.content,scenes:[{id:e.episodeNumber+'-1',source:e.content,items:[]}]}])),calls=[];
 const store={snapshot:()=>({episodes:records}),update:async(n,fn)=>{records[n]=fn(records[n]);}};
 const api={aiChat:async p=>{const n=JSON.parse(p.messages.find(m=>m.role==='user').content).episodeNumber;calls.push(n);return JSON.stringify({scenes:[{sceneId:n+'-1',speakers:[{name:'小林',ageStage:n===24?'elder':'default',quote:'回家。',evidence:'小林：回家。',kind:'dialogue',language:'Chinese'}]}]});}};
 const result=await readProjectVoices({project:{episodes},store,api,profile:{id:'test'}});
 assert.equal(result.errors.length,1);assert.match(result.errors[0],/第 24 集.*年龄阶段/);assert.equal(result.done,59);assert(records[60].voiceAnalysis.prepared);assert(records[24].voiceError);assert.equal(calls.filter(n=>n===24).length,2);
 calls.length=0;await readProjectVoices({project:{episodes},store,api,profile:{id:'test'}});assert.deepEqual(calls,[24,24]);
});
test('validation repair supplies failure reason and accepts a corrected reply in the same click',async()=>{
 const episode={episodeNumber:1,content:'1-1 日 内\n小林：回家。'};let record={sourceContent:episode.content,scenes:[{id:'1-1',source:episode.content,items:[]}]},calls=0;
 const store={snapshot:()=>({episodes:{1:record}}),update:async(n,fn)=>{record=fn(record);}};
 const api={aiChat:async p=>{calls++;if(calls===2)assert.match(JSON.stringify(p.messages),/年龄阶段缺少逐字原文依据/);return JSON.stringify({scenes:[{sceneId:'1-1',speakers:[{name:'小林',ageStage:calls===1?'elder':'default',quote:'回家。',evidence:'小林：回家。',kind:'dialogue',language:'Chinese'}]}]});}};
 await ensureEpisodeVoices({episode,store,api,profile:{id:'test'}});assert.equal(calls,2);assert(record.voiceAnalysis.prepared);
});
test('cancellation does not retry or mark an episode failed',async()=>{
 const episode={episodeNumber:1,content:'小林：回家。'},job={};let record={sourceContent:episode.content,scenes:[{id:'1-1',source:episode.content,items:[]}]},calls=0;
 const store={snapshot:()=>({episodes:{1:record}}),update:async(n,fn)=>{record=fn(record);}};
 const result=await readProjectVoices({project:{episodes:[episode]},store,api:{aiChat:async()=>{calls++;job.cancelled=true;throw Error('cancelled');}},profile:{id:'test'},job});assert.equal(calls,1);assert.equal(result.errors.length,0);assert(!record.voiceError);
});
test('missing inventory reports that episode without preventing later ready episodes',async()=>{
 const episodes=[1,2].map(n=>({episodeNumber:n,content:`${n}-1 日 内\n小林：回家。`}));let record={sourceContent:episodes[1].content,scenes:[{id:'2-1',source:episodes[1].content,items:[]}]};
 const store={snapshot:()=>({episodes:{2:record}}),update:async(n,fn)=>{assert.equal(n,2);record=fn(record);}};
 const api={aiChat:async()=>JSON.stringify({scenes:[{sceneId:'2-1',speakers:[{name:'小林',ageStage:'default',quote:'回家。',evidence:'小林：回家。',kind:'dialogue',language:'Chinese'}]}]})};
 const result=await readProjectVoices({project:{episodes},store,api,profile:{id:'test'}});assert.equal(result.errors.length,1);assert.equal(result.done,1);assert(record.voiceAnalysis.prepared);
});
