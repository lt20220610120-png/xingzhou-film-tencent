import test from 'node:test';import assert from 'node:assert/strict';
import {example134} from './automatic134.fixtures.js';
import {createPromptDistributionService} from './promptDistributionService.js';
import {promptReviewState,reviewPromptScope} from './promptReviewBatch.js';
import {readPromptFoundation} from './promptFoundation.js';
import {storyboardPromptValue,storyboardSaveUpdates} from './promptAssetUsage.js';

test('precise automatic subsets remain reviewable while unrelated scene cards and pending audio retain their seats',async()=>{
 const f=example134();const record=f.ledger.episodes[1];record.scenes[0].items.push({...record.scenes[0].items[0],id:'unused',name:'【路人-日常服】'});
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});await service.autoAssociate();const state=await service.read(),review=promptReviewState(state,{});assert.equal(review.ready,true,review.problems.join(';'));
 let published=0;await reviewPromptScope({service,store:{updateMany:async()=>{},publish:async()=>published++},actor:'u',action:'approve-publish'});assert.equal(published,1);
});
test('scene semicolon descriptions are attributes while explicitly referenced second locations remain entities',()=>{
 const prompt='【基础设定】\n人物：甲（参考@）\n场景：夜，内，老旧居民楼404门外（参考@）；旧防盗门、门框、走廊墙面；走廊向楼道口延伸。\n道具：无\n【画面内容】';
 assert.deepEqual(readPromptFoundation(prompt).scene.flatMap(r=>r.names),['老旧居民楼404门外']);
 const two=prompt.replace('旧防盗门、门框、走廊墙面','夜，外，院子（参考@）');assert.deepEqual(readPromptFoundation(two).scene.flatMap(r=>r.names),['老旧居民楼404门外','院子']);assert.deepEqual(readPromptFoundation('【基础设定】\n场景：客厅（参考@）；厨房（全景，参考图待补）\n道具：无').scene.flatMap(r=>r.names),['客厅','厨房']);
});
test('storyboard retains available images and adopted voices when another reserved voice has no audio',async()=>{
 const f=example134(),service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});await service.autoAssociate();const binding=await service.read();
 for(const card of binding.snapshot.cards){card.assetId=card.uid;card.publishedSceneIds=[binding.snapshot.entries[0].sceneId];card.images=[{id:'img',url:'https://example.invalid/x.png'}];}
 const entry=binding.snapshot.entries[0],{automaticEntryAssociation}=await import('./automaticArtAssociation.js');binding.decisions[entry.id]=automaticEntryAssociation(binding.snapshot,entry,binding.decisions[entry.id]);
 const value=storyboardPromptValue(binding,{id:entry.id,label:entry.label,content:entry.prompt},{prompt:entry.prompt,references:[]},'u');assert.equal(value.references.filter(r=>r.kind==='image').length,3);assert.equal(value.referenceBindingMode,'pending');assert.match(value.bindingIssue,/音色/);const updates=storyboardSaveUpdates(value);assert.equal(updates.content,entry.prompt);const reloaded=storyboardPromptValue(binding,{id:entry.id,label:entry.label,content:updates.content},value,'u');assert.equal(reloaded.references.length,3);
 for(const c of binding.snapshot.voiceCards){c.pendingAudio=false;c.reference.url='https://example.invalid/'+c.uid+'.wav';}binding.decisions[entry.id]=automaticEntryAssociation(binding.snapshot,entry,binding.decisions[entry.id]);const ready=storyboardPromptValue(binding,{id:entry.id,label:entry.label,content:entry.prompt},value,'u');assert.equal(ready.referenceBindingMode,'confirmed');assert.equal(ready.references.length,5);
});

test('parenthetical owner notes and counted props keep actual identities and choose only the named owner',async()=>{
 const f=example134(),ep=f.project.episodes[0];ep.prompts[0].content=ep.prompts[0].content.replace('无关键手持道具。','手机（林秋雨持有，屏幕亮）；水壶与三只水杯。');const r=f.ledger.episodes[1];for(const [id,name] of [['phone1','【手机-林秋雨】'],['phone2','【手机-时江晚】'],['pot','【水壶】'],['cup','【水杯】']])r.scenes[0].items.push({id,category:'prop',name,description:'明确道具外观',ready:true});
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});await service.autoAssociate();const state=await service.read(),needs=state.decisions.example.needs.filter(n=>n.category==='prop');assert.equal(needs.length,3);assert(needs.every(n=>n.cardUid));assert.equal(state.snapshot.cards.find(c=>c.uid===needs.find(n=>n.text==='手机').cardUid).name,'【手机-林秋雨】');
});

test('manual storyboard shots without their own director prompt inherit scene references and only adopted audio',()=>{
 const image={id:'scene-image',kind:'image',url:'https://example.invalid/a.png'},voice={uid:'voice:one',name:'甲',sceneIds:['1-1'],pendingAudio:false,reference:{id:'voice:one:audio',kind:'audio',url:'https://example.invalid/a.wav'}};
 const binding={snapshot:{entries:[{id:'other-prompt',label:'1-1-1',sceneId:'1-1'}],voiceCards:[voice,{...voice,uid:'voice:two',pendingAudio:true}]}};const value=storyboardPromptValue(binding,{id:'manual',manual:true,label:'1-1-2',content:'手动分镜'},{prompt:'手动分镜',references:[image]},'u');assert.equal(value.references.length,2);assert.equal(value.references[0].id,image.id);assert.equal(value.sceneVoiceAssociation,'1-1');
});
