import test from 'node:test';import assert from 'node:assert/strict';
import {createVoiceGenerationQueue,getVoiceGenerationQueue} from './voiceGenerationQueue.js';
import {generateCharacterVoice,recoverCharacterVoiceResults} from './voiceReview.js';
import {readStoryboardDefaults,saveStoryboardDefaults,applyStoryboardDefaults} from './storyboardDefaults.js';
import {missingStoryboardReferences,restoreStoryboardReferences,rememberStoryboardRemoval,storyboardRecoveryBaseline} from './storyboardReferenceRecovery.js';
import {removeGenerationReference,generationReferenceKey} from './automaticReferences.js';
const gate=()=>{let resolve;return {promise:new Promise(r=>resolve=r),release:()=>resolve()}};
const tick=()=>new Promise(r=>setImmediate(r));
test('manual voice clicks share bounded FIFO, duplicates coalesce and failures do not block later cards',async()=>{
 const queue=createVoiceGenerationQueue();queue.setLimit(2);const g=gate(),calls=[];
 const run=k=>queue.enqueue(k,async()=>{calls.push(k);if(k==='a'||k==='b')await g.promise;if(k==='c')throw Error('single failure');});
 const a=run('a'),b=run('b'),c=run('c').catch(e=>e.message),d=run('d');await run('a');await tick();assert.deepEqual(calls,['a','b']);assert.equal(queue.snapshot().items.d.status,'queued');g.release();await Promise.all([a,b,c,d]);assert.deepEqual(calls,['a','b','c','d']);assert.equal(queue.snapshot().items.c.status,'failed');assert.equal(queue.snapshot().items.d.status,'complete');
});
test('serial queues remain clickable and stop drops only queued work; account/project scopes remain isolated',async()=>{
 const api={},q=getVoiceGenerationQueue(api,'a','p');assert.equal(q,getVoiceGenerationQueue(api,'a','p'));assert.notEqual(q,getVoiceGenerationQueue(api,'b','p'));assert.notEqual(q,getVoiceGenerationQueue(api,'a','other'));q.setLimit(1);const g=gate();let done=false,second=false;const a=q.enqueue('a',async()=>{await g.promise;done=true;}),b=q.enqueue('b',async()=>second=true);q.stop();g.release();await Promise.all([a,b]);assert(done);assert(!second);assert.equal(q.snapshot().items.b.status,'cancelled');
});
test('generated receipt is assigned to its character even while another view subscribes and edits another card',async()=>{
 let ledger={voiceProfiles:{a:{draft:{quote:'你好。'}},b:{draft:{quote:'保持。'}}}},request;
 const store={snapshot:()=>ledger,setVoiceProfile:async(k,fn)=>{ledger.voiceProfiles[k]=fn(ledger.voiceProfiles[k]||{});}};
 const g=gate(),api={audioGenerate:async r=>{request=r;await g.promise;return {id:'r',filePath:'r.wav'};}};
 const promise=generateCharacterVoice({character:{key:'a',name:'甲'},store,api,selected:{id:'local',model:'VoiceDesign'},target:{accountId:'u',projectId:'p'}});await tick();ledger.voiceProfiles.b.draft.quote='新的手工编辑';g.release();await promise;assert.equal(ledger.voiceProfiles.a.candidates[0].sourceResultId,'r');assert.equal(ledger.voiceProfiles.b.draft.quote,'新的手工编辑');assert.equal(request.voiceTarget.characterKey,'a');
});
test('voice recovery needs scoped receipts or explicit legacy recovery with unique speaker, stage and exact dialogue',async()=>{
 const characters=[{key:'a',name:'甲',quote:'你好。',ageStage:'default'},{key:'child',name:'甲',quote:'你好。',ageStage:'child'}];let profiles={},writes=0;const store={snapshot:()=>({voiceProfiles:profiles}),setVoiceProfile:async(k,fn)=>{writes++;profiles[k]=fn(profiles[k]||{});}};
 const rows=[{id:'legacy',filePath:'a.wav',text:'你好。',instructions:'人物：甲\n年龄阶段：default'},{id:'foreign',filePath:'b.wav',voiceTarget:{accountId:'another',projectId:'p',characterKey:'a'}},{id:'scoped',filePath:'c.wav',voiceTarget:{accountId:'u',projectId:'p',characterKey:'child'}}];const input={characters,store,api:{audioResultsList:async()=>rows},projectId:'p',accountId:'u'};
 assert.equal(await recoverCharacterVoiceResults(input),1);assert.equal(profiles.a,undefined);assert.equal(await recoverCharacterVoiceResults({...input,allowLegacy:true}),1);assert.equal(profiles.a.candidates[0].id,'legacy');const count=writes;assert.equal(await recoverCharacterVoiceResults({...input,allowLegacy:true}),0);assert.equal(writes,count);
});
test('storyboard defaults persist by account/project/edition and replace only settings when explicitly reapplied',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)},scope={accountId:'u',projectId:'p',editionId:'original'};
 const settings={profileId:'video',model:'m',ratio:'16:9',duration:5,resolution:'720p'},defaults=saveStoryboardDefaults(scope,settings,storage);assert.deepEqual(readStoryboardDefaults(scope,storage),defaults);assert.equal(readStoryboardDefaults({...scope,editionId:'new'},storage),null);
 const original={prompt:'人工草稿',references:[{id:'img'}],seed:123,ratio:'9:16'},applied=applyStoryboardDefaults(original,defaults);assert.equal(applied.prompt,original.prompt);assert.deepEqual(applied.references,original.references);assert.equal(applied.ratio,'16:9');const special={...applied,duration:10};assert.equal(applyStoryboardDefaults(special,defaults),special);assert.equal(applyStoryboardDefaults(special,saveStoryboardDefaults(scope,{...settings,duration:8},storage)).duration,8);
});
test('reference recovery restores one or all removed references with coherent aliases and preserves model settings',()=>{
 const refs=[{id:'a',name:'甲',kind:'image'},{id:'b',name:'乙',kind:'image'},{id:'v',name:'音色',kind:'audio'}],baseline={prompt:'甲（参考@image1）；乙（参考@image2）；声音@audio1',references:refs};
 let value=removeGenerationReference(removeGenerationReference(baseline,'image:a'),'audio:v');value={...value,model:'my-model',duration:10};assert.equal(missingStoryboardReferences(value,baseline).length,2);value=restoreStoryboardReferences(value,baseline,['image:a']);assert.deepEqual(value.references.map(generationReferenceKey),['image:a','image:b']);assert.match(value.prompt,/@image1/);assert(!value.prompt.includes('@audio1'));value=restoreStoryboardReferences(value,baseline);assert.equal(value.prompt,baseline.prompt);assert.deepEqual(value.references,refs);assert.equal(value.model,'my-model');assert.equal(value.duration,10);
});
test('recovery never overwrites manual prompt text or unrelated imported references',()=>{
 const baseline={prompt:'【基础设定】\n人物：甲（参考@image1）',references:[{kind:'image',id:'a',name:'甲'}]},extra={kind:'image',id:'extra',name:'用户图'};
 const value={...removeGenerationReference(baseline,'image:a'),prompt:'人工改写的提示词。',references:[extra]};const next=restoreStoryboardReferences(value,baseline);assert.equal(next.prompt,'人工改写的提示词。');assert(next.references.some(r=>r.id==='extra'));assert(next.references.some(r=>r.id==='a'));
});

test('a recovered receipt arriving before generation acknowledgement is kept exactly once',async()=>{
 let profile={},resolve;const receipt={id:'receipt',filePath:'receipt.wav',voiceTarget:{accountId:'u',projectId:'p',characterKey:'a'}},store={snapshot:()=>({voiceProfiles:{a:profile}}),setVoiceProfile:async(k,fn)=>{profile=fn(profile);}};
 const api={audioGenerate:()=>new Promise(r=>resolve=r),audioResultsList:async()=>[receipt]},character={key:'a',name:'甲',quote:'你好。'};
 const request=generateCharacterVoice({character,store,api,selected:{model:'mock'}});await recoverCharacterVoiceResults({characters:[character],store,api,projectId:'p',accountId:'u'});resolve(receipt);await request;assert.equal(profile.candidates.length,1);
});
test('manual storyboard recovery uses only explicitly selected and actually removed references, across save and reload',()=>{
 const a={kind:'image',id:'a'},b={kind:'image',id:'b'},shot={content:'人工分镜',generationConfig:{references:[a]}};
 let value={prompt:shot.content,references:[a]};let baseline=storyboardRecoveryBaseline(shot,value,[a,b],null);assert.equal(missingStoryboardReferences(value,baseline).length,0);
 value=rememberStoryboardRemoval(value,{...value,references:[]});shot.generationConfig=structuredClone(value);baseline=storyboardRecoveryBaseline(shot,value,[a,b],null);assert.deepEqual(missingStoryboardReferences(value,baseline).map(r=>r.id),['a']);assert.deepEqual(restoreStoryboardReferences(value,baseline).references,[a]);
});
