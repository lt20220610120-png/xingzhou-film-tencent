import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './promptDistribution.fixtures.js';
import {validateEpisodeVoices,voiceIdentity} from './characterVoices.js';
import {bindingSnapshot,currentEntryBinding,saveDistribution,bindingProblems,compileEntryBinding} from './promptArtBinding.js';
import {sceneDistributionMessages,applySceneDistribution} from './scenePromptDistribution.js';
import {selectBindingVersion,saveBindingVersion} from './promptBindingVersions.js';
import {sceneIdentities,isNoReferenceText} from './sceneIdentityContext.js';

test('recognized speaking identity reaches a prompt before audio adoption, and compilation requires the adopted recording',()=>{
 const f=fixture(),ep=f.project.episodes[0],record=f.ledger.episodes[1];ep.content+='\n张三：水温正好。';record.sourceContent=ep.content;record.scenes[0].source=ep.content;
 ep.prompts[0].content+='\n【连续台词】\n张三：水温正好。';record.voiceAnalysis=validateEpisodeVoices(ep,record.scenes,{scenes:[{sceneId:'1-1',speakers:[{name:'张三',ageStage:'default',quote:'水温正好。',language:'Chinese',evidence:'张三：水温正好。',kind:'dialogue'}]}]});
 let snapshot=bindingSnapshot(f.project,f.ledger,f.assets),entry=snapshot.entries[0];assert.equal(snapshot.voiceCards.length,1,'recognized voice must not disappear just because there is no audio');assert.equal(snapshot.voiceCards[0].pendingAudio,true);
 const payload=JSON.parse(sceneDistributionMessages(snapshot,entry,currentEntryBinding(snapshot,entry),ep.content)[1].content);assert.equal(payload.voiceCards.length,1);
 const uid=payload.voiceCards[0].uid,raw={assignments:payload.cards.map(c=>({cardUid:c.uid,visibility:'visible',evidence:'张三',reason:'本条使用'})),missing:[],speakers:[{voiceUid:uid,evidence:'张三：水温正好。',kind:'dialogue'}]};
 const decision=saveDistribution(snapshot,entry,applySceneDistribution(snapshot,entry,currentEntryBinding(snapshot,entry),raw,ep.content));assert.equal(decision.confirmed,true);assert.equal(decision.speakers.length,1);
 assert(bindingProblems(snapshot,entry,decision,{requireImages:true}).some(p=>/音色.*未.*采用/.test(p)));
 f.ledger.voiceProfiles={[voiceIdentity('张三','default')]:{confirmed:{id:'adopted',filePath:'D:/fixture.wav'}}};
 let saved=saveBindingVersion(null,snapshot,{[entry.id]:decision});const adopted=bindingSnapshot(f.project,f.ledger,f.assets,snapshot),selected=selectBindingVersion(adopted,saved);assert.equal(selected.decisions[entry.id].speakers[0].voiceUid,uid,'adoption keeps logical identity');
});

function assistantFixture(){
 const cards=[['assistant','【温可儿助理-职业装】'],['star','【周星星-住院病号服】']].map(([uid,name])=>({uid,name,category:'character',description:'',detailStatus:'',sceneIds:['15-2'],images:[{id:uid+'-image',url:'https://fixture/'+uid}],assetId:uid,publishedSceneIds:['15-2']}));
 const entries=[1,2].map(n=>({id:'p'+n,sceneId:'15-2',label:'15-2-'+n,sceneReady:true,prompt:`【基础设定】\n人物：周星星（参考@），坐在床上；助理（参考@），站在床侧。\n场景：无\n道具：无\n【画面内容】\n${n===1?'助理走入病房。':'助理递交手机。'}`}));
 return {snapshot:{projectId:'p',cards,entries},entries,cards};
}
test('same-scene unique assistant identity is resolved consistently when the model misses the second clip',()=>{
 const {snapshot,entries,cards}=assistantFixture(),entry=entries[1],seed=currentEntryBinding(snapshot,entry);
 const raw={assignments:[{cardUid:'star',visibility:'visible',evidence:'周星星',reason:'本条使用'}],missing:[{category:'character',text:'助理（参考@），站在床侧。',reason:'名称不同'}]};
 const result=saveDistribution(snapshot,entry,applySceneDistribution(snapshot,entry,seed,raw));assert.equal(result.confirmed,true);assert.equal(result.needs.filter(n=>!n.cardUid).length,0);assert.equal(result.needs.find(n=>n.cardUid==='assistant').visibility,'visible');assert(compileEntryBinding(snapshot,entry,result).references.some(r=>r.assetId==='assistant'));
 const data=JSON.parse(sceneDistributionMessages(snapshot,entry,seed)[1].content);assert(data.sceneIdentities.some(r=>r.token==='助理'&&r.cardUid==='assistant'));
});
test('two assistants or an explicit human exclusion must not be silently remapped',()=>{
 const f=assistantFixture(),entry=f.entries[1];f.snapshot.cards.push({...f.cards[0],uid:'other',name:'【另一位助理-职业装】'});
 let raw={assignments:[],missing:[{category:'character',text:'助理',reason:'两位助理不明确'}]},result=applySceneDistribution(f.snapshot,entry,currentEntryBinding(f.snapshot,entry),raw);assert(result.needs.some(n=>!n.cardUid&&n.text==='助理'));
 f.snapshot.cards.pop();const seed={...currentEntryBinding(f.snapshot,entry),needs:[{id:'manual',category:'character',cardUid:'assistant',text:'助理',start:0,end:0,visibility:'excluded',locked:true,reason:'人工确认本条不用'}]};result=applySceneDistribution(f.snapshot,entry,seed,raw);assert.equal(result.needs.find(n=>n.cardUid==='assistant').visibility,'excluded');
});
test('structured dialogue covers both real speakers, excluding inner voice and a silent visible character',()=>{
 const {snapshot,entries}=assistantFixture(),entry=entries[1];entry.prompt+='\n【连续台词】\nD01｜周星星｜现场对白｜分镜01：『手机给我。』\nD02｜助理｜现场对白｜分镜02：『好的。』\nD03｜周星星｜内心VO｜分镜03：『她为什么这样？』';
 snapshot.voiceCards=[['voice-star','周星星'],['voice-assistant','温可儿助理'],['voice-silent','护士']].map(([uid,name])=>({uid,name,characterName:name,sceneIds:['15-2'],pendingAudio:true,reference:{id:uid+':pending',kind:'audio'}}));
 const data=JSON.parse(sceneDistributionMessages(snapshot,entry,currentEntryBinding(snapshot,entry))[1].content);assert.equal(data.dialogueSource,entry.prompt);
 const result=applySceneDistribution(snapshot,entry,currentEntryBinding(snapshot,entry),{assignments:[],missing:[],speakers:[]});assert.deepEqual(result.speakers.map(s=>s.voiceUid).sort(),['voice-assistant','voice-star']);assert(result.speakers.every(s=>entry.prompt.includes(s.evidence)));assert(!result.speakers.some(s=>s.evidence.includes('内心VO')));
});
test('old successful decisions with an omitted explicit identity or Dxx speaker are repairable, while manual exclusions remain respected',()=>{
 const {snapshot,entries}=assistantFixture(),entry=entries[1],seed=currentEntryBinding(snapshot,entry);
 const good=saveDistribution(snapshot,entry,applySceneDistribution(snapshot,entry,seed,{assignments:[],missing:[]}));
 const old={...good,needs:good.needs.map(n=>n.cardUid==='assistant'?{...n,visibility:'excluded',reason:'模型漏选'}:n)};
 assert(bindingProblems(snapshot,entry,old).some(p=>p.includes('助理')));
 assert(!bindingProblems(snapshot,entry,{...old,needs:old.needs.map(n=>n.cardUid==='assistant'?{...n,locked:true}:n)}).some(p=>p.includes('助理')));
 snapshot.voiceCards=[{uid:'voice-star',characterName:'周星星',name:'周星星',sceneIds:['15-2'],reference:{id:'pending'},pendingAudio:true}];
 entry.prompt+='\n【连续台词】\nD01｜周星星｜现场对白｜分镜01：『手机给我。』';
 const linked=saveDistribution(snapshot,entry,applySceneDistribution(snapshot,entry,currentEntryBinding(snapshot,entry),{assignments:[],missing:[],speakers:[]}));
 assert(bindingProblems(snapshot,entry,{...linked,speakers:[]}).some(p=>p.includes('讲话')));
});
test('identity anchors stay inside foundation and nonvisual or no-reference rows cannot silently become images',()=>{
 assert.equal(isNoReferenceText('无名（参考@），站在床前。'),false);
 const {snapshot,entries}=assistantFixture(),entry=entries[1];entry.prompt='助理只是一段标题。\n'+entry.prompt;
 assert(sceneIdentities(snapshot,entry).find(m=>m.token==='助理').start>entry.prompt.indexOf('【基础设定】'));
 entry.prompt=entry.prompt.replace('周星星（参考@），坐在床上','周星星（参考@），看着助理');
 assert.equal(sceneIdentities(snapshot,entry).find(m=>m.token==='助理').start,entry.prompt.indexOf('助理（参考@）'));
 entry.prompt=entry.prompt.replace('助理（参考@），站在床侧。','助理（参考@），电话音、无画面在场。');
 assert(!sceneIdentities(snapshot,entry).some(m=>m.cardUid==='assistant'));
 entry.prompt=entry.prompt.replace('道具：无','道具：无关键手持道具。');
 const result=applySceneDistribution(snapshot,entry,currentEntryBinding(snapshot,entry),{assignments:[],missing:[{category:'prop',text:'无关键手持道具。',reason:'模型误报'}]});
 assert(!result.needs.some(n=>!n.cardUid&&n.visibility==='visible'));
});
test('a unique identity cannot borrow another character evidence span',()=>{
 const {snapshot,entries}=assistantFixture(),entry=entries[0],seed=currentEntryBinding(snapshot,entry);
 const result=applySceneDistribution(snapshot,entry,seed,{assignments:[{cardUid:'assistant',visibility:'visible',evidenceId:'character:1',reason:'模型选错同类片段'}],missing:[]});
 const assistant=result.needs.find(n=>n.cardUid==='assistant');assert.equal(assistant.text,'助理');assert.equal(entry.prompt.slice(assistant.start,assistant.end),'助理');
});
test('human no-reference decisions survive both repeated and omitted AI missing reports',()=>{
 for(const reportMissing of [false,true]){
  const {snapshot,entries}=assistantFixture(),entry=entries[1],text='助理（参考@），站在床侧。',start=entry.prompt.indexOf(text);
  const locked={id:'skip',category:'character',cardUid:null,text,start,end:start+text.length,locked:true,visibility:'excluded',skipReference:true,reason:'人工确认无需参考图'};
  const seed={...currentEntryBinding(snapshot,entry),needs:[locked]};
  const result=saveDistribution(snapshot,entry,applySceneDistribution(snapshot,entry,seed,{assignments:[{cardUid:'assistant',visibility:'visible',evidenceId:'character:2',reason:'基础设定出现'}],missing:reportMissing?[{category:'character',text,reason:'模型漏配'}]:[]}));
  assert(result.needs.some(n=>n.id==='skip'&&n.locked&&n.skipReference));assert(!result.needs.some(n=>n.cardUid==='assistant'&&n.visibility==='visible'));assert.equal(result.confirmed,true);assert(!compileEntryBinding(snapshot,entry,result).references.some(r=>r.assetId==='assistant'));
 }
});
