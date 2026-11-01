import test from 'node:test';import assert from 'node:assert/strict';
import {projectVoiceRoster,projectVoiceCards,validateEpisodeVoices} from './characterVoices.js';
import {voiceGenerationSettings,voiceGenerationRequest,runVoiceBatch,completeVoiceCard} from './voiceReview.js';
test('blank optional voice description still sends identity and evidence to TTS without speaking it',()=>{
 const c={name:'小林',characterName:'小林',description:'32岁司机，沉稳朴素',ageStage:'default',quote:'回家。',evidence:'小林：回家。'};
 const r=voiceGenerationRequest(c,{draft:{instructions:''}},{model:'Qwen-VoiceDesign'});assert.equal(r.input,'回家。');assert.match(r.instructions,/32岁司机/);assert.match(r.instructions,/小林：回家。/);assert.doesNotMatch(r.instructions,/声音设计与表演/);
});
test('manual completion reads character identity and fills authentic dialogue, never optional description',async()=>{
 const ep={episodeNumber:1,content:'1-1 日 内\n小林：回家。'},c={key:'m',name:'小林',characterName:'小林',description:'司机',quote:'',sceneIds:['1-1']};let profile={manual:{name:'小林'},draft:{instructions:''}};
 const store={snapshot:()=>({episodes:{1:{sourceContent:ep.content,scenes:[{id:'1-1',source:ep.content}]}},voiceProfiles:{m:profile}}),setVoiceProfile:async(k,fn)=>{profile=fn(profile);}};
 const api={aiChat:async p=>{assert.match(p.messages[1].content,/司机/);return JSON.stringify({quote:'回家。',evidence:'小林：回家。',instructions:'不该填入',language:'Chinese'});}};
 await completeVoiceCard({character:c,store,api,model:{id:'q'},project:{episodes:[ep]}});assert.equal(profile.draft.quote,'回家。');assert.equal(profile.draft.instructions,'');
});
test('age stages use separate cards and only the matching scene receives its sample',()=>{
 const episodes=[1,2,3].map(n=>({episodeNumber:n,content:`${n}-1 日 内\n小林（幼年）：回家。\n${n}-2 日 内\n小林：回来。`}));const ledger={episodes:{},voiceProfiles:{小林:{confirmed:{id:'a',filePath:'a.wav'}},'小林::child':{confirmed:{id:'b',filePath:'b.wav'}}}};
 for(const e of episodes){const scenes=[1,2].map(s=>({id:`${e.episodeNumber}-${s}`,source:e.content.split(`${e.episodeNumber}-2`)[s===1?0:1],items:[{category:'character',name:'【小林-衣服】'}]}));ledger.episodes[e.episodeNumber]={sourceContent:e.content,scenes,voiceAnalysis:{sourceContent:e.content,scenes:scenes.map((s,i)=>({sceneId:s.id,appearances:[{name:'小林',ageStage:i?'default':'child'}],speakers:[{key:i?'小林':'小林::child',name:'小林',ageStage:i?'default':'child',quote:i?'回来。':'回家。',instructions:'自然清晰',language:'Chinese'}]}))}};}
 const roster=projectVoiceRoster({episodes},ledger);assert.equal(roster.characters.length,2);assert(roster.characters.every(c=>c.major));
 const cards=projectVoiceCards({id:'p',episodes},ledger);assert.deepEqual(cards.find(c=>c.key==='小林::child').sceneIds,['1-1','2-1','3-1']);assert.deepEqual(cards.find(c=>c.key==='小林').sceneIds,['1-2','2-2','3-2']);
});
test('manual cards persist scene scope and generation reads completed defaults without overwriting edits',()=>{
 const project={episodes:[{episodeNumber:1,content:'1-1 日 内\n甲：好。'}]},ledger={episodes:{},voiceProfiles:{manual1:{manual:{name:'甲音色',characterName:'甲',description:'青年',sceneIds:['1-1'],quote:'好。'},draft:{instructions:'用户声线',language:'Chinese'}}}};
 const c=projectVoiceRoster(project,ledger).characters[0];assert.equal(c.manual,true);assert.equal(c.major,true);assert.deepEqual(c.speakingSceneIds,['1-1']);assert.equal(voiceGenerationSettings(c,ledger.voiceProfiles.manual1,{model:'VoiceDesign'}).instructions,'用户声线');
});
test('batch skips existing samples and confirmation, continues individual failures',async()=>{
 const profiles={a:{candidates:[{id:'old'}]},b:{},c:{}},calls=[];
 const result=await runVoiceBatch({characters:['a','b','c'].map(key=>({key,name:key})),getProfile:k=>profiles[k],mode:'generate',job:{},generate:async c=>{calls.push(c.key);if(c.key==='b')throw Error('失败');}});
 assert.deepEqual(calls,['b','c']);assert.equal(result.errors.length,1);assert.equal(result.done,1);
});

test('voice batch overlaps up to requested concurrency, preserves all outcomes and chooses first sample',async()=>{
 let active=0,peak=0;const adopted=[];
 const result=await runVoiceBatch({characters:Array.from({length:6},(_,i)=>({key:String(i),name:'人物'+i})),getProfile:()=>({}),mode:'generate',concurrency:3,generate:async c=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,8));active--;if(c.key==='1')throw Error('one failure');}});
 assert.equal(peak,3);assert.equal(result.done,5);assert.equal(result.errors.length,1);
 await runVoiceBatch({characters:[{key:'a'}],getProfile:()=>({candidates:[{id:'first'},{id:'last'}]}),mode:'adopt',adopt:async(c,id)=>adopted.push(id)});assert.deepEqual(adopted,['first']);
});

test('cancelled concurrent batch does not dispatch remaining cards',async()=>{
 const job={},calls=[];await runVoiceBatch({characters:[1,2,3,4,5].map(key=>({key,name:String(key)})),getProfile:()=>({}),mode:'generate',concurrency:2,job,generate:async c=>{calls.push(c.key);job.cancelled=true;}});assert(calls.length<=2);assert(!calls.includes(3));
});
test('empty saved draft cannot hide an already read genuine quote; nonempty manual quote still wins',()=>{
 const c={name:'小林',quote:'回家。',language:'Chinese'};
 assert.equal(voiceGenerationSettings(c,{draft:{quote:''}}).quote,'回家。');
 assert.equal(voiceGenerationSettings(c,{draft:{quote:'  '}}).quote,'回家。');
 assert.equal(voiceGenerationSettings(c,{draft:{quote:'用户填写'}}).quote,'用户填写');
});
test('existing exact normal dialogue evidence fills the quote without calling a model',async()=>{
 const evidence='李大川（焦急）： “别在这儿趴窝啊！”',content='1-1 日 外\n'+evidence,c={key:'李大川',name:'李大川',characterName:'李大川',quote:'',evidence,sceneIds:['1-1'],speakingSceneIds:['1-1']};let profile={draft:{quote:'',instructions:'用户特殊音色'}};
 const store={snapshot:()=>({episodes:{1:{sourceContent:content,scenes:[{id:'1-1',source:content}]}},voiceProfiles:{李大川:profile}}),setVoiceProfile:async(k,fn)=>{profile=fn(profile);}};
 await completeVoiceCard({character:c,store,api:{aiChat:()=>{throw Error('已有依据不应调用模型');}},project:{episodes:[{episodeNumber:1,content}]}});
 assert.equal(profile.draft.quote,'别在这儿趴窝啊！');assert.equal(profile.draft.instructions,'用户特殊音色');
});
test('evidence extraction refuses another speaker, stale sources and offscreen speech',async()=>{
 for(const evidence of ['周凯： “别走！”','李大川（心声）： “别走！”','李大川（VO）： “别走！”','李大川（电话画外声）： “别走！”','李大川（V.O.）： “别走！”','李大川（O.S.）： “别走！”']){
  const content='1-1 日 外\n'+evidence,c={key:'李大川',name:'李大川',characterName:'李大川',quote:'',evidence,sceneIds:['1-1']};let profile={draft:{quote:''}};
  const store={snapshot:()=>({episodes:{1:{sourceContent:content,scenes:[{id:'1-1',source:content}]}},voiceProfiles:{李大川:profile}}),setVoiceProfile:async(k,fn)=>{profile=fn(profile);}};
  await assert.rejects(completeVoiceCard({character:c,store,api:{},project:{episodes:[{episodeNumber:1,content}]}}),/请选择信息补全模型/);assert.equal(profile.draft.quote,'');
 }
});
