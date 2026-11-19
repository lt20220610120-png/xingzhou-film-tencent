import test from 'node:test';
import assert from 'node:assert/strict';
import {storyboardSceneReferences,importStoryboardSceneReferences} from './storyboardSceneReferences.js';
import {removeGenerationReference,generationReferenceKey} from './automaticReferences.js';
import {rememberStoryboardRemoval,storyboardRecoveryBaseline,restoreStoryboardReferences} from './storyboardReferenceRecovery.js';
import {canRefreshStoryboardBinding,storyboardPromptValue,storyboardSaveUpdates} from './promptAssetUsage.js';
import {storyboardBatchItems} from './storyboardBatch.js';

const image=id=>({id,url:'https://fixture/'+id+'.png'});
const asset=(id,sceneIds=['1-1'])=>({id,projectId:'p',category:'prop',name:id,sceneIds,images:[image(id)]});
const fixture=()=>({projectId:'p',episode:1,scene:'1-1',assets:[{...asset('hero'),images:[image('old'),image('new')],adoptedImageId:'new'},asset('prop'),asset('elsewhere',['1-2']),{...asset('other-project'),projectId:'other'}, {...asset('unmade'),images:[]}],media:[
 {id:'upload',kind:'image',projectId:'p',episode:1,scene:'1-1',url:'https://fixture/upload.png'},
 {id:'numeric',kind:'video',projectId:'p',episode:1,scene:'1',url:'https://fixture/video.mp4'},
 {id:'episode-only',kind:'image',episode:1,url:'https://fixture/e.png'},
 {id:'other-scene',kind:'audio',episode:1,scene:'1-2',url:'https://fixture/a.wav'},
 {id:'other-episode',kind:'audio',episode:2,scene:'1',url:'https://fixture/b.wav'},
 {id:'foreign',kind:'image',projectId:'foreign',episode:1,scene:'1-1',url:'https://fixture/f.png'}],binding:{snapshot:{cards:[],voiceCards:[
 {sceneIds:['1-1'],name:'音色',reference:{id:'voice',kind:'audio',url:'https://fixture/voice.wav'}},
 {sceneIds:['1-1'],pendingAudio:true,reference:{id:'pending',kind:'audio',url:'https://fixture/pending.wav'}},
 {sceneIds:['1-2'],reference:{id:'wrong',kind:'audio',url:'https://fixture/wrong.wav'}}]}}});

test('scene import uses all scene inventory instead of per-prompt decisions, adopted pictures and ready voices only',()=>{
 const f=fixture();f.binding.snapshot.cards=[{assetId:'prop',sceneIds:['1-1'],entryIds:['another-prompt']}];
 assert.deepEqual(storyboardSceneReferences(f).map(r=>r.id),['hero','prop','upload','numeric','voice']);
 // Scene inventory remains usable even when this prompt's old edition is gone.
 assert.deepEqual(storyboardSceneReferences({...f,binding:{currentSnapshot:f.binding.snapshot},shot:{generationConfig:{bindingVersionId:'deleted-edition'}}}).map(r=>r.id),['hero','prop','upload','numeric','voice']);
 assert.deepEqual(storyboardSceneReferences({...f,scene:'2-1'}),[]);
});
test('scene links in the shared inventory supplement incomplete asset scene IDs, without duplicate identities',()=>{
 const f=fixture();f.assets[1].sceneIds=[];f.binding.snapshot.cards=[{assetId:'prop',sceneIds:['1-1']}];
 f.media.push({...f.media[0]});
 const refs=storyboardSceneReferences(f);assert.equal(refs.filter(r=>r.id==='prop').length,1);assert.equal(refs.filter(r=>r.id==='upload').length,1);
});
test('appending scene references preserves text, manual references, settings and aliases; repeated import is idempotent',()=>{
 const current={prompt:'手改：@image1 与 @audio1',references:[{id:'manual',kind:'image',url:'https://fixture/manual.png'},{id:'voice',kind:'audio',url:'https://fixture/voice.wav'}],profileId:'chosen',libtvParams:{audio:'on'},autoReferenceExclusions:['image:prop','image:unrelated']};
 const refs=storyboardSceneReferences(fixture()),next=importStoryboardSceneReferences(current,refs,'1-1');
 assert.equal(next.prompt,current.prompt);assert.deepEqual(next.references.slice(0,2),current.references);assert.equal(next.profileId,'chosen');assert.deepEqual(next.libtvParams,current.libtvParams);
 assert.deepEqual(next.autoReferenceExclusions,['image:unrelated']);assert.equal(next.references.length,6);assert.equal(next.autoReferenceOrder[0].alias,'@image1');assert.equal(next.autoReferenceOrder[1].alias,'@audio1');
 assert.deepEqual(importStoryboardSceneReferences(next,refs,'1-1'),next);assert.equal(current.references.length,2);
});
test('manual scene selection and a removed prop survive refreshed binding, save/reopen and batch generation',()=>{
 const shot={id:'s',label:'1-1-1',content:'原词',storyboardPublicationId:'pub',generationConfig:{referenceBindingMode:'storyboard',bindingCompiledPrompt:'原词',bindingExpectedReferences:['new'],references:[{...image('new'),kind:'image'}]}};
 const imported=importStoryboardSceneReferences({...shot.generationConfig,prompt:shot.content},storyboardSceneReferences(fixture()),'1-1');
 const removed=rememberStoryboardRemoval(imported,removeGenerationReference(imported,'image:prop'));
 assert.equal(canRefreshStoryboardBinding({dirty:true,value:removed},shot),false);
 assert.deepEqual(storyboardPromptValue({error:'read failed'},shot,removed,'owner').references,removed.references);
 const updates=storyboardSaveUpdates(removed),saved={...shot,...updates},reopened=storyboardPromptValue({},saved,{...updates.generationConfig,prompt:updates.content},'owner');
 assert.equal(reopened.storyboardSceneImport,'1-1');assert.ok(!reopened.references.some(r=>r.id==='prop'));
 const project={id:'p',episodes:[{id:'e',episodeNumber:1,storyboardPrompts:[saved]}]};
 const batch=storyboardBatchItems({project,scope:'scene',episodeId:'e',sceneId:'1-1'});
 assert.deepEqual(batch[0].value.references,reopened.references);assert.equal(batch[0].value.prompt,shot.content);
 const baseline=storyboardRecoveryBaseline(saved,reopened,[],null),restored=restoreStoryboardReferences(reopened,baseline,['image:prop']);
 assert.ok(restored.references.some(r=>r.id==='prop'));assert.ok(!restored.autoReferenceExclusions.includes('image:prop'));
});
test('reimport explicitly restores removed scene materials and keeps other exclusions',()=>{
 const refs=storyboardSceneReferences(fixture()),initial=importStoryboardSceneReferences({prompt:'内容',references:[]},refs,'1-1');
 const removed=removeGenerationReference(initial,generationReferenceKey(refs[0]));
 const next=importStoryboardSceneReferences(removed,refs,'1-1');assert.equal(next.references.length,initial.references.length);assert.ok(!next.autoReferenceExclusions.includes(generationReferenceKey(refs[0])));
});
