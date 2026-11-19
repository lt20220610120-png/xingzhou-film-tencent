import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './promptDistribution.fixtures.js';
import {createPromptDistributionService} from './promptDistributionService.js';
import {storyboardPublicationPayload} from './storyboardPublication.js';
import {storyboardPromptValue} from './promptAssetUsage.js';
import {bindingSnapshot,bindingProblems,saveDistribution,entryBindingSignature} from './promptArtBinding.js';
import {selectBindingVersion} from './promptBindingVersions.js';
import {calibratedEntryAssociation} from './automaticArtAssociation.js';

test('published raw prompt with empty media hydrates adopted images without a second AI association',async()=>{
 const f=fixture(),service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});await service.run('p1',{profile:{id:'m'}});
 const before=await service.read(),entry=before.snapshot.entries[0],published=storyboardPublicationPayload(before.snapshot,before.decisions,[entry]).prompts[0];
 const shot={...published,sourcePromptId:entry.id,sourceContent:entry.prompt,storyboardPublicationId:'published'},value={...shot.generationConfig,prompt:shot.content};assert.equal(value.references.length,0);assert.notEqual(value.prompt,value.bindingCompiledPrompt);
 const current=structuredClone(before.snapshot);for(const card of current.cards){card.assetId='asset-'+card.uid;card.images=[{id:'adopted',url:'https://example.test/image.png'}];card.publishedSceneIds=[entry.sceneId];}
 const binding={...selectBindingVersion(current,before.saved),currentSnapshot:current,saved:before.saved};
 const result=storyboardPromptValue(binding,shot,value,'u');assert.equal(result.references.length,1);assert.match(result.prompt,/@image1/);assert.equal(f.calls,1);
 for(const manual of [{...value,prompt:'手改正文'},{...value,references:[{id:'manual',kind:'image'}]},{...value,autoReferenceExclusions:['asset']}])assert.deepEqual(storyboardPromptValue(binding,shot,manual,'u').references,manual.references);
});
test('empty model result cannot pass association and bulk missing-reference exemptions cannot hide an empty visual prompt',()=>{
 const f=fixture(),snapshot=bindingSnapshot(f.project,f.ledger,[]),entry=snapshot.entries[0];
 snapshot.cards.push({...snapshot.cards[0],uid:'second',name:'【张三-工作服】'});snapshot.cards[0].name='【张三-日常服】';
 const decision=saveDistribution(snapshot,entry,calibratedEntryAssociation(snapshot,entry,{needs:[]},{assignments:[],missing:[]}));
 assert.equal(decision.confirmed,false);assert(bindingProblems(snapshot,entry,decision).some(p=>p.includes('未关联任何')));
 const skipped={...decision,signature:entryBindingSignature(snapshot,entry),confirmed:true,needs:[...decision.needs,{id:'skip',category:'character',text:'张三',cardUid:null,visibility:'excluded',locked:true,skipReference:true,reason:'无需参考图'}]};
 assert(bindingProblems(snapshot,entry,skipped).some(p=>p.includes('未关联任何')));
});
test('published automatic reference keeps its slot during the gap before a replacement is adopted',async()=>{
 const f=fixture(),service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});
 await service.run('p1',{profile:{id:'m'}});
 const state=await service.read(),current=structuredClone(state.snapshot),entry=current.entries[0];
 for(const card of current.cards){card.assetId='asset-'+card.uid;card.images=[{id:'old',url:'https://example.test/old.png'}];card.publishedSceneIds=[entry.sceneId];}
 const ready=selectBindingVersion(current,state.saved),publication=storyboardPublicationPayload(ready.snapshot,ready.decisions,[entry]);
 const published=publication.prompts[0],config=published.generationConfig;
 assert.equal(config.references[0].assetImageSlot,true);
 assert.equal(config.references[0].imageId,undefined);
 const shot={...published,content:config.bindingCompiledPrompt,sourcePromptId:entry.id,sourceContent:entry.prompt,storyboardPublicationId:publication.publicationId};
 const value={...config,prompt:config.bindingCompiledPrompt};
 const pinned={...value,references:value.references.map(ref=>({...ref,followAdoptedImage:false}))};
 assert.equal(storyboardPromptValue({currentSnapshot:current,saved:state.saved},shot,pinned,'u').references[0].assetImageSlot,true);
 for(const card of current.cards)card.images=[];
 const result=storyboardPromptValue({currentSnapshot:current,saved:state.saved},shot,value,'u');
 assert.deepEqual(result.references,value.references);
 assert.equal(result.prompt,value.prompt);
});
