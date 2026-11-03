import test from 'node:test';import assert from 'node:assert/strict';
import {createProductionAdapters,productionArtResumePlan} from '../src/v06/productionAdapters.js';
import {selectProductionReferences} from './productionReferenceSelection.js';
import {productionDefaults} from './productionFurnace.js';
import {newArtReview,editArtReview,reviewSceneSignature} from './artReview.js';
import {bindingSnapshot,proposeEntryBinding,linkedPromptBook} from './promptArtBinding.js';
function fixture(){
 const episodes=[1,2].map(n=>({id:'e'+n,episodeNumber:n,title:`第${n}集`,content:`${n}-1 客厅 日 内\n张三说话。`,prompts:[1,2].map(k=>({id:`p${n}${k}`,label:`${n}-1-${k}`,content:'【基础信息】\n人物：张三\n场景：客厅\n道具：无\n【镜头】\n张三说话。'}))}));
 const project={id:'collab',name:'验收剧',director_project_id:'director',episodes},assets=[{id:'person',category:'character',name:'【张三】'},{id:'room',category:'scene',name:'【客厅】'}].map(a=>({...a,images:[{id:a.id+'-img',url:`https://example.invalid/${a.id}.png`}]})),ledger={episodes:{}};
 for(const ep of episodes){let r=newArtReview(ep);r.scenes[0].items=assets.map(a=>({id:'r'+a.id,category:a.category,name:a.name,description:'清楚的外观',ready:true}));r.scenes[0].mappingReady=true;r=editArtReview(r,{type:'approve',sceneId:`${ep.episodeNumber}-1`},'u');r.published={[`${ep.episodeNumber}-1`]:{...structuredClone(r.scenes[0]),signature:reviewSceneSignature(r.scenes[0])}};ledger.episodes[ep.episodeNumber]=r;}
 const snapshot=bindingSnapshot(project,ledger,assets),decisions=Object.fromEntries(snapshot.entries.map(e=>[e.id,{...proposeEntryBinding(snapshot,e),confirmed:true}]));
 const state={directorProjects:[{...project,id:'director'}],mediaProfiles:[{id:'video',name:'渠道',kind:'video',model:'v',capabilities:{maxImages:8,durations:[30],ratios:['9:16'],resolutions:['480p']}}]},jobs=[],events=[];
 const run={id:crypto.randomUUID(),projectId:'director',collabProjectId:'collab',status:'running',config:{...productionDefaults(),mode:'semi',videoModel:JSON.stringify(['video','v']),endStage:'edit'},items:[],episodes:[]};
 const api={aiChat:async request=>{const data=JSON.parse(request.messages[1].content),quote=data.existing?.quote||'走吧。';return JSON.stringify({sampleOnly:!data.existing?.quote,evidence:data.scenes?.[0]?.source,quote,sampleQuote:quote+'大家都在等我们，别让他们等得太着急了。',language:'Chinese'});},collabGetProject:async()=>project,promptArtLoad:async()=>({enabled:true,snapshot,decisions}),collabListAssets:async()=>assets,artReviewLoadLocal:async()=>ledger,generationList:async()=>jobs,productionAudit:async p=>{events.push('audit:'+p.payload.label);return '{"approved":true}';},generationSubmit:async input=>{events.push('submit:'+input.shotLabel);const job={...input,id:crypto.randomUUID(),status:'success'};jobs.push(job);return job;},productionArchive:async p=>{events.push('archive:'+p.label);return {outputFile:p.label+'.mp4',sha256:'hash'};},productionPostStatus:async p=>{events.push(p.stage+':'+p.episode+(p.clipId?':'+p.clipId:''));return {status:'done',result:{file:'film.mp4'}};}};
 const accountId=crypto.randomUUID(),adapter=createProductionAdapters({api,getState:()=>state,getAccount:()=>({id:accountId}),setState:()=>{},getQuick:()=>({})}),ctx={run,guard:()=>{if(run.status!=='running')throw Error('paused');},checkpoint:async()=>{},notice:async()=>{}};
 return {adapter,ctx,run,state,jobs,events,api,ledger};
}

test('new projects with automatically created empty scene containers must read art inventory before voices',async()=>{
 const f=fixture();f.state.apiProfiles=[{id:'text',model:'mock'}];f.run.config.analysisProfileId='text';f.run.config.mode='auto';f.api.collabListProjects=async()=>[{id:'collab',director_project_id:'director'}];
 f.ledger.episodes=Object.fromEntries(f.state.directorProjects[0].episodes.map(ep=>[ep.episodeNumber,newArtReview(ep)]));f.api.artReviewSaveLocal=async()=>{};
 let artCalls=0;f.api.aiChat=async request=>{if(request.messages[0].content.includes('语音读取：'))return JSON.stringify({scenes:[{sceneId:JSON.parse(request.messages[1].content).episodeNumber+'-1',appearances:[],speakers:[]}]});artCalls++;throw Error('must-read-inventory');};
 await assert.rejects(f.adapter.information(f.ctx),/must-read-inventory/);assert(artCalls>0);
});

test('disabled automation voice adapter makes zero model or collaboration calls',async()=>{
 const f=fixture();f.api.collabGetProject=async()=>{throw Error('must not load voices');};
 assert.deepEqual(await f.adapter.voices(f.ctx),{skipped:true});
});

test('voice stage resolves model choice IDs, overlaps configured work and resumes first existing candidate',async()=>{
 const f=fixture();f.state.apiProfiles=[{id:'text',model:'mock'}];f.state.mediaProfiles.push({id:'audio',kind:'audio',model:'Qwen-VoiceDesign'});
 Object.assign(f.run.config,{mode:'auto',voiceEnabled:true,voiceConcurrency:2,voiceModelId:JSON.stringify(['audio','Qwen-VoiceDesign']),voiceCompletionProfileId:'text',voiceDistributionProfileId:'text'});
 f.api.collabListProjects=async()=>[{id:'collab',director_project_id:'director'}];
 for(const ep of f.state.directorProjects[0].episodes)f.ledger.episodes[ep.episodeNumber].voiceAnalysis={schema:2,prepared:true,sourceContent:ep.content,scenes:[{sceneId:ep.episodeNumber+'-1',appearances:[],speakers:[]}]};
 f.ledger.voiceProfiles=Object.fromEntries(['a','b','c'].map(key=>[key,{manual:{name:key,characterName:key,sceneIds:['1-1'],quote:'走吧。'},...(key==='a'?{candidates:[{id:'first',url:'data:audio/wav;base64,UklGRg=='},{id:'later',url:'data:audio/wav;base64,UklGRg=='}]}:{})}]));
 let live=0,peak=0,generated=0;f.api.audioGenerate=async request=>{assert.equal(request.model,'Qwen-VoiceDesign');live++;peak=Math.max(peak,live);await new Promise(r=>setTimeout(r,10));live--;generated++;return {id:'s'+generated,url:'data:audio/wav;base64,UklGRg=='};};f.api.audioResultRetain=async({id})=>({filePath:'D:/retained/'+id+'.wav'});f.api.artReviewSaveLocal=async({data})=>{Object.assign(f.ledger,structuredClone(data));};
 const result=await f.adapter.voices(f.ctx);assert.equal(result.partial,false);assert.equal(generated,3);assert.equal(peak,2);assert.equal(f.ledger.voiceProfiles.a.confirmed.id,'first');assert(f.ledger.voiceProfiles.b.confirmed);assert(f.ledger.voiceProfiles.c.confirmed);
 await f.adapter.voices(f.ctx);assert.equal(generated,3,'confirmed voices must never regenerate');
});

test('pausing mid-voice batch never marks incomplete voices complete and retains completed samples for resume',async()=>{
 const f=fixture();f.state.apiProfiles=[{id:'text',model:'mock'}];f.state.mediaProfiles.push({id:'audio',kind:'audio',model:'Qwen-VoiceDesign'});
 Object.assign(f.run.config,{mode:'auto',voiceEnabled:true,voiceConcurrency:1,voiceModelId:JSON.stringify(['audio','Qwen-VoiceDesign']),voiceCompletionProfileId:'text',voiceDistributionProfileId:'text'});
 f.api.collabListProjects=async()=>[{id:'collab',director_project_id:'director'}];
 for(const ep of f.state.directorProjects[0].episodes)f.ledger.episodes[ep.episodeNumber].voiceAnalysis={schema:2,prepared:true,sourceContent:ep.content,scenes:[{sceneId:ep.episodeNumber+'-1',appearances:[],speakers:[]}]};
 f.ledger.voiceProfiles=Object.fromEntries(['a','b','c'].map(key=>[key,{manual:{name:key,characterName:key,sceneIds:['1-1'],quote:'走吧。'}}]));
 let generated=0;f.api.audioGenerate=async()=>{generated++;if(generated===1){f.run.status='paused';await f.adapter.pause(f.run);}return {id:'s'+generated,url:'data:audio/wav;base64,UklGRg=='};};f.api.audioResultRetain=async({id})=>({filePath:'D:/retained/'+id+'.wav'});f.api.artReviewSaveLocal=async({data})=>{Object.assign(f.ledger,structuredClone(data));};
 await f.adapter.voices(f.ctx);f.run.status='running';const checked=await f.adapter.monitor(f.ctx);assert.equal(checked.voices,false,'unfinished cards must remain pending');
 assert.equal(Object.values(f.ledger.voiceProfiles).reduce((n,p)=>n+(p.candidates?.length||0),0),1,'the in-flight result is retained after pause');
 await f.adapter.voices(f.ctx);assert.equal(generated,4,'resume adopts first completed result without generating it again');assert(['a','b','c'].every(k=>f.ledger.voiceProfiles[k].confirmed));
});

test('video failure uses configured primary/fallback attempts, never redoes successful clips',async()=>{const f=fixture();f.run.config.endStage='archive';f.run.config.videoAttempts=2;f.run.config.videoFallbackEnabled=true;f.run.config.fallbackVideoAttempts=2;f.run.config.fallbackVideoModel=JSON.stringify(['backup','b']);f.state.mediaProfiles.push({id:'backup',name:'备用',kind:'video',model:'b',capabilities:{maxImages:8,durations:[30],ratios:['9:16'],resolutions:['480p']}});const seen=[];f.api.generationSubmit=async input=>{seen.push([input.shotLabel,input.profileId]);const job={...input,id:crypto.randomUUID(),status:input.profileId==='backup'?'success':'failed',error:input.profileId==='backup'?'':'generation failed'};f.jobs.push(job);return job;};await f.adapter.videos(f.ctx);assert.equal(f.run.items.filter(i=>i.status==='downloaded').length,4);assert.deepEqual(seen.filter(i=>i[0]==='1-1-1').map(i=>i[1]),['video','video','backup']);const count=seen.length;await f.adapter.videos(f.ctx);assert.equal(seen.length,count);});
test('actual fallback submissions use independent parameters and concurrency in either direction',async()=>{
 for(const [mainLimit,backupLimit] of [[3,1],[1,3]]){
  const f=fixture();Object.assign(f.run.config,{endStage:'archive',videoAttempts:1,videoResolution:'720p',videoConcurrency:mainLimit,videoFallbacks:[{id:'backup-step',modelId:JSON.stringify(['backup','b']),attempts:1,ratio:'16:9',videoDuration:5,videoResolution:'1080p',videoConcurrency:backupLimit}]});
  f.state.mediaProfiles[0].capabilities.resolutions=['720p'];f.state.mediaProfiles.push({id:'backup',kind:'video',model:'b',capabilities:{maxImages:8,durations:[5],ratios:['16:9'],resolutions:['1080p']}});
  const live={video:0,backup:0},peak={video:0,backup:0},sent=[];
  f.api.generationSubmit=async input=>{sent.push(input);const key=input.profileId;live[key]++;peak[key]=Math.max(peak[key],live[key]);await new Promise(r=>setTimeout(r,key==='backup'?50:5));live[key]--;const job={...input,id:crypto.randomUUID(),status:key==='backup'?'success':'failed',error:key==='backup'?'':'generation failed'};f.jobs.push(job);return job;};
  await f.adapter.videos(f.ctx);assert.equal(f.run.items.filter(i=>i.status==='downloaded').length,4);
  assert.equal(peak.video,mainLimit);assert.equal(peak.backup,backupLimit);
  for(const input of sent.filter(p=>p.profileId==='backup')){assert.equal(input.ratio,'16:9');assert.equal(input.duration,5);assert.equal(input.resolution,'1080p');assert.equal(input.workflowVideoPolicyKey,'fallback:backup-step');}
  for(const input of sent.filter(p=>p.profileId==='video')){assert.equal(input.ratio,'9:16');assert.equal(input.duration,30);assert.equal(input.resolution,'720p');}
 }
});
test('semi mode trusts prompt content and hands off only complete episodes',async()=>{
 const f=fixture();await f.adapter.videos(f.ctx);assert.equal(f.run.name,'验收剧');assert.equal(f.run.items.length,4);assert(f.run.episodes.every(e=>e.stage==='done'));
 assert.equal(f.events.filter(e=>e.startsWith('audit:')).length,0);
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

test('each downloaded clip starts upscale before the rest of its episode downloads',async()=>{
 const f=fixture();f.run.config.videoConcurrency=1;await f.adapter.videos(f.ctx);
 const first=f.events.findIndex(e=>e.startsWith('upscale:1:'));
 assert(first>f.events.indexOf('archive:1-1-1'));assert(first<f.events.indexOf('archive:1-1-2'));
 assert(f.events.indexOf('edit:1')>f.events.indexOf('archive:1-1-2'));
});

test('a ready prompt submits before remaining images finish; missing references wait and resume',async()=>{
 const f=fixture();f.run.config.endStage='archive';const saved=await f.api.promptArtLoad(),assets=await f.api.collabListAssets(),room=assets.find(a=>a.id==='room'),images=room.images;room.images=[];
 saved.decisions.p11.needs=saved.decisions.p11.needs.filter(n=>n.category==='character');
 f.ctx.imagesPending=true;f.ctx.materialRevision=0;let first=false;
 const submit=f.api.generationSubmit;f.api.generationSubmit=async input=>{if(!first){assert.equal(input.shotLabel,'1-1-1');assert.equal(f.ctx.imagesPending,true);first=true;}return submit(input);};
 f.ctx.waitForMaterials=async()=>{await new Promise(r=>setImmediate(r));assert(first,'ready work must not wait for the whole image stage');room.images=images;f.ctx.materialRevision++;f.ctx.imagesPending=false;};
 await f.adapter.videos(f.ctx);assert.equal(f.jobs.length,4);assert(f.run.episodes.every(e=>e.stage==='done'));
});

test('missing references never erase unknown paid submission protection',async()=>{
 const f=fixture();f.run.config.endStage='archive';const assets=await f.api.collabListAssets(),original=assets.map(a=>a.images);assets.forEach(a=>a.images=[]);
 f.run.items=f.state.directorProjects[0].episodes.flatMap(e=>e.prompts.map(p=>({id:'linked:collab:'+p.id,label:p.label,episode:Number(p.label[0]),status:p.id==='p11'?'uncertain':'queued'})));
 await f.adapter.videos(f.ctx);assert.equal(f.run.items[0].status,'uncertain');assets.forEach((a,i)=>a.images=original[i]);await f.adapter.videos(f.ctx);assert(!f.events.includes('submit:1-1-1'));assert.equal(f.run.items[0].status,'uncertain');
});
test('a slow active video does not block a new ready prompt in a free slot',{timeout:2500},async()=>{
 const f=fixture();f.run.config.endStage='archive';f.run.config.videoConcurrency=2;const saved=await f.api.promptArtLoad(),assets=await f.api.collabListAssets(),room=assets.find(a=>a.id==='room'),images=room.images;room.images=[];
 for(const id of ['p11','p12'])saved.decisions[id].needs=saved.decisions[id].needs.filter(n=>n.category==='character');
 f.ctx.imagesPending=true;f.ctx.materialRevision=0;f.ctx.waitForMaterials=()=>new Promise(r=>setTimeout(r,10));let release;const slow=new Promise(r=>release=r),submit=f.api.generationSubmit;
 f.api.generationSubmit=async input=>{if(input.shotLabel==='1-1-1')await slow;if(input.shotLabel==='1-1-2'){room.images=images;f.ctx.materialRevision++;f.ctx.imagesPending=false;}if(input.shotLabel==='2-1-1')release();return submit(input);};
 await f.adapter.videos(f.ctx);assert.equal(f.jobs.length,4);assert(f.events.indexOf('submit:2-1-1')<f.events.indexOf('submit:1-1-1'));
});

test('permanently skipped image no longer blocks video; remaining image references are sent',async()=>{
 const f=fixture(),assets=await f.api.collabListAssets();assets.find(a=>a.id==='person').images=[];f.run.imageItems={person:{status:'skipped',skipReason:'failed after repair'}};f.run.config.endStage='archive';
 const submit=f.api.generationSubmit;f.api.generationSubmit=async input=>{assert(!input.references.some(r=>r.assetId==='person'));assert(input.references.some(r=>r.assetId==='room'));assert.match(input.prompt,/未附参考图说明/);return submit(input);};
 await f.adapter.videos(f.ctx);assert(f.run.items.every(i=>i.status==='downloaded'));assert(f.run.episodes.every(e=>e.stage==='done'));
});

test('episode scope submits only target episode and still completes its post production',async()=>{const f=fixture();f.run.executionScope={episodes:[1],until:'edit',pauseAfter:true};await f.adapter.videos(f.ctx);assert(f.events.filter(e=>e.startsWith('submit:')).every(e=>e.startsWith('submit:1-')));assert.equal(f.events.filter(e=>e.startsWith('submit:')).length,2);assert.equal(f.run.episodes.find(e=>e.number===1).stage,'done');assert.notEqual(f.run.episodes.find(e=>e.number===2).stage,'done');});


test('first-episode adjustment generates only its missing clip, switches fallback then upscales and edits without stopping',async()=>{
 const f=fixture();Object.assign(f.run.config,{videoAttempts:1,videoConcurrency:1,videoFallbacks:[{id:'fallback',modelId:JSON.stringify(['backup','b']),attempts:1,ratio:'9:16',videoDuration:30,videoResolution:'480p',videoConcurrency:1}]});f.state.mediaProfiles.push({id:'backup',kind:'video',model:'b',capabilities:{maxImages:8,durations:[30],ratios:['9:16'],resolutions:['480p']}});
 const {snapshot,decisions}=await f.api.promptArtLoad();const book=linkedPromptBook(snapshot,decisions);f.run.items=book.entries.map(e=>({id:e.id,label:e.label,episode:e.episode,status:e.label==='1-1-2'?'downloaded':e.episode===2?'submitted':'queued',...(e.label==='1-1-2'?{outputFile:'keep.mp4',sha256:'keep-hash'}:{}),...(e.episode===2?{jobId:'paid-'+e.id}:{})}));
 f.run.executionScope={episodes:[1],until:'edit',pauseAfter:true};f.run.planRevision=1;f.run.operatorInstructions=[{text:'先把第一集做出来，超分并剪辑'}];const sent=[];
 f.api.generationSubmit=async input=>{sent.push([input.shotLabel,input.profileId]);const job={...input,id:crypto.randomUUID(),status:input.profileId==='video'?'failed':'success',error:input.profileId==='video'?'generation failed':''};f.jobs.push(job);return job;};
 await f.adapter.videos(f.ctx);assert.equal(f.run.status,'running');assert.deepEqual(sent,[['1-1-1','video'],['1-1-1','backup']]);assert.equal(f.run.episodes.find(e=>e.number===1).stage,'done');assert.equal(f.run.items.find(i=>i.label==='1-1-2').outputFile,'keep.mp4');assert(f.run.items.filter(i=>i.episode===2).every(i=>i.jobId.startsWith('paid-')&&i.status==='submitted'));assert(f.events.includes('edit:1'));assert(!f.events.includes('edit:2'));assert.equal(f.events.filter(e=>e==='archive:1-1-1').length,1);
});

test('live scope narrowing while a generation is in flight preserves that job and stops later episodes from dispatch',async()=>{const f=fixture();f.run.config.videoConcurrency=1;f.run.config.endStage='archive';const submit=f.api.generationSubmit;let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);f.api.generationSubmit=async input=>{if(input.shotLabel==='1-1-1'){entered();await gate;}return submit(input);};const work=f.adapter.videos(f.ctx);await started;f.run.executionScope={episodes:[1],until:'archive'};f.run.planRevision=1;release();await work;assert.equal(f.run.items.filter(i=>i.episode===1&&i.status==='downloaded').length,2);assert.equal(f.events.filter(e=>e.startsWith('submit:2')).length,0);assert.equal(f.run.status,'running');});
