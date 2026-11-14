import {createRequire} from 'node:module';
import {storyboardShots} from './storyboardPublication.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as batch from './promptReviewBatch.js';
import {fixture} from './promptDistribution.fixtures.js';
import {createPromptDistributionService} from './promptDistributionService.js';
import {newArtReview,applyArtReviewCandidate,reviewSceneSignature} from './artReview.js';

const {patchShot}=createRequire(import.meta.url)('../cloud-backend/src/storyboard-merge.cjs');

async function setup(){
 const f=fixture(),ep={...structuredClone(f.project.episodes[0]),id:'ep2',episodeNumber:2,content:'2-1 客厅 日 内\n张三喝水。',prompts:[{id:'p4',label:'2-1-1',content:f.project.episodes[0].prompts[0].content}]};
 f.project.episodes.push(ep);
 f.ledger.episodes[2]=applyArtReviewCandidate(newArtReview(ep),ep,{items:[{id:'b',category:'character',name:'【张三】',description:'成年男性，短发，灰色短袖。',ready:true}],mapping:[{sceneId:'2-1',assets:[{category:'character',name:'【张三】'}]}],inventory:'清单',complete:true,warnings:[]});
 const original=f.api.aiChat;f.api.aiChat=async p=>{const raw=JSON.parse(await original(p));raw.missing=[{category:'prop',text:'水杯',reason:'本场没有水杯卡片'}];return JSON.stringify(raw)};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});
 await Promise.all(['p1','p2','p3','p4'].map(id=>service.run(id,{profile:{id:'m'}})));
 const state=await service.read(),items=batch.promptReviewState(state,{}).pendingMissing;
 const targets=items.map(({entry,need})=>({entryId:entry.id,needId:need.id,signature:batch.promptHumanReviewSignature(state.snapshot,entry,state.decisions[entry.id])}));
 return {f,service,state,targets};
}

test('whole-drama missing references resolve atomically across episodes without approving or publishing',async()=>{
 const {f,service,state,targets}=await setup(),revision=f.saved.revision;
 assert.deepEqual(targets.map(t=>t.entryId),['p1','p2','p3','p4']);
 await batch.resolvePromptMissingReferences({service,targets,versionId:state.snapshot.versionId});
 const next=await service.read(),review=batch.promptReviewState(next,{});
 assert.equal(f.saved.revision,revision+1);assert.equal(review.pendingMissing.length,0);assert.equal(review.ready,true);assert.equal(review.approved,0);assert.equal(review.published,0);
 assert(next.decisions.p4.needs.some(n=>n.skipReference&&n.locked&&n.visibility==='excluded'));
});
test('selected resolution leaves unselected missing references blocking their own episode',async()=>{
 const {service,state,targets}=await setup();
 await batch.resolvePromptMissingReferences({service,targets:targets.slice(0,3),versionId:state.snapshot.versionId});
 const next=await service.read();assert.equal(batch.promptReviewState(next,{episode:1}).ready,true);assert.equal(batch.promptReviewState(next,{episode:2}).ready,false);
 assert.deepEqual(batch.promptReviewState(next,{}).pendingMissing.map(i=>i.entry.label),['2-1-1']);
});
test('empty, stale or active targets fail before any batch write',async()=>{
 const {f,service,state,targets}=await setup(),versionId=state.snapshot.versionId,revision=f.saved.revision;
 await assert.rejects(batch.resolvePromptMissingReferences({service,targets:[],versionId}),/选择/);
 await assert.rejects(batch.resolvePromptMissingReferences({service,targets:[targets[0],{...targets[1],signature:'stale'}],versionId}),/变化/);
 await assert.rejects(batch.resolvePromptMissingReferences({service:{...service,isBusy:id=>id==='p2'},targets,versionId}),/分发/);
 assert.equal(f.saved.revision,revision);assert.equal(batch.promptReviewState(await service.read(),{}).pendingMissing.length,4);
});
test('a live-source change while waiting for the writer rejects the batch rather than confirming the archived version',async()=>{
 const {f,service,state,targets}=await setup(),revision=f.saved.revision;
 const raced={...service,mutate:(version,reduce)=>{f.project.episodes[0].prompts[0].content+='\n来源已修改';return service.mutate(version,reduce)}};
 await assert.rejects(batch.resolvePromptMissingReferences({service:raced,targets,versionId:state.snapshot.versionId}),/来源版本已变化/);
 assert.equal(f.saved.revision,revision);assert(!f.saved.decisions.p1.needs.some(n=>n.skipReference));
});

test('legacy overlapping missing IDs after a same-edition edit can be selected independently and published',async()=>{
 const f=fixture();
 f.project.director_project_id='director-source';
 f.assets.push({id:'actor-asset',category:'character',name:'【张三】',image_url:'https://test.invalid/actor.png'});
 let shots=structuredClone(f.project.episodes);
 f.api.collabPatchStoryboard=async payload=>{shots=patchShot(shots,payload);};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});
 const scope={sceneId:'1-1'},store={
  updateMany:async changes=>{for(const {number,reduce} of changes)f.ledger.episodes[number]=reduce(f.ledger.episodes[number]);},
  publish:async(number,ids)=>{
   const record=f.ledger.episodes[number];
   for(const id of ids)record.published[id]={signature:reviewSceneSignature(record.scenes.find(scene=>scene.id===id))};
  }
 };
 const publish=()=>batch.reviewPromptScope({service,store,scope,actor:'u',action:'approve-publish'});
 const distribute=()=>Promise.all(['p1','p2','p3'].map(id=>service.run(id,{profile:{id:'m'}})));
 await distribute();
 assert.equal((await publish()).published,3);
 const before=await service.read();
 const edited=f.project.episodes[0].prompts[0];
 edited.content+='，放在桌上';
 const original=f.api.aiChat;
 f.api.aiChat=async p=>{
  const raw=JSON.parse(await original(p));
  if(JSON.parse(p.messages[1].content).label==='1-1-1')raw.missing=['水杯','水杯，放在桌上'].map(text=>({category:'prop',text,reason:'本场没有卡片'}));
  return JSON.stringify(raw);
 };
 await service.run('p1',{profile:{id:'m'},manual:true});
 const redistributed=await service.read();
 assert.equal(redistributed.snapshot.versionId,before.snapshot.versionId);
 const legacy=structuredClone(redistributed.decisions.p1);
 const missing=legacy.needs.filter(n=>!n.cardUid&&n.visibility==='visible');
 assert.equal(missing.length,2);
 assert.equal(new Set(missing.map(n=>n.id)).size,2);
 for(const need of missing)need.id='missing:prop:'+need.start;
 legacy.needs.push({...missing[0]});
 f.saved.decisions.p1=legacy;
 f.saved.versions[redistributed.snapshot.versionId].decisions.p1=legacy;
 const key=redistributed.snapshot.versionId+':p1';
 f.saved.sceneDistributionAttempts[key]={...f.saved.sceneDistributionAttempts[key],status:'running',startedAt:Date.now()-11*60000};
 const pending=state=>batch.promptReviewState(state,scope).pendingMissing;
 const target=(state,{entry,need})=>({entryId:entry.id,needId:need.id,signature:batch.promptHumanReviewSignature(state.snapshot,entry,state.decisions[entry.id])});
 let state=await service.read();
 assert.deepEqual(pending(state).map(({need})=>need.text),['水杯','水杯，放在桌上']);
 assert.equal(new Set(pending(state).map(({need})=>need.id)).size,2);
 assert.equal(batch.promptReviewState(state,scope).published,2);
 const first=target(state,pending(state)[0]);
 await batch.resolvePromptMissingReferences({service,targets:[first,first],versionId:state.snapshot.versionId});
 state=await service.read();
 assert.deepEqual(pending(state).map(({need})=>need.text),['水杯，放在桌上']);
 assert.equal(batch.promptReviewState(state,scope).ready,false);
 await batch.resolvePromptMissingReferences({service,targets:pending(state).map(row=>target(state,row)),versionId:state.snapshot.versionId});
 assert.equal(batch.promptReviewState(await service.read(),scope).ready,true);
 assert.equal((await publish()).published,3);
 const shot=storyboardShots(shots[0]).find(p=>p.id==='p1');
 assert.equal(shot.sourceContent,edited.content);
 assert.deepEqual(shot.generationConfig.bindingAssetIds,['actor-asset']);
 assert.equal(shot.generationConfig.references[0].assetId,'actor-asset');
});
