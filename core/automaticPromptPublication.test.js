import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './promptDistribution.fixtures.js';
import {createPromptDistributionService} from './promptDistributionService.js';
import {automaticallyPublishPrompts} from './automaticPromptPublication.js';
import {promptReviewState,resolvePromptMissingReferences,promptHumanReviewSignature} from './promptReviewBatch.js';
import {artWorkflowMode,artWorkflowState} from './artWorkflow.js';
test('explicit automatic publication resolves missing items, publishes all prompts and allows restoring them',async()=>{
 const f=fixture(),published=[];f.api.aiChat=async p=>JSON.stringify({...JSON.parse(f.output(p.messages)),missing:[{category:'prop',text:'水杯',reason:'清单缺少水杯'}]});
 f.api.collabPatchStoryboard=async p=>{published.push(p);return f.project};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});
 await Promise.all(['p1','p2','p3'].map(id=>service.run(id,{profile:{id:'m'}})));
 assert.ok(promptReviewState(await service.read()).pendingMissing.length);
 const store={updateMany:async()=>{},publish:async()=>{}};
 const result=await automaticallyPublishPrompts({api:f.api,projectId:f.project.id,accountId:'u',service,store});
 assert.equal(result.published,3);assert.equal(result.remaining,0);assert.equal(published[0].prompts.length,3);
 const state=await service.read(),row=promptReviewState(state).skippedMissing[0];assert.match(row.need.reason,/自动确认/);
 await resolvePromptMissingReferences({service,versionId:state.snapshot.versionId,restore:true,targets:[{entryId:row.entry.id,needId:row.need.id,signature:promptHumanReviewSignature(state.snapshot,row.entry,state.decisions[row.entry.id])}]});
 const after=promptReviewState(await service.read());assert.ok(after.pendingMissing.length);assert.ok(after.approved<3);
});
test('stop guard prevents automatic review writes and publishing',async()=>{
 const f=fixture(),service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});
 await assert.rejects(automaticallyPublishPrompts({api:f.api,service,guard:()=>{throw Error('已停止')}}),/已停止/);assert.equal(f.saved,null);
});
test('automatic publishing mode persists its identity and uses continuous traversal',()=>{
 const f=fixture();f.ledger.workflow='auto-publish';assert.equal(artWorkflowMode(f.ledger),'auto-publish');assert.equal(artWorkflowState(f.ledger,f.project).mode,'auto-publish');assert.equal(artWorkflowMode({}),'automatic');
});

test('whole analysis in the chosen mode reaches publication without a review page',async()=>{
 const {runArtAnalysisPipeline}=await import('./artAnalysisPipeline.js'),{getArtReviewStore}=await import('./artReviewPersistence.js');
 const f=fixture();f.ledger.workflow='auto-publish';let published=0;
 Object.assign(f.api,{promptArtStatus:async()=>({enabled:true}),artReviewLoadLocal:async()=>f.ledger,artReviewSaveLocal:async()=>{},collabPatchStoryboard:async p=>{published+=p.prompts.length;return f.project},aiChat:async p=>JSON.stringify({...JSON.parse(f.output(p.messages)),missing:[{category:'prop',text:'水杯',reason:'缺少'}]})});
 const store=getArtReviewStore({api:f.api,projectId:f.project.id,accountId:'u'});await store.load(f.project);store.publish=async()=>{};
 const result=await runArtAnalysisPipeline({project:f.project,api:f.api,store,profile:{id:'m',model:'fixture'},accountId:'u',job:{},prepareVoices:false});
 assert.deepEqual(result.errors,[]);assert.equal(result.automaticPublication.published,3);assert.equal(published,3);
});
