import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureEpisodeVoices} from './voiceAnalysisRunner.js';
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
