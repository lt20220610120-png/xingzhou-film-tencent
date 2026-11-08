import {createPromptDistributionService} from './promptDistributionService.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {editArtReview,reviewSceneSignature} from './artReview.js';
import {fixture} from './promptDistribution.fixtures.js';
import {bindingSnapshot,currentEntryBinding,saveDistribution,bindingProblems,compileEntryBinding,entryBindingSignature} from './promptArtBinding.js';
import {projectVoiceCards,episodeVoiceRoster} from './characterVoices.js';
import {applySceneDistribution} from './scenePromptDistribution.js';
import {saveBindingVersion,selectBindingVersion} from './promptBindingVersions.js';
import {declaredPromptSpeakers} from './voiceBinding.js';
import {getArtReviewStore} from './artReviewPersistence.js';
import {getArtDistributionController} from './artAnalysisPipeline.js';

function legacy(){
 const f=fixture(),ep=f.project.episodes[0],record=f.ledger.episodes[1];
 ep.content+='\n张三（小声）：水温正好。\n李四（心声）：不要说。';record.sourceContent=ep.content;record.scenes[0].source=ep.content;
 record.scenes[0].items.push({id:'silent',name:'【李四】',category:'character',description:'成年男子',ready:true,manual:true});
 ep.prompts[0].content+='\n【连续台词】\n张三（小声）：水温正好。\n李四（OS）：不要说。';
 record.scenes[0].items.forEach(i=>{i.manual=true;i.ready=true;});
 f.ledger.episodes[1]=editArtReview(record,{type:'approve',sceneId:'1-1'});
 f.ledger.episodes[1].published['1-1']={signature:reviewSceneSignature(f.ledger.episodes[1].scenes[0])};
 f.assets.push(...record.scenes[0].items.map(i=>({id:i.id,name:i.name,category:i.category,images:[{id:i.id+'-img',url:'https://fixture.test/'+i.id}]})));
 return f;
}
test('legacy inventory reserves scene and clip voice slots without voiceAnalysis, profiles, generation or adoption',()=>{
 const f=legacy(),snapshot=bindingSnapshot(f.project,f.ledger,f.assets),entry=snapshot.entries[0];
 assert.equal(f.ledger.episodes[1].voiceAnalysis,undefined);assert.equal(f.ledger.voiceProfiles,undefined);
 assert.deepEqual(episodeVoiceRoster(f.project,f.ledger,1).map(c=>c.characterName),['张三']);
 assert.deepEqual(snapshot.voiceCards.map(c=>[c.uid,c.pendingAudio,c.sceneIds]),[['voice:张三',true,['1-1']]]);
 const decision=saveDistribution(snapshot,entry,applySceneDistribution(snapshot,entry,currentEntryBinding(snapshot,entry),{assignments:[],missing:[],speakers:[]}));
 assert.equal(decision.confirmed,true);assert.equal(decision.speakers[0].voiceUid,'voice:张三');
 assert.deepEqual(bindingProblems(snapshot,entry,decision),[]);
 assert.throws(()=>compileEntryBinding(snapshot,entry,decision),/尚未生成并采用/);
 assert.equal(declaredPromptSpeakers(snapshot,snapshot.entries[1]).length,0,'silent sibling never inherits scene voices');
});
test('normal dialogue omissions in an existing prepared voice analysis are restored from literal source',()=>{
 const f=legacy(),ep=f.project.episodes[0],record=f.ledger.episodes[1];
 record.voiceAnalysis={schema:2,prepared:true,sourceContent:ep.content,scenes:[{sceneId:'1-1',appearances:[],speakers:[]}]};
 assert.equal(projectVoiceCards(f.project,f.ledger,{includePending:true}).length,1);
 ep.content+='\n正文变化';assert.equal(projectVoiceCards(f.project,f.ledger,{includePending:true}).length,0);
});
test('adoption and replacement hydrate existing logical decisions to latest audio immediately',()=>{
 const f=legacy();let snapshot=bindingSnapshot(f.project,f.ledger,f.assets),entry=snapshot.entries[0];
 const d=saveDistribution(snapshot,entry,applySceneDistribution(snapshot,entry,currentEntryBinding(snapshot,entry),{assignments:[],missing:[],speakers:[]}));
 let saved=saveBindingVersion(null,snapshot,{[entry.id]:d});
 for(const id of ['first','replacement']){
  f.ledger.voiceProfiles={'张三':{confirmed:{id,filePath:'D:/'+id+'.wav'}}};
  const current=bindingSnapshot(f.project,f.ledger,f.assets,snapshot),selected=selectBindingVersion(current,saved),decision=selected.decisions[entry.id];
  assert.equal(decision.confirmed,true);assert.equal(decision.signature,entryBindingSignature(selected.snapshot,selected.snapshot.entries[0]));
  assert.deepEqual(bindingProblems(selected.snapshot,selected.snapshot.entries[0],decision),[]);
  const compiled=compileEntryBinding(selected.snapshot,selected.snapshot.entries[0],decision);
  assert.equal(compiled.references.find(r=>r.kind==='audio').filePath,'D:/'+id+'.wav');
  saved=saveBindingVersion(saved,selected.snapshot,selected.decisions);snapshot=current;
 }
 f.ledger.episodes[1].scenes[0].items[0].name='【王五】';
 const changed=selectBindingVersion(bindingSnapshot(f.project,f.ledger,f.assets,snapshot),saved);
 assert(bindingProblems(changed.snapshot,changed.snapshot.entries[0],changed.decisions[entry.id]).length>0,'identity change still invalidates');
});
test('standalone distribution repairs old no-voice results and later adoption requires no redistribution model call',async()=>{
 const f=legacy();let disk=structuredClone(f.ledger),saved=null,calls=0;
 const api={artReviewLoadLocal:async()=>structuredClone(disk),artReviewSaveLocal:async({data})=>{disk=structuredClone(data)},promptArtStatus:async()=>({enabled:true}),promptArtLoad:async()=>structuredClone(saved),promptArtSave:async p=>{saved={...structuredClone(p.data),revision:(saved?.revision||0)+1};return structuredClone(saved)},aiChat:async p=>{calls++;const data=JSON.parse(p.messages[1].content);assert(data.voiceCards.length===1);return JSON.stringify({assignments:[],missing:[],speakers:[]});}};
 const store=getArtReviewStore({api,projectId:f.project.id});await store.load(f.project,f.assets);
 const control=getArtDistributionController({api,projectId:f.project.id,project:f.project,store,existingAssets:f.assets,profile:{id:'mock'}});
 const errors=await control.start();assert.deepEqual(errors,[]);assert.equal(saved.decisions.p1.speakers.length,1);assert.equal(saved.decisions.p2.speakers.length,0);
 const before=calls;await store.setVoiceProfile('张三',()=>({confirmed:{id:'adopted',filePath:'D:/adopted.wav'}}));
 await control.refresh();assert.equal(calls,before);
 const selected=selectBindingVersion(bindingSnapshot(f.project,store.snapshot(),f.assets,saved.snapshot),saved);
 assert.equal(compileEntryBinding(selected.snapshot,selected.snapshot.entries[0],selected.decisions.p1).references.filter(r=>r.kind==='audio').length,1);
});
test('speech selection excludes offscreen/narration and ambiguous ages or roles; dialogue text itself can mention thoughts',()=>{
 const cards=['小林','小王','温可儿助理','周星星助理'].map((name,i)=>({uid:String(i),name,sceneIds:['1-1']}));
 const entry={sceneId:'1-1',prompt:'【基础设定】\n人物：小林：只是描述\n【连续台词】\n小林：你能听到我的心声？\n小王（电话画外音）：喂。\n助理：好的。\n旁白：后来。\n【画面内容】\n小王：这里只是动作描述'};
 assert.deepEqual(declaredPromptSpeakers({voiceCards:cards},entry).map(s=>s.voiceUid),['0']);
 cards.push({...cards[0],uid:'child',ageStage:'child'});assert.equal(declaredPromptSpeakers({voiceCards:cards},entry).length,0);
});

test('adoption during a manual redispatch keeps the in-flight logical choice and uses current audio',async()=>{
 const f=legacy(),service=createPromptDistributionService({...f,projectId:f.project.id});await service.run('p1',{profile:{id:'mock'}});
 let enter,release;const entered=new Promise(r=>{enter=r}),hold=new Promise(r=>{release=r});
 f.api.aiChat=async p=>{enter();await hold;return f.output(p.messages)};
 const pending=service.run('p1',{profile:{id:'mock'},manual:true});await entered;
 f.ledger.voiceProfiles={'张三':{confirmed:{id:'during',filePath:'D:/during.wav'}}};release();await pending;
 const live=await service.read();assert.deepEqual(bindingProblems(live.snapshot,live.snapshot.entries[0],live.decisions.p1),[]);
 assert.equal(compileEntryBinding(live.snapshot,live.snapshot.entries[0],live.decisions.p1).references.find(r=>r.kind==='audio').filePath,'D:/during.wav');
});
