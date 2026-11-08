import test from 'node:test';
import assert from 'node:assert/strict';
import * as v from './characterVoices.js';
import {newArtReview,decodeArtReviewOutput,applyArtReviewCandidate} from './artReview.js';
import {entryVoiceCards,applyVoiceBinding,compileVoiceBinding} from './voiceBinding.js';
const ep=n=>({id:'e'+n,episodeNumber:n,title:`第${n}集`,content:`${n}-1 日 内\n小林：我回来了。\n小林（心声）：别怕。`});
const scene=n=>({id:n+'-1',source:ep(n).content,items:[{category:'character',name:'【小林-日常装】',description:'青年男子'}]});
test('episode voice inventory includes only actual local speakers, retains minor speakers and full edit associations',()=>{
 const episodes=[1,2,10].map(n=>({id:'ep'+n,episodeNumber:n,content:`${n}-1 房间 日 内\n${n===1?'小林：回家。\n路人站着。':n===2?'小林：再见。\n路人：你好。':'外客：到了。'}`}));
 const ledger={episodes:{},voiceProfiles:{}};
 for(const e of episodes){const n=e.episodeNumber,s={id:n+'-1',source:e.content,items:[{category:'character',name:'【小林】'},{category:'character',name:'【路人】'}]},names=n===1?['小林']:n===2?['小林','路人']:['外客'];
  const quotes=n===1?['回家。']:n===2?['再见。','你好。']:['到了。'];
  ledger.episodes[n]={sourceContent:e.content,scenes:[s],voiceAnalysis:v.validateEpisodeVoices(e,[s],{scenes:[{sceneId:s.id,speakers:names.map((name,i)=>({name,quote:quotes[i],language:'Chinese',kind:'dialogue',evidence:name+'：'+quotes[i]}))}]})};
 }
 const project={id:'voices',episodes},one=v.episodeVoiceRoster(project,ledger,1),two=v.episodeVoiceRoster(project,ledger,2);
 assert.deepEqual(one.map(c=>c.characterName),['小林']);assert.deepEqual(one[0].speakingSceneIds,['1-1']);assert.deepEqual(one[0].allSpeakingSceneIds,['1-1','2-1']);assert.equal(one[0].major,true,'appearance counts never replace speaking-scene checks');
 assert.deepEqual(new Set(two.map(c=>c.characterName)),new Set(['小林','路人']));assert.equal(v.episodeVoiceRoster(project,ledger,10).some(c=>c.characterName==='外客'),true);
 for(const c of v.projectVoiceRoster(project,ledger).characters)ledger.voiceProfiles[c.key]={confirmed:{id:c.key,url:'https://fixture.test/'+encodeURIComponent(c.key)+'.wav'}};
 const snapshot={voiceCards:v.projectVoiceCards(project,ledger)},entry={id:'p',sceneId:'1-1',prompt:'小林：回家。'};
 assert.deepEqual(entryVoiceCards(snapshot,entry).map(c=>c.characterName),['小林']);
 const card=entryVoiceCards(snapshot,entry)[0],decision=applyVoiceBinding(snapshot,entry,{},[{voiceUid:card.uid,evidence:entry.prompt,kind:'dialogue'}]);
 const output=compileVoiceBinding(snapshot,entry,decision,{prompt:entry.prompt,references:[]});assert.equal(output.references.length,1);assert.equal(output.references[0].characterName,'小林');
 const outsider=snapshot.voiceCards.find(c=>c.characterName==='外客');assert.throws(()=>applyVoiceBinding(snapshot,entry,{},[{voiceUid:outsider.uid,evidence:entry.prompt,kind:'dialogue'}]),/不属于本场/);
});
test('voice extraction requires scene evidence and only normal dialogue',()=>{
 const a=v.validateEpisodeVoices(ep(1),[scene(1)],{scenes:[{sceneId:'1-1',speakers:[{name:'小林',ageStage:'default',language:'Chinese',quote:'我回来了。',evidence:'小林：我回来了。',kind:'dialogue'},{name:'小林',quote:'别怕。',evidence:'小林（心声）：别怕。',kind:'thought'}]}]});
 assert.equal(a.scenes[0].speakers.length,1);
 assert.throws(()=>v.validateEpisodeVoices(ep(1),[scene(1)],{scenes:[{sceneId:'1-1',speakers:[{name:'小林',quote:'编造',evidence:'编造',kind:'dialogue'}]}]}),/原文/);
 assert.throws(()=>v.validateEpisodeVoices(ep(1),[scene(1)],{scenes:[{sceneId:'2-1',speakers:[]}]}),/场景/);
});
test('major voices count unique appearance episodes and invalidate changed sources',()=>{
 const project={episodes:[ep(1),ep(2),ep(3)]},ledger={episodes:{}};
 for(let n=1;n<=3;n++)ledger.episodes[n]={sourceContent:ep(n).content,scenes:[scene(n),{...scene(n),items:[...scene(n).items,{category:'character',name:'【小林-正装】'}]}],voiceAnalysis:v.validateEpisodeVoices(ep(n),[scene(n)],{scenes:[{sceneId:n+'-1',speakers:[{name:'小林',ageStage:'default',language:'Chinese',quote:'我回来了。',evidence:'小林：我回来了。',kind:'dialogue'}]}]})};
 const r=v.projectVoiceRoster(project,ledger);assert.equal(r.complete,true);assert.equal(r.characters.length,1);assert.deepEqual(r.characters[0].episodes,[1,2,3]);assert.equal(r.characters[0].major,true);assert.equal(r.characters[0].quote,'我回来了。');
 project.episodes[2]={...ep(3),content:'改变正文'};const changed=v.projectVoiceRoster(project,ledger);assert.equal(changed.complete,false);assert.equal(changed.characters[0].major,false);
});
test('group or ensemble cards are excluded while speaking creatures remain eligible',()=>{
 assert.equal(v.isVoiceEligibleCharacter({name:'围观者群像',description:'多人'}),false);
 assert.equal(v.isVoiceEligibleCharacter({name:'助手群像'}),false);
 assert.equal(v.isVoiceEligibleCharacter({name:'旺财',description:'会说话的犬'}),true);
 const project={episodes:[1,2,3].map(n=>({...ep(n),content:`${n}-1 日 内\n旺财：我回来了。`}))},ledger={episodes:{}};
 for(let n=1;n<=3;n++){
  const episode={...ep(n),content:`${n}-1 日 内\n旺财：我回来了。`};
  const s={...scene(n),source:episode.content,items:[...scene(n).items,{category:'character',name:'围观者群像',description:'观众群体'},{category:'character',name:'旺财',description:'会说话的犬'}]};
  ledger.episodes[n]={sourceContent:episode.content,scenes:[s],voiceAnalysis:v.validateEpisodeVoices(episode,[s],{scenes:[{sceneId:n+'-1',appearances:[{name:'旺财',ageStage:'default',assetName:'旺财'}],speakers:[{name:'旺财',quote:'我回来了。',evidence:'旺财：我回来了。',kind:'dialogue',language:'Chinese'}]}]})};
 }
 const roster=v.projectVoiceRoster(project,ledger).characters;
 assert.equal(roster.some(c=>c.characterName==='围观者群像'),false);
 assert.equal(roster.some(c=>c.characterName==='旺财'),true);
});
test('new candidate never replaces confirmed timbre until explicit confirmation',()=>{
 const a=v.setVoiceCandidate({}, {id:'a',filePath:'D:/a.wav'}, {profileId:'q',instructions:'温暖'});
 const confirmed=v.confirmVoiceCandidate(a,'a');const next=v.setVoiceCandidate(confirmed,{id:'b',filePath:'D:/b.wav'},{});
 assert.equal(next.confirmed.id,'a');assert.equal(next.candidates.length,2);assert.equal(v.confirmVoiceCandidate(next,'b').confirmed.id,'b');assert.throws(()=>v.confirmVoiceCandidate(next,'missing'),/样音/);
});
test('information reading saves dialogue alongside art without treating speakers as art assets',()=>{
 const raw='### 第1集\n人物：\n- 【小林-日常装】青年男子\n场景：\n- 无\n道具：\n- 无\n【逐场资产对应表】\n'+JSON.stringify({scenes:[{sceneId:'1-1',assets:[{category:'character',name:'【小林-日常装】'}],speakers:[{name:'小林',ageStage:'default',language:'Chinese',quote:'我回来了。',evidence:'小林：我回来了。',kind:'dialogue'}]}]});
 const r=applyArtReviewCandidate(newArtReview(ep(1)),ep(1),decodeArtReviewOutput(raw,1));assert.equal(r.voiceAnalysis.scenes[0].speakers[0].name,'小林');assert.equal(r.roster.length,1);
});
