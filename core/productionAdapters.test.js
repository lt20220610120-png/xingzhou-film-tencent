import test from 'node:test';import assert from 'node:assert/strict';
import {createProductionAdapters,productionArtResumePlan} from '../src/v06/productionAdapters.js';
import {selectProductionReferences} from './productionReferenceSelection.js';
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
 const accountId=crypto.randomUUID(),adapter=createProductionAdapters({api,getState:()=>state,getAccount:()=>({id:accountId}),setState:()=>{},getQuick:()=>({})}),ctx={run,guard:()=>{if(run.status!=='running')throw Error('paused');},checkpoint:async()=>{},notice:async()=>{}};
 return {adapter,ctx,run,state,jobs,events,api,ledger};
}
test('semi mode invokes Agent per clip and hands off only complete episodes in numeric order',async()=>{
 const f=fixture();await f.adapter.videos(f.ctx);assert.equal(f.run.name,'验收剧');assert.equal(f.run.items.length,4);assert(f.run.episodes.every(e=>e.stage==='done'));
 assert.equal(f.events.filter(e=>e.startsWith('audit:')).length,4);
 for(const n of [1,2])assert(f.events.indexOf('upscale:'+n)>f.events.indexOf(`archive:${n}-1-2`));
 assert(f.events.indexOf('edit:2')>f.events.indexOf('edit:1'));
 const before=f.jobs.length;await f.adapter.videos(f.ctx);assert.equal(f.jobs.length,before);
});
test('video resume lists existing tasks once and never resubmits a previously archived clip',async()=>{const f=fixture();let lists=0;f.api.generationList=async()=>{lists++;return f.jobs;};await f.adapter.videos(f.ctx);assert.equal(lists,1);const before=f.events.filter(e=>e.startsWith('submit:')).length;f.run.items[0].status='uncertain';await f.adapter.videos(f.ctx);assert.equal(lists,2);assert.equal(f.events.filter(e=>e.startsWith('submit:')).length,before);assert.equal(f.run.items[0].status,'downloaded');});
test('director and collaboration episode identities stay distinct without invalidating saved references',async()=>{const f=fixture();f.state.directorProjects[0].episodes=f.state.directorProjects[0].episodes.map(e=>({...e,id:'director-'+e.id}));await f.adapter.videos(f.ctx);assert.equal(f.jobs.length,4);assert(f.run.items.every(i=>i.status==='downloaded'));});
test('confirmed video funding rejection can submit after recharge while retaining failed job history',async()=>{const f=fixture();f.jobs.push({id:'empty-funds',status:'failed',error:'insufficient_quota',workflowRunId:f.run.id,workflowItemId:'linked:collab:p11'});await f.adapter.videos(f.ctx);const item=f.run.items.find(i=>i.id==='linked:collab:p11');assert.equal(item.status,'downloaded');assert.equal(item.previousFailedJobs[0].id,'empty-funds');assert.equal(f.events.filter(e=>e==='submit:1-1-1').length,1);});
test('known pre-submit reference validation failure remains retryable and never becomes an unknown paid submission',async()=>{const f=fixture(),submit=f.api.generationSubmit;let once=true;f.api.generationSubmit=async input=>{if(input.shotLabel==='1-1-1'&&once){once=false;throw Error('前置引用核验失败，尚未提交生成：网络暂不可用');}return submit(input);};await f.adapter.videos(f.ctx);assert.equal(f.run.items[0].status,'blocked');await f.adapter.videos(f.ctx);assert.equal(f.run.items[0].status,'downloaded');assert.equal(f.events.filter(e=>e==='submit:1-1-1').length,1);});
test('read-only monitor never creates or synchronizes a collaboration project',async()=>{const f=fixture();f.api.collabListProjects=async()=>[];f.api.collabCreateProject=async()=>{throw Error('must not create');};f.api.collabUpdateProject=async()=>{throw Error('must not sync');};const result=await f.adapter.monitor({...f.ctx,readOnly:true});assert.equal(result.art,false);assert.equal(result.images,false);assert.equal(f.run.monitor.art.summary.scenes,2);});
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
test('automatic publication uses ready scene inventory despite missing separate prompt review marks',async()=>{const f=fixture();f.run.config.mode='auto';delete f.ledger.episodes[1].published['1-1'];f.ledger.episodes[1].scenes[0].approval=null;f.api.artReviewSaveLocal=async({data})=>{f.ledger.episodes=data.episodes;};const remote=new Map();let published=0;f.api.collabArtReviewSave=async p=>{const record={...p.data,version:(p.baseVersion||0)+1};remote.set(p.episodeNumber,record);return record;};f.api.collabArtReviewPublish=async p=>{published++;const record=remote.get(p.episodeNumber);for(const id of p.sceneIds)record.published[id]={signature:reviewSceneSignature(record.scenes.find(s=>s.id===id))};return {...record,version:record.version+1};};const result=await f.adapter.art(f.ctx);assert.equal(published,1);assert.equal(result.partial,false);assert.equal(f.run.monitor.art.summary.published,2);});

test('over-limit automation invokes Agent selection and audits the exact nine-reference-compatible subset',async()=>{const f=fixture();f.state.mediaProfiles[0].capabilities.maxImages=1;let plans=0;f.api.productionWork=async p=>{assert.equal(p.task,'reference-plan');plans++;const data=JSON.parse(p.messages[1].content);return JSON.stringify({selectedReferenceIds:[data.references.find(r=>r.category==='character').id],reason:'本模型限1张，保留主角，场景文字描述'});};const submit=f.api.generationSubmit;f.api.generationSubmit=async p=>{const final=selectProductionReferences(p);assert.equal(final.references.length,1);assert.equal(final.references[0].category,'character');assert(!final.prompt.includes('@image2'));return submit({...p,referenceVerification:final.referenceVerification});};await f.adapter.videos(f.ctx);assert.equal(plans,4);assert.equal(f.jobs.length,4);assert(f.run.items.every(i=>i.referenceVerification.selected.length===1));});
