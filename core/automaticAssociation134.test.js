import test from 'node:test';
import assert from 'node:assert/strict';
import {applySceneDistribution} from './scenePromptDistribution.js';
import {currentEntryBinding,bindingProblems} from './promptArtBinding.js';
import {createPromptDistributionService} from './promptDistributionService.js';

import {example134,prompt} from './automatic134.fixtures.js';
import {automaticSceneAssociation} from './automaticArtAssociation.js';
test('duplicate speaker rows from several D lines cannot discard valid visual assignments',()=>{
 const f=example134(),{snapshot}=f.snapshot(),entry=snapshot.entries[0],seed=currentEntryBinding(snapshot,entry),one=snapshot.voiceCards.find(c=>c.characterName==='时江晚'),line=prompt.split('\n').find(l=>l.startsWith('D01'));
 const d=applySceneDistribution(snapshot,entry,seed,{assignments:[],missing:[],speakers:[{voiceUid:one.uid,evidence:line,kind:'dialogue'},{voiceUid:one.uid,evidence:line,kind:'dialogue'},{voiceUid:'foreign-old-edition',evidence:line,kind:'dialogue'}]});
 assert.equal(d.speakers.length,2);assert.equal(new Set(d.speakers.map(s=>s.voiceUid)).size,2);
});
test('user example automatically persists exactly 2 people, 1 hall, no prop and 2 pending voices without a profile or AI',async()=>{
 const f=example134(),service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});
 await service.autoAssociate();const state=await service.read(),d=state.decisions.example;
 assert.equal(f.calls,0);assert.equal(d.confirmed,true);assert.deepEqual(bindingProblems(state.snapshot,state.snapshot.entries[0],d),[]);
 assert.deepEqual(d.needs.filter(n=>n.visibility==='visible').map(n=>n.category).sort(),['character','character','scene']);assert.equal(d.speakers.length,2);
 assert(d.needs.every(n=>n.visibility!=='visible'||state.snapshot.entries[0].prompt.slice(n.start,n.end)===n.text));
});
test('model failure keeps the accurate local association and the next prompt is still processed',async()=>{
 const f=example134();f.project.episodes[0].prompts.push({...f.project.episodes[0].prompts[0],id:'second',label:'1-1-2'});f.api.aiChat=async()=>({ok:false,error:'provider offline'});
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});await service.autoAssociate();
 await assert.rejects(service.run('example',{manual:true,profile:{id:'m'}}),/offline/);
 const state=await service.read();assert.equal(state.decisions.example.confirmed,true);assert.equal(state.decisions.second.confirmed,true);assert.equal(state.saved.sceneDistributionAttempts[state.versionId+':example'].status,'calibration-failed');
});
test('scene automatic mapping does not treat a name or prop mentioned in dialogue as visible',()=>{
 const f=example134(),ep=f.project.episodes[0],record=f.ledger.episodes[1];
 ep.content='1-1 老旧居民楼走廊 夜 内\n时江晚：林秋雨今天没来，也没有带水杯。';record.sourceContent=ep.content;record.scenes[0].source=ep.content;record.scenes[0].items=[];record.scenes[0].mappingReady=false;
 record.roster.push({id:'cup',category:'prop',name:'【水杯】',description:'白色杯子',manual:true,ready:true});
 const next=automaticSceneAssociation(record,ep),names=next.scenes[0].items.map(i=>i.name);assert(names.includes('【时江晚-日常服】'));assert(!names.includes('【林秋雨-日常服】'));assert(!names.includes('【水杯】'));assert(names.includes('【老旧居民楼·走廊-内】'));
});
test('a foundation character explicitly mentioned off-screen does not become a visible missing asset',()=>{
 const f=example134(),entry=f.project.episodes[0].prompts[0];entry.content='【基础设定】\n人物：老王（仅提及，不出镜）；\n场景：无\n道具：无';
 return createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'}).autoAssociate().then(()=>{assert.equal(f.saved.decisions.example.needs.filter(n=>n.visibility==='visible').length,0);});
});
