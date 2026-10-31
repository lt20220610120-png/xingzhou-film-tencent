import test from 'node:test';
import assert from 'node:assert/strict';
import * as v from './characterVoices.js';
import {newArtReview,decodeArtReviewOutput,applyArtReviewCandidate} from './artReview.js';
const ep=n=>({id:'e'+n,episodeNumber:n,title:`第${n}集`,content:`${n}-1 日 内\n小林：我回来了。\n小林（心声）：别怕。`});
const scene=n=>({id:n+'-1',source:ep(n).content,items:[{category:'character',name:'【小林-日常装】',description:'青年男子'}]});
test('voice extraction requires scene evidence and only normal dialogue',()=>{
 const a=v.validateEpisodeVoices(ep(1),[scene(1)],{scenes:[{sceneId:'1-1',speakers:[{name:'小林',quote:'我回来了。',evidence:'小林：我回来了。',kind:'dialogue'},{name:'小林',quote:'别怕。',evidence:'小林（心声）：别怕。',kind:'thought'}]}]});
 assert.equal(a.scenes[0].speakers.length,1);
 assert.throws(()=>v.validateEpisodeVoices(ep(1),[scene(1)],{scenes:[{sceneId:'1-1',speakers:[{name:'小林',quote:'编造',evidence:'编造',kind:'dialogue'}]}]}),/原文/);
 assert.throws(()=>v.validateEpisodeVoices(ep(1),[scene(1)],{scenes:[{sceneId:'2-1',speakers:[]}]}),/场景/);
});
test('major voices count unique appearance episodes and invalidate changed sources',()=>{
 const project={episodes:[ep(1),ep(2),ep(3)]},ledger={episodes:{}};
 for(let n=1;n<=3;n++)ledger.episodes[n]={sourceContent:ep(n).content,scenes:[scene(n),{...scene(n),items:[...scene(n).items,{category:'character',name:'【小林-正装】'}]}],voiceAnalysis:v.validateEpisodeVoices(ep(n),[scene(n)],{scenes:[{sceneId:n+'-1',speakers:[{name:'小林',quote:'我回来了。',evidence:'小林：我回来了。',kind:'dialogue'}]}]})};
 const r=v.projectVoiceRoster(project,ledger);assert.equal(r.complete,true);assert.equal(r.characters.length,1);assert.deepEqual(r.characters[0].episodes,[1,2,3]);assert.equal(r.characters[0].major,true);assert.equal(r.characters[0].quote,'我回来了。');
 project.episodes[2]={...ep(3),content:'改变正文'};const changed=v.projectVoiceRoster(project,ledger);assert.equal(changed.complete,false);assert.equal(changed.characters[0].major,false);
});
test('new candidate never replaces confirmed timbre until explicit confirmation',()=>{
 const a=v.setVoiceCandidate({}, {id:'a',filePath:'D:/a.wav'}, {profileId:'q',instructions:'温暖'});
 const confirmed=v.confirmVoiceCandidate(a,'a');const next=v.setVoiceCandidate(confirmed,{id:'b',filePath:'D:/b.wav'},{});
 assert.equal(next.confirmed.id,'a');assert.equal(next.candidates.length,2);assert.equal(v.confirmVoiceCandidate(next,'b').confirmed.id,'b');assert.throws(()=>v.confirmVoiceCandidate(next,'missing'),/样音/);
});
test('information reading saves dialogue alongside art without treating speakers as art assets',()=>{
 const raw='### 第1集\n人物：\n- 【小林-日常装】青年男子\n场景：\n- 无\n道具：\n- 无\n【逐场资产对应表】\n'+JSON.stringify({scenes:[{sceneId:'1-1',assets:[{category:'character',name:'【小林-日常装】'}],speakers:[{name:'小林',quote:'我回来了。',evidence:'小林：我回来了。',kind:'dialogue'}]}]});
 const r=applyArtReviewCandidate(newArtReview(ep(1)),ep(1),decodeArtReviewOutput(raw,1));assert.equal(r.voiceAnalysis.scenes[0].speakers[0].name,'小林');assert.equal(r.roster.length,1);
});
