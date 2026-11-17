import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './promptDistribution.fixtures.js';
import {createPromptDistributionService} from './promptDistributionService.js';
import {promptMaterialOverview} from './promptMaterialStatus.js';
import {promptHumanReviewSignature} from './promptReviewBatch.js';
import {entryBindingSignature,saveDistribution} from './promptArtBinding.js';
async function setup(){const f=fixture(),service=createPromptDistributionService({...f,projectId:f.project.id,accountId:'u'});await service.run('p1',{profile:{id:'m'}});return {f,service,state:await service.read()};}
test('scene published never implies prompt association; partial results identify every unresolved prompt',async()=>{
 const {state}=await setup();state.ctx.ledger.episodes[1].published={'1-1':{signature:'old'}};
 const view=promptMaterialOverview(state);assert.equal(view.total,3);assert.equal(view.associated,1);assert.equal(view.ready,0);assert.equal(view.rows.find(r=>r.entry.id==='p2').status,'unlinked');assert.equal(view.rows[0].status,'media');assert(view.rows[0].issues.some(s=>s.includes('张三')));
});
test('explicit no-reference choice is saved association, not a missing picture; publication and stale source remain separate',async()=>{
 const {state}=await setup(),e=state.snapshot.entries[0];state.decisions.p1=saveDistribution(state.snapshot,e,{...state.decisions.p1,needs:state.decisions.p1.needs.map(n=>({...n,visibility:'excluded',locked:true,reason:'无需参考图',skipReference:true}))});
 let row=promptMaterialOverview(state).rows[0];assert.equal(row.status,'unpublished');assert.equal(row.noReference,true);
 state.saved.versions[state.snapshot.versionId].reviews={p1:{signature:promptHumanReviewSignature(state.snapshot,e,state.decisions.p1),published:true}};
 row=promptMaterialOverview(state).rows[0];assert.equal(row.status,'ready');assert(row.ready);
 state.snapshot.entries[0]={...e,prompt:e.prompt+' 新内容'};row=promptMaterialOverview(state).rows[0];assert.equal(row.published,false);assert.equal(row.status,'stale');
});
test('failure, expired running claim and queue stage remain visible with exact prompt identity',async()=>{
 const {state}=await setup(),key=state.snapshot.versionId+':';state.saved.sceneDistributionAttempts[key+'p2']={status:'failed',error:'云端未确认本次保存'};state.saved.sceneDistributionAttempts[key+'p3']={status:'running',startedAt:1};
 let view=promptMaterialOverview(state);assert.equal(view.rows[1].status,'failed');assert.equal(view.rows[2].status,'interrupted');assert.equal(view.scenes[0].total,3);
 view=promptMaterialOverview(state,{entryTasks:{p2:{phase:'saving',versionId:state.snapshot.versionId},p3:{phase:'queued',versionId:state.snapshot.versionId,queuePosition:2}}});assert.equal(view.rows[1].label,'保存中');assert.equal(view.rows[2].label,'排队第 2 位');
});
test('missing card is distinct from a linked card whose image is unavailable',async()=>{
 const {state}=await setup(),e=state.snapshot.entries[0];state.decisions.p1=saveDistribution(state.snapshot,e,{...state.decisions.p1,needs:[...state.decisions.p1.needs,{id:'missing',text:'手机',category:'prop',visibility:'visible',reason:'出现',cardUid:null,start:0,end:1}]});
 const row=promptMaterialOverview(state).rows[0];assert.equal(row.status,'missing');assert(row.issues.some(s=>s.includes('手机')));assert.equal(row.associated,false);assert.equal(row.counts.character,1);
});
