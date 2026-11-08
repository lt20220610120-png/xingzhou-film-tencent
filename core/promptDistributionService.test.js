import test from 'node:test';
import assert from 'node:assert/strict';
import {createPromptDistributionService} from './promptDistributionService.js';
import {fixture} from './promptDistribution.fixtures.js';
import {validateEpisodeVoices,voiceIdentity} from './characterVoices.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
test('opening a service and an empty scene never triggers model calls or produces heuristic missing cards',async()=>{
 const f=fixture(),service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});
 await new Promise(r=>setTimeout(r,5));assert.equal(f.calls,0);assert.equal(f.saved,null);
 f.ledger.episodes[1].scenes[0].items=[];f.ledger.episodes[1].scenes[0].mappingReady=false;
 await assert.rejects(service.run('p1',{profile:{id:'m'}}),/场景清单/);assert.equal(f.calls,0);assert.equal(f.saved,null);
});
test('different prompts run concurrently, duplicate prompt requests reuse one task, and both results survive',async()=>{
 const f=fixture(),gate=deferred(),entered=deferred();let active=0,max=0,count=0;
 f.api.aiChat=async p=>{active++;max=Math.max(max,active);if(++count===2)entered.resolve();await gate.promise;active--;return f.output(p.messages)};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u',concurrency:2});
 const first=service.run('p1',{profile:{id:'m'}}),duplicate=service.run('p1',{profile:{id:'m'}}),second=service.run('p2',{profile:{id:'m'}});
 await entered.promise;assert.equal(service.isBusy('p1'),true);assert.equal(service.isBusy('p3'),false);assert.equal(max,2);gate.resolve();
 await Promise.all([first,duplicate,second]);assert.equal(count,2);assert.equal(Object.keys(f.saved.decisions).length,2);assert.equal(f.saved.decisions.p1.origin,'scene-inventory-ai');assert.equal(f.saved.decisions.p2.confirmed,true);
});
test('scene distribution uses analysis mode and a compact output budget',async()=>{
 const f=fixture();let payload;f.api.aiChat=async p=>{payload=p;return f.output(p.messages)};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});await service.run('p1',{profile:{id:'m'}});
 assert.equal(payload.analysisMode,true);assert(payload.maxOutputTokens>=2048&&payload.maxOutputTokens<=8192);
 const input=JSON.parse(payload.messages[1].content);assert.equal('prompt' in input,false);assert.equal(input.foundation.character.length,1);
});
test('late reply does not overwrite a human edit of the same prompt, independent edits remain mergeable',async()=>{
 const f=fixture(),gate=deferred(),entered=deferred();f.api.aiChat=async p=>{entered.resolve();await gate.promise;return f.output(p.messages)};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});
 const pending=service.run('p1',{profile:{id:'m'}});await entered.promise;
 const next=structuredClone(f.saved);next.decisions.p1={signature:'human',needs:[],confirmed:false,origin:'manual'};next.versions[next.selectedVersionId].decisions.p1=next.decisions.p1;next.revision++;f.saved=next;gate.resolve();
 await assert.rejects(pending,/人工|关联.*修改/);assert.equal(f.saved.decisions.p1.signature,'human');
});
test('received invalid model answers stop after three attempts and do not save guessed relationships',async()=>{
 const f=fixture();f.api.aiChat=async()=>{f.api.count=(f.api.count||0)+1;return '{}'};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});
 await assert.rejects(service.run('p1',{profile:{id:'m'}}),/三次/);assert.equal(f.api.count,3);assert.equal(f.saved.decisions.p1,undefined);
 assert.equal(Object.values(f.saved.sceneDistributionAttempts)[0].status,'failed');
});
test('manual redispatch has a reserved lane while automatic prompts occupy all slots',async()=>{
 const f=fixture(),hold=deferred(),entered=deferred();let automatic=0,manual=false;
 f.api.aiChat=async p=>{const data=JSON.parse(p.messages[1].content);if(data.label==='1-1-3')manual=true;else{if(++automatic===2)entered.resolve();await hold.promise;}return f.output(p.messages)};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u',concurrency:2});
 const first=service.run('p1',{profile:{id:'m'}}),second=service.run('p2',{profile:{id:'m'}});await entered.promise;
 await service.run('p3',{profile:{id:'m'},manual:true});assert.equal(manual,true);hold.resolve();await Promise.all([first,second]);
});
test('changed prompt rejects a late model answer and a foreign-window CAS conflict can merge on retry',async()=>{
 const f=fixture(),hold=deferred(),entered=deferred();f.api.aiChat=async p=>{entered.resolve();await hold.promise;return f.output(p.messages)};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'}),pending=service.run('p1',{profile:{id:'m'}});
 await entered.promise;f.project.episodes[0].prompts[0].content+='\n正文已改变';hold.resolve();await assert.rejects(pending,/来源|变化/);assert.equal(f.saved.decisions.p1,undefined);
 const original=f.api.promptArtSave;let once=true;f.api.promptArtSave=async p=>{if(once){once=false;f.saved={...f.saved,revision:f.saved.revision+1};throw Error('关联记录已被另一窗口更新')}return original(p)};
 await service.run('p2',{profile:{id:'m'}});assert.equal(f.saved.decisions.p2.confirmed,true);
});
test('stopping cancels queued automatic work; deliberate resume is required to call a model again',async()=>{
 const f=fixture(),hold=deferred(),entered=deferred();let calls=0;f.api.aiChat=async p=>{calls++;entered.resolve();await hold.promise;return f.output(p.messages)};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u',concurrency:1});
 const first=service.run('p1',{profile:{id:'m'}}).catch(e=>e),second=service.run('p2',{profile:{id:'m'}}).catch(e=>e);await entered.promise;await service.stop();hold.resolve();await Promise.all([first,second]);assert.equal(calls,1);
 await assert.rejects(service.run('p3',{profile:{id:'m'}}),/暂停/);service.resume();await service.run('p3',{profile:{id:'m'}});assert.equal(calls,2);
});
test('stop during the final queued save read prevents applying the late result',async()=>{
 const f=fixture(),hold=deferred(),entered=deferred(),load=f.api.promptArtLoad;let reads=0;
 f.api.promptArtLoad=async()=>{if(++reads===3){entered.resolve();await hold.promise;}return load()};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'}),pending=service.run('p1',{profile:{id:'m'}}).catch(e=>e);
 await entered.promise;await service.stop();hold.resolve();const result=await pending;assert(result instanceof Error);assert.equal(f.saved.decisions.p1,undefined);
});
test('254 queued prompts keep only five prepared claims and let the first retry save before the backlog',async()=>{
 const f=fixture(),template=f.project.episodes[0].prompts[0],hold=deferred(),firstSaved=deferred();let calls=0,firstCalls=0;
 f.project.episodes[0].prompts=Array.from({length:254},(_,i)=>({...template,id:'p'+(i+1),label:'1-1-'+(i+1)}));
 const save=f.api.promptArtSave;f.api.promptArtSave=async payload=>{const result=await save(payload);if(result.decisions.p1?.confirmed)firstSaved.resolve();return result;};
 f.api.aiChat=async payload=>{calls++;const data=JSON.parse(payload.messages[1].content);if(data.label==='1-1-1'){if(++firstCalls===1)return '{}';return JSON.stringify({assignments:data.cards.map(c=>({cardUid:c.uid,visibility:'visible',evidenceId:data.evidenceSpans.find(s=>s.category===c.category).id,reason:'基础设定明确出现'})),missing:[]});}await hold.promise;return f.output(payload.messages);};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'}),jobs=f.project.episodes[0].prompts.map(p=>service.run(p.id,{profile:{id:'m'}}).catch(e=>e));
 await firstSaved.promise;assert.equal(firstCalls,2);assert(calls<=7,'a retry must not go behind all 254 entries');assert(Object.keys(f.saved.sceneDistributionAttempts).length<=5,'queued entries must not write hundreds of running claims');assert(service.status().queued>=248);assert.equal(f.saved.decisions.p1.confirmed,true);
 await service.stop();hold.resolve();await Promise.all(jobs);
});
test('adopting a voice later invalidates the visual-only baseline and adds the real speaker association',async()=>{
 const f=fixture(),ep=f.project.episodes[0],record=f.ledger.episodes[1],quote='张三：水温正好。';ep.content+='\n'+quote;ep.prompts[0].content+='\n【连续台词】\nD01｜张三｜现场对白｜分镜01：『水温正好。』';record.sourceContent=ep.content;record.scenes[0].source=ep.content;
 record.voiceAnalysis=validateEpisodeVoices(ep,record.scenes,{scenes:[{sceneId:'1-1',speakers:[{name:'张三',ageStage:'default',language:'Chinese',quote:'水温正好。',evidence:quote,kind:'dialogue'}]}]});
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});await service.run('p1',{profile:{id:'m'}});assert.equal(f.saved.decisions.p1.speakers.length,1);
 f.ledger.voiceProfiles={[voiceIdentity('张三','default')]:{confirmed:{id:'adopted',filePath:'D:/fixture.wav'}}};let payload;
 f.api.aiChat=async p=>{payload=JSON.parse(p.messages[1].content);return JSON.stringify({...JSON.parse(f.output(p.messages)),speakers:[{voiceUid:payload.voiceCards[0].uid,evidence:'D01｜张三｜现场对白｜分镜01：『水温正好。』',kind:'dialogue'}]});};
 await service.run('p1',{profile:{id:'m'}});assert.equal(payload.voiceCards.length,1);assert.equal(f.saved.decisions.p1.confirmed,true);assert.equal(f.saved.decisions.p1.speakers.length,1);
});
