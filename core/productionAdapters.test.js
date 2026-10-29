import test from 'node:test';import assert from 'node:assert/strict';
import {createProductionAdapters,productionArtResumePlan} from '../src/v06/productionAdapters.js';
import {productionDefaults} from './productionFurnace.js';
import {newArtReview,editArtReview,reviewSceneSignature} from './artReview.js';
import {bindingSnapshot,proposeEntryBinding} from './promptArtBinding.js';
function fixture(){
 const episodes=[1,2].map(n=>({id:'e'+n,episodeNumber:n,title:`第${n}集`,content:`${n}-1 客厅 日 内\n张三说话。`,prompts:[1,2].map(k=>({id:`p${n}${k}`,label:`${n}-1-${k}`,content:'【基础信息】\n人物：张三\n场景：客厅\n道具：无\n【镜头】\n张三说话。'}))}));
 const project={id:'collab',name:'验收剧',director_project_id:'director',episodes},assets=[{id:'person',category:'character',name:'【张三】'},{id:'room',category:'scene',name:'【客厅】'}].map(a=>({...a,images:[{id:a.id+'-img',url:`https://example.invalid/${a.id}.png`}]})),ledger={episodes:{}};
 for(const ep of episodes){let r=newArtReview(ep);r.scenes[0].items=assets.map(a=>({id:'r'+a.id,category:a.category,name:a.name,description:'清楚的外观',ready:true}));r.scenes[0].mappingReady=true;r=editArtReview(r,{type:'approve',sceneId:`${ep.episodeNumber}-1`},'u');r.published={[`${ep.episodeNumber}-1`]:{...structuredClone(r.scenes[0]),signature:reviewSceneSignature(r.scenes[0])}};ledger.episodes[ep.episodeNumber]=r;}
 const snapshot=bindingSnapshot(project,ledger,assets),decisions=Object.fromEntries(snapshot.entries.map(e=>[e.id,{...proposeEntryBinding(snapshot,e),confirmed:true}]));
 const state={directorProjects:[{...project,id:'director'}],mediaProfiles:[{id:'video',name:'渠道',kind:'video',model:'v',capabilities:{maxImages:8,durations:[30],ratios:['9:16'],resolutions:['480p']}}]},jobs=[],events=[];
 const run={id:crypto.randomUUID(),projectId:'director',collabProjectId:'collab',status:'running',config:{...productionDefaults(),mode:'semi',videoModel:JSON.stringify(['video','v']),endStage:'edit'},items:[],episodes:[]};
 const api={collabGetProject:async()=>project,promptArtLoad:async()=>({enabled:true,snapshot,decisions}),collabListAssets:async()=>assets,artReviewLoadLocal:async()=>ledger,generationList:async()=>jobs,productionAudit:async p=>{events.push('audit:'+p.payload.label);return '{"approved":true}';},generationSubmit:async input=>{events.push('submit:'+input.shotLabel);const job={...input,id:crypto.randomUUID(),status:'success'};jobs.push(job);return job;},productionArchive:async p=>{events.push('archive:'+p.label);return {outputFile:p.label+'.mp4',sha256:'hash'};},productionPostStatus:async p=>{events.push(p.stage+':'+p.episode);return {status:'done',result:{file:'film.mp4'}};}};
 const adapter=createProductionAdapters({api,getState:()=>state,getAccount:()=>({id:'u'}),setState:()=>{},getQuick:()=>({})}),ctx={run,guard:()=>{if(run.status!=='running')throw Error('paused');},checkpoint:async()=>{},notice:async()=>{}};
 return {adapter,ctx,run,state,jobs,events,api,ledger};
}
test('semi mode invokes Agent per clip and hands off only complete episodes in numeric order',async()=>{
 const f=fixture();await f.adapter.videos(f.ctx);assert.equal(f.run.name,'验收剧');assert.equal(f.run.items.length,4);assert(f.run.episodes.every(e=>e.stage==='done'));
 assert.equal(f.events.filter(e=>e.startsWith('audit:')).length,4);
 for(const n of [1,2])assert(f.events.indexOf('upscale:'+n)>f.events.indexOf(`archive:${n}-1-2`));
 assert(f.events.indexOf('edit:2')>f.events.indexOf('edit:1'));
 const before=f.jobs.length;await f.adapter.videos(f.ctx);assert.equal(f.jobs.length,before);
});
test('unknown submitting task stays uncertain and does not poll forever or submit again',async()=>{
 const f=fixture();const entry='linked:collab:p11';f.jobs.push({id:'interrupted',status:'submitting',workflowRunId:f.run.id,workflowItemId:entry});await f.adapter.videos(f.ctx);
 assert.equal(f.run.items.find(i=>i.id===entry).status,'uncertain');assert(!f.events.includes('submit:1-1-1'));assert(!f.events.includes('upscale:1'));assert(f.events.includes('upscale:2'));
});
test('missing scene prompts stop a partial episode from being considered complete',async()=>{
 const f=fixture();f.state.directorProjects[0].episodes[0].content+='\n1-2 街道 夜 外\n张三离开。';await assert.rejects(f.adapter.videos(f.ctx),/未生成提示词/);assert.equal(f.jobs.length,0);
});

test('existing published art survives auto resume with deleted collab duplicates and without model analysis',async()=>{
 const f=fixture();delete f.run.collabProjectId;f.run.config.mode='auto';f.api.collabListProjects=async()=>[{id:'trash',director_project_id:'director',deleted_at:'now'},{id:'collab',director_project_id:'director'}];f.api.artReviewSaveLocal=async()=>{};
 await f.adapter.art(f.ctx);assert.equal(f.run.collabProjectId,'collab');assert.equal(f.run.reusedExisting.art,true);assert.equal(f.events.length,0);assert(f.ledger.episodes[1].published['1-1']);
});

test('art resume targets only missing inventory and pending distribution, preserving completed episodes',async()=>{
 const f=fixture(),project=f.state.directorProjects[0],binding=await f.api.promptArtLoad();
 assert.deepEqual(productionArtResumePlan(project,f.ledger,binding),{inventory:[],mapOnly:[]});
 delete f.ledger.episodes[2];assert.deepEqual(productionArtResumePlan(project,f.ledger,binding),{inventory:[2],mapOnly:[]});
 delete f.ledger.episodes[1].published['1-1'];assert.deepEqual(productionArtResumePlan(project,f.ledger,binding),{inventory:[2],mapOnly:[1]});
});
