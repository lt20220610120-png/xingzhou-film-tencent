import test from 'node:test';
import assert from 'node:assert/strict';
import {existingVoiceSelection} from './voiceSelection.js';
import {projectVoiceRoster,projectVoiceCards} from './characterVoices.js';
import {compileVoiceBinding} from './voiceBinding.js';
const project={id:'p',episodes:[{episodeNumber:1,content:'1-1 日 内\n小林：回家。\n1-2 日 内\n小林：走吧。'}]};
const makeLedger=()=>({episodes:{1:{sourceContent:project.episodes[0].content,scenes:['1-1','1-2'].map((id,i)=>({id,source:`小林：${i?'走吧。':'回家。'}`,items:[{name:'小林-日常',category:'character',description:'司机'}]}))}},voiceProfiles:{}});
test('existing selection reuses identity and source-backed episode/scene associations',()=>{
 const ledger=makeLedger(),before=structuredClone(ledger),selected=existingVoiceSelection(project,ledger,'小林','audio');
 assert.equal(selected.character.key,'小林');assert.deepEqual(selected.character.episodes,[1]);assert.deepEqual(selected.character.speakingSceneIds,['1-1','1-2']);assert(!selected.profile.manual);assert(!selected.profile.association);assert.deepEqual(selected.profile.draft,{profileId:'audio',language:'Chinese'});assert.deepEqual(ledger,before);
 ledger.voiceProfiles.小林=selected.profile;assert.equal(projectVoiceRoster(project,ledger).characters.length,1);
 assert.deepEqual(existingVoiceSelection(project,ledger,'小林','other').profile,selected.profile);
});
test('selection preserves adopted audio, pending results, manual association and edited settings',()=>{
 const ledger=makeLedger(),profile={confirmed:{id:'a',filePath:'D:/a.wav'},candidates:[{id:'b',filePath:'D:/b.wav'}],association:{name:'小林',sceneIds:['1-2']},draft:{quote:'手工台词',instructions:'质疑',profileId:'saved',language:'English'},preparationEvidence:'evidence'};
 ledger.voiceProfiles.小林=profile;assert.deepEqual(existingVoiceSelection(project,ledger,'小林','new').profile,profile);
});
test('changed source and unknown/manual identities cannot create replacement profiles',()=>{
 const ledger=makeLedger();ledger.voiceProfiles['manual:x']={manual:{name:'补录',characterName:'补录',sceneIds:['1-1']}};
 assert.throws(()=>existingVoiceSelection(project,ledger,'missing'),/重新选择/);assert.throws(()=>existingVoiceSelection(project,ledger,'manual:x'),/重新选择/);
 assert.throws(()=>existingVoiceSelection({...project,episodes:[{episodeNumber:1,content:'changed'}]},ledger,'小林'),/重新选择/);
});
test('chosen profile retains scene-level pending identity and exact normal dialogue binding',()=>{
 const ledger=makeLedger();ledger.voiceProfiles.小林=existingVoiceSelection(project,ledger,'小林','audio').profile;
 const pending=projectVoiceCards(project,ledger,{includePending:true});assert.equal(pending.length,1);assert(pending[0].pendingAudio);assert.deepEqual(pending[0].sceneIds,['1-1','1-2']);
 ledger.voiceProfiles.小林.confirmed={id:'fixed',filePath:'D:/fixed.wav'};
 const cards=projectVoiceCards(project,ledger),entry={id:'entry',sceneId:'1-2',prompt:'小林：走吧。'};
 const compiled=compileVoiceBinding({voiceCards:cards},entry,{speakers:[{voiceUid:cards[0].uid,evidence:entry.prompt,kind:'dialogue'}]},{prompt:entry.prompt,references:[]});
 assert.equal(compiled.references.length,1);assert.doesNotMatch(compiled.prompt,/人物正常对白音色参考/);assert.match(compiled.prompt,/@audio1/);
});
