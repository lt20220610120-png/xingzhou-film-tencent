import test from 'node:test';
import assert from 'node:assert/strict';
import {newDirectorPromptEdition} from './directorPromptEditions.js';
import {fixture} from './promptDistribution.fixtures.js';
import {getArtDistributionController} from './artAnalysisPipeline.js';
import {getArtReviewStore} from './artReviewPersistence.js';
import {bindingVersionOptions} from './promptBindingVersions.js';
import {storyboardPromptValue,storyboardSaveUpdates} from './promptAssetUsage.js';
import {editArtReview,reviewSceneSignature} from './artReview.js';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
async function setup(){
 const f=fixture();f.project.episodes[0].prompts.forEach(p=>{p.profileId='same-model';p.content=p.content.replace('场景：客厅','场景：无').replace('道具：水杯','道具：无');});
 Object.assign(f.api,{promptArtStatus:async()=>({enabled:true}),artReviewLoadLocal:async()=>f.ledger,artReviewSaveLocal:async({data})=>Object.assign(f.ledger,structuredClone(data))});
 const store=getArtReviewStore({api:f.api,projectId:f.project.id,accountId:'u'});await store.load(f.project);
 const controller=getArtDistributionController({api:f.api,projectId:f.project.id,accountId:'u',project:f.project,store,existingAssets:f.assets,profile:{id:'m'}});
 return {f,store,controller};
}
test('supplement → refresh → distribution → first image → storyboard retains every prompt and its exact asset',async()=>{
 const {f,store,controller}=await setup(),all=[...f.project.episodes[0].prompts];f.project.episodes[0].prompts=all.slice(0,1);
 assert.deepEqual(await controller.start(),[]);const version=f.saved.selectedVersionId;assert.equal(f.calls,1);
 f.project.episodes[0].prompts=all;assert.deepEqual(await controller.refresh({project:f.project}),[]);assert.equal(f.calls,1,'supplemental exact identities are associated without a model');assert.equal(f.saved.selectedVersionId,version);assert.equal(bindingVersionOptions(f.snapshot().snapshot,f.saved).length,1);
 await controller.refresh({project:f.project});assert.equal(f.calls,1);
 await store.update(1,r=>{const next=editArtReview(r,{type:'approve',sceneId:'1-1'},'u');next.published['1-1']={signature:reviewSceneSignature(next.scenes[0])};return next;});
 f.assets.push({id:'asset-character',name:'【张三】',category:'character',images:[{id:'first-image',url:'https://fixture.test/character.png'}]});
 const binding={...f.snapshot(),saved:f.saved};
 for(const prompt of all){
  const value=storyboardPromptValue(binding,{id:prompt.id,sourcePromptId:prompt.id,label:prompt.label,content:prompt.content},{prompt:prompt.content,references:[]},'u');
  assert.equal(value.referenceBindingMode,'confirmed');assert.equal(value.references.length,1);assert.equal(value.references[0].assetId,'asset-character');assert.equal(value.references[0].imageId,'first-image');assert.match(value.prompt,/@image1/);assert.equal(storyboardSaveUpdates(value).content,prompt.content);
 }
 assert.equal(f.calls,1,'image publication and storyboard compilation need no new paid analysis');
});
test('a refresh queued during an in-flight distribution keeps the reply and distributes the supplemental prompt',async()=>{
 const {f,controller}=await setup(),all=[...f.project.episodes[0].prompts],entered=gate(),hold=gate();f.project.episodes[0].prompts=all.slice(0,1);
 let calls=0;f.api.aiChat=async p=>{calls++;if(calls===1){entered.resolve();await hold.promise;}return f.output(p.messages)};
 const work=controller.start();await entered.promise;f.project.episodes[0].prompts=all;const refreshed=controller.refresh({project:f.project});hold.resolve();
 const errors=(await Promise.all([work,refreshed])).flat();assert.deepEqual(errors,[]);assert.equal(calls,1);assert.equal(Object.keys(f.saved.decisions).length,3);
});
test('refresh respects Stop, while manual Start still recovers missing distribution',async()=>{
 const {f,controller}=await setup(),all=[...f.project.episodes[0].prompts];f.project.episodes[0].prompts=all.slice(0,1);await controller.start();await controller.stop();
 f.project.episodes[0].prompts=all;await controller.refresh({project:f.project});assert.equal(f.calls,1);
 assert.deepEqual(await controller.start(),[]);assert.equal(f.calls,3);assert.equal(Object.keys(f.saved.decisions).length,3);
});
test('explicitly opening a named edition creates a separate automatically distributed edition',async()=>{
 const {f,controller}=await setup();await controller.start();const old=f.saved.selectedVersionId;
 Object.assign(f.project,newDirectorPromptEdition(f.project,'新模型版本'));f.project.episodes[0].prompts=[1,2].map(n=>({id:'replacement-'+n,label:'1-1-'+n,profileId:'another-model',content:`【基础设定】\n人物：张三\n场景：无\n道具：无\n【画面内容】\n新模型的片段 ${n}`}));
 assert.deepEqual(await controller.refresh({project:f.project}),[]);const next=f.snapshot();assert.notEqual(next.versionId,old);assert.equal(bindingVersionOptions(next.snapshot,f.saved).length,2);assert.equal(next.snapshot.entries.length,2);
 assert(next.snapshot.entries.every(e=>next.decisions[e.id]?.confirmed));assert.equal(f.calls,3,'new exact matches require no additional model calls');
 const previous=await (await import('./promptBindingVersions.js')).selectBindingVersion(next.snapshot,f.saved,old);assert.equal(previous.snapshot.entries.length,3);assert(previous.snapshot.entries.every(e=>previous.decisions[e.id]?.confirmed));
});
