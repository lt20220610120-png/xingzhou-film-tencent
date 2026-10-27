import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './promptDistribution.fixtures.js';
import {createPromptDistributionService} from './promptDistributionService.js';
import {promptReviewState,reviewPromptScope,skipPromptNeed} from './promptReviewBatch.js';
import {saveBindingVersion} from './promptBindingVersions.js';

test('empty, pending, missing and rule-only results cannot be bulk reviewed or published',async()=>{
 const f=fixture(),service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'}),scope={sceneId:'1-1'};let writes=0;
 const store={updateMany:async()=>{writes++},publish:async()=>{writes++}};
 assert.equal(promptReviewState(await service.read(),scope).ready,false);
 await assert.rejects(reviewPromptScope({service,store,scope,actor:'u',action:'approve-publish'}),/分发/);assert.equal(writes,0);
 await service.run('p1',{profile:{id:'m'}});assert.equal(promptReviewState(await service.read(),scope).ready,false);
});
test('whole-scene review/publication covers all prompts, retains other versions and survives new images',async()=>{
 const f=fixture(),service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'}),scope={sceneId:'1-1'},published=[];
 await Promise.all(['p1','p2','p3'].map(id=>service.run(id,{profile:{id:'m'}})));
 await assert.rejects(reviewPromptScope({service,scope,actor:'u',action:'publish'}),/人工核实/);
 const state=await service.read();assert.equal(promptReviewState(state,scope).ready,true);
 const store={updateMany:async changes=>assert.equal(changes.length,1),publish:async(n,ids)=>published.push([n,ids])};
 await reviewPromptScope({service,store,scope,actor:'u',action:'approve-publish'});
 assert.deepEqual(published,[[1,['1-1']]]);const after=promptReviewState(await service.read(),scope);assert.equal(after.approved,3);assert.equal(after.published,3);
 f.assets.push({id:'asset',category:'character',name:'【张三】',images:[{id:'i',url:'https://test/image.png'}]});
 assert.equal(promptReviewState(await service.read(),scope).approved,3,'generating images must not undo human review');
 f.project.episodes[0].prompts[0].content+='新动作';assert.equal(promptReviewState(await service.read(),scope).ready,false);
});
test('a model-reported missing foundation entity blocks bulk review despite a saved reply',async()=>{
 const f=fixture(),original=f.api.aiChat;f.api.aiChat=async p=>{const data=JSON.parse(await original(p));data.missing=[{category:'prop',text:'水杯',reason:'基础设定中的水杯不在本场清单'}];return JSON.stringify(data)};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});await Promise.all(['p1','p2','p3'].map(id=>service.run(id,{profile:{id:'m'}})));
 const state=promptReviewState(await service.read(),{});assert.equal(state.ready,false);assert(state.problems.some(message=>message.includes('水杯')));
 await assert.rejects(reviewPromptScope({service,scope:{},actor:'u'}),/分发尚未完成/);
});
test('a human can skip a one-off missing reference and unblock batch review',async()=>{
 const f=fixture(),original=f.api.aiChat;f.api.aiChat=async p=>{const data=JSON.parse(p.messages[1].content),raw=JSON.parse(await original(p));if(data.label==='1-1-1')raw.missing=[{category:'prop',text:'水杯',reason:'基础设定提到但本场清单没有'}];return JSON.stringify(raw)};
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});await Promise.all(['p1','p2','p3'].map(id=>service.run(id,{profile:{id:'m'}})));
 let state=await service.read(),before=promptReviewState(state,{sceneId:'1-1'});assert.equal(before.pendingMissing.length,1);assert.equal(before.ready,false);
 const entry=state.snapshot.entries.find(row=>row.id==='p1'),need=state.decisions.p1.needs.find(row=>row.text==='水杯');assert(need);
 await service.mutate(state.snapshot.versionId,current=>{const next=skipPromptNeed(current.decisions.p1,need.id);return saveBindingVersion(current.saved,current.snapshot,{...current.decisions,p1:next});});
 state=await service.read();const after=promptReviewState(state,{sceneId:'1-1'});assert.equal(after.pendingMissing.length,0);assert.equal(after.ready,true);
 const published=[];await reviewPromptScope({service,store:{updateMany:async()=>{},publish:async(n,ids)=>published.push([n,ids])},scope:{sceneId:'1-1'},actor:'u',action:'approve-publish'});assert.deepEqual(published,[[1,['1-1']]]);
});
test('an empty skipped source prompt blocks its scene and episode rather than publishing the remaining subset',async()=>{
 const f=fixture();f.project.episodes[0].prompts[2].content='';
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});await Promise.all(['p1','p2'].map(id=>service.run(id,{profile:{id:'m'}})));
 assert.equal(promptReviewState(await service.read(),{episode:1}).ready,false);
 await assert.rejects(reviewPromptScope({service,scope:{sceneId:'1-1'},actor:'u',action:'approve-publish'}),/空|无效|明确身份/);
});
test('a malformed prompt in a different scene blocks its episode but not an independently completed scene',async()=>{
 const f=fixture();Object.assign(f.project.episodes[0].prompts[2],{label:'1-2-1',content:''});
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});await Promise.all(['p1','p2'].map(id=>service.run(id,{profile:{id:'m'}})));
 assert.equal(promptReviewState(await service.read(),{sceneId:'1-1'}).ready,true);assert.equal(promptReviewState(await service.read(),{episode:1}).ready,false);
});

test('a complete episode publishes while later episodes are pending or their reading was stopped',async()=>{
 const f=fixture();f.project.episodes.push({id:'ep2',episodeNumber:2,content:'2-1 日 内\n张三喝水。',prompts:[{id:'later',label:'2-1-1',content:f.project.episodes[0].prompts[0].content}]});
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});
 await Promise.all(['p1','p2','p3'].map(id=>service.run(id,{profile:{id:'m'}})));
 await service.stop();const state=await service.read();assert.equal(promptReviewState(state,{episode:1}).ready,true);assert.equal(promptReviewState(state,{}).ready,false);
 const published=[];await reviewPromptScope({service,store:{updateMany:async()=>{},publish:async n=>published.push(n)},scope:{episode:1},actor:'u',action:'approve-publish'});
 assert.deepEqual(published,[1]);
});
test('global review and publish processes ready prompts without blocking on later pending episodes',async()=>{
 const f=fixture();f.project.episodes.push({id:'ep2',episodeNumber:2,content:'2-1 日 内\n张三喝水。',prompts:[{id:'later',label:'2-1-1',content:f.project.episodes[0].prompts[0].content}]});
 const service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});await Promise.all(['p1','p2','p3'].map(id=>service.run(id,{profile:{id:'m'}})));
 const before=promptReviewState(await service.read(),{});assert.equal(before.ready,false);assert.equal(before.reviewableEntries.length,3);
 const published=[];const result=await reviewPromptScope({service,store:{updateMany:async()=>{},publish:async(n,ids)=>published.push([n,ids])},scope:{},actor:'u',action:'approve-publish'});
 assert.equal(result.count,3);assert.deepEqual(published,[[1,['1-1']]]);const after=promptReviewState(await service.read(),{});assert.equal(after.approved,3);assert.equal(after.entries.length,4);assert.equal(after.ready,false);
});
