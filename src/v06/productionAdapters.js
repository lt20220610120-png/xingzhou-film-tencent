import {productionCoverage,productionExpectedPrompts,imageFailureKind,completeEpisode,productionVideoIssues} from '../../core/productionFurnace.js';
import {getArtDistributionController} from '../../core/artAnalysisPipeline.js';
import {runContinuousArtAnalysis} from '../../core/artContinuousAnalysis.js';
import {getArtReviewStore} from '../../core/artReviewPersistence.js';
import {getPromptDistributionService} from '../../core/promptDistributionService.js';
import {reviewPromptScope,promptReviewState} from '../../core/promptReviewBatch.js';
import {loadFreshBinding,linkedPromptBook} from '../../core/promptArtBinding.js';
import {workflowInput} from '../../core/adminWorkflow.js';
import {planArtImageBatch,runArtImageBatch} from '../../core/artImageBatch.js';
import {requestAssetImage,readAssetImageRecovery,clearAssetImageRecovery} from '../../core/assetImageRecovery.js';
import {assetHasImages} from '../../core/assetImages.js';
import {resolveAssetReference,characterAppearanceIssue} from '../../core/collabStore.js';
import {buildComposedImagePrompt} from '../../core/artImageComposition.js';
import {autoReferences} from '../../core/generationReferences.js';
import {mediaModelChoices} from '../../core/modelChoices.js';
import {generationMediaProfiles} from '../../core/canvasStore.js';
import {createDirectorSync} from '../../core/cloudTraffic.js';
import {bindingHash,sceneInventoryCards} from '../../core/promptArtBinding.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const json=text=>JSON.parse(String(text).replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));
export function createProductionAdapters({api,getState,setState,getQuick,getAccount}){
 const activeJobs=new Map(),syncDirector=createDirectorSync();
 const project=run=>{const p=getState().directorProjects?.find(p=>p.id===run.projectId);if(!p)throw Error('导演项目不存在');return p;};
 const profile=id=>{const p=getState().apiProfiles.find(p=>p.id===id);if(!p)throw Error('所选模型配置不存在');return p;};
 async function audit(ctx,payload){ctx.guard();const key=bindingHash(payload);ctx.run.audits||={};if(ctx.run.audits[key]?.approved)return;const result=json(await api.productionAudit({runId:ctx.run.id,payload}));ctx.guard();ctx.run.audits[key]={at:Date.now(),...result};await ctx.checkpoint();if(result.approved!==true)throw Error('制作 Agent 待核对：'+(result.reason||'检查未通过'));}
 async function collab(ctx){
  if(ctx.run.collabProjectId){const cloud=await api.collabGetProject({projectId:ctx.run.collabProjectId});return syncDirector(cloud,project(ctx.run),value=>api.collabUpdateProject(value));}
  const p=project(ctx.run),existing=(await api.collabListProjects()).filter(c=>c.director_project_id===p.id);
  if(existing.length>1)throw Error('同一导演项目对应多个协作项目，请先核对');
  ctx.guard();const saved=existing[0]||await api.collabCreateProject({name:p.name,directorProjectId:p.id,script:p.masterScript||'',episodes:p.episodes.map(e=>({...e,prompts:e.prompts||[]}))});
  ctx.run.collabProjectId=saved.id;await ctx.checkpoint();const cloud=await api.collabGetProject({projectId:saved.id});return syncDirector(cloud,p,value=>api.collabUpdateProject(value));
 }
 async function checkPost(ctx,ep,stage){
  let result=await api.productionPostStatus({runId:ctx.run.id,episode:ep.number,stage});
  if(result.status==='idle')result=await api.productionPost({runId:ctx.run.id,episode:ep.number,stage,clips:ctx.run.items.filter(i=>i.episode===ep.number)});
  while(result.status==='running'){await wait(5000);ctx.guard();result=await api.productionPostStatus({runId:ctx.run.id,episode:ep.number,stage});}
  if(result.status!=='done')throw Error(result.error||'后期尚未完成');return result.result;
 }
 return {
  async validate(ctx){await getQuick().saveLocal();const problems=productionVideoIssues(ctx.run.config,getState()),checked=await api.productionPreflight(ctx.run.config);if(problems.length||checked.issues.length)throw Error([...problems,...checked.issues].join('；'));ctx.run.name=project(ctx.run).name;await ctx.checkpoint();},
  async prompts(ctx){
   const {run}=ctx,c=run.config;ctx.guard();let p=project(run);run.name=p.name;await ctx.checkpoint();
   const existingCoverage=productionCoverage(p),existingMissing=existingCoverage.flatMap(e=>e.scenes).filter(s=>!s.count);
   if(!existingMissing.length){run.promptConfigured=true;run.coverage=existingCoverage;run.reusedExisting={...(run.reusedExisting||{}),prompts:true};await ctx.notice('已发现完整提示词，直接复用，不重新生成、不重复审核');return;}
   if(!run.promptConfigured){setState(s=>({...s,directorProjects:s.directorProjects.map(v=>v.id===p.id?{...v,style:c.style,aspectRatio:c.ratio}:v)}));run.promptConfigured=true;await getQuick().saveLocal();await ctx.checkpoint();}
   for(let attempt=0;attempt<2;attempt++){
    ctx.guard();p=project(run);const missing=productionCoverage(p).flatMap(e=>e.scenes).filter(s=>!s.count);
    if(!missing.length)break;await ctx.notice(`生成整本提示词 · 待补 ${missing.length} 场`);
    const skill=getState().skills.find(s=>s.id===c.promptSkillId);if(!skill)throw Error('提示词 Skill 不存在');
    const plan=await getQuick().previewBatch({project:p,skill,profile:profile(c.promptProfileId),maxDurationSeconds:Number(c.maxDuration),concurrency:4,existingPolicy:'missing-only',segmentationMode:'auto'});
    run.directorBatchId=plan.id;await ctx.checkpoint();await getQuick().startBatch(plan);
   }
   const coverage=productionCoverage(project(run));run.coverage=coverage;await ctx.checkpoint();
   const missing=coverage.flatMap(e=>e.scenes).filter(s=>!s.count);if(missing.length)throw Error(`仍缺少提示词：${missing.map(s=>s.label).join('、')}`);
   await ctx.notice('提示词已补齐，保留现有内容，不重复做整本审核');
  },
  async art(ctx){
   const {run}=ctx,c=run.config;let p=await collab(ctx);ctx.guard();
   p=await api.collabUpdateProject({projectId:p.id,updates:{style:c.artStyle}});p=await api.collabUpdateProject({projectId:p.id,scope:'art-image-settings',updates:{image_composition:c.composition}});
   let assets=await api.collabListAssets({projectId:p.id});const job={cancelled:false,taskIds:[]};activeJobs.set(run.id,job);
   try{await ctx.notice('连续分析清单、补齐描述并按提示词关联');
    const result=await runContinuousArtAnalysis({project:p,api,accountId:getAccount().id,profile:profile(c.analysisProfileId),existingAssets:assets,genre:p.genre||'',workflow:'automatic',pipeline:true,job,waitForRetry:async(ms,j)=>{ctx.guard();if(j.retryAttempt>=2)throw Error('清单分析两轮未完成，请检查模型或原文');await wait(Math.min(ms,5000));}});ctx.guard();
    run.artWarnings=result.errors||[];assets=await api.collabListAssets({projectId:p.id});const store=getArtReviewStore({api,projectId:p.id,accountId:getAccount().id});await store.load(p,assets);
    const service=getPromptDistributionService({api,projectId:p.id,accountId:getAccount().id,getContext:()=>({project:p,assets,ledger:store.snapshot()})});
    const binding=await service.read(),review=promptReviewState(binding);run.artWarnings.push(...review.problems);
    for(const sceneId of new Set(review.entries.map(e=>e.sceneId))){ctx.guard();try{
     const state=await service.read(),scope={sceneId},current=promptReviewState(state,scope);if(!current.ready)continue;
     await ctx.log?.(`${sceneId}：已有清单关联，按当前可用结果继续发布；未确定的单项保留在待处理问题。`,'info');
     await reviewPromptScope({service,store,scope,actor:`Agent · ${c.agentModel}`,action:'approve'});ctx.guard();const published=await reviewPromptScope({service,store,scope,actor:`Agent · ${c.agentModel}`,action:'publish'});run.artWarnings.push(...published.failures);
    }catch(error){run.artWarnings.push(`${sceneId}：${error.message}`);}}
    await ctx.checkpoint();return {partial:run.artWarnings.length>0};
   }finally{activeJobs.delete(run.id);}
  },
  async images(ctx){
   const {run}=ctx,c=run.config,p=await collab(ctx);let assets=await api.collabListAssets({projectId:p.id});run.imageItems||={};
   const choices=mediaModelChoices(getState(),'image'),primary=choices.find(m=>m.id===c.imageModel),fallback=choices.find(m=>m.id===c.fallbackImageModel);if(!primary||!fallback)throw Error('生图主备模型已变化');
   const plan=planArtImageBatch(assets,{readRecovery:id=>readAssetImageRecovery(p.id,id)});
   const result=await runArtImageBatch(plan,{concurrency:Number(c.imageConcurrency),isStopped:()=>run.status!=='running',onProgress:v=>{run.imageProgress=v;},generate:async asset=>{
    ctx.guard();let item=run.imageItems[asset.id]||{attempts:0};run.imageItems[asset.id]=item;
    if(['submitting','uncertain'].includes(item.status)&&!readAssetImageRecovery(p.id,asset.id))throw Error(`${asset.name} 上次提交结果不明，请核对，未重复生图`);
    const ref=resolveAssetReference(asset,assets);const issue=!ref&&characterAppearanceIssue(asset,assets);if(issue)throw Error(issue);
    const limit=Number(c.imageAttempts)*2;
    while(item.attempts<limit||readAssetImageRecovery(p.id,asset.id)){
     ctx.guard();const model=item.attempts<Number(c.imageAttempts)?primary:fallback;
     const pending=readAssetImageRecovery(p.id,asset.id);item.status='submitting';if(!pending)item.attempts++;await ctx.checkpoint();
     try{const generated=await requestAssetImage(api,p.id,asset.id,{...model,profileId:model.profileId,model:model.model,prompt:buildComposedImagePrompt(asset,ref,c.artStyle,c.composition,p),size:c.imageRatio,references:ref?autoReferences(`@${ref.name}`,[ref]):[]});ctx.guard();
      if(!generated?.filePath)throw Error('生图接口没有返回图片文件');const attached=await api.collabAttachGeneratedAssetImage({projectId:p.id,assetId:asset.id,episode:asset.first_episode||0,filePath:generated.filePath});if(!attached?.url)throw Error('图片已生成但未保存到项目');
      clearAssetImageRecovery(p.id,asset.id);item.status='done';item.error='';assets=await api.collabListAssets({projectId:p.id});await ctx.checkpoint();return attached;
     }catch(error){const pending=readAssetImageRecovery(p.id,asset.id),kind=imageFailureKind(error,pending);item.error=error.message;item.status=kind;await ctx.checkpoint();
      if(pending?.taskId){await wait(5000);continue;}
      if(['uncertain','content','configuration'].includes(kind))throw Error(`${asset.name}：${kind==='content'?'服务商内容拒绝，需核对合规描述；未自动改年龄或画风。':''}${error.message}`);
      if(item.attempts>=limit)throw error;await wait(kind==='rate-limit'?5000:1500);
     }
    }throw Error(`${asset.name} 已用完主备模型尝试次数`);
   }});
   run.imageErrors=result.results.filter(r=>r.status==='rejected').map(r=>({name:r.asset.name,error:r.reason.message}));await ctx.checkpoint();return {partial:run.imageErrors.length>0||result.remaining>0};
  },
  async videos(ctx){
   const {run}=ctx,c=run.config,p=await collab(ctx),fresh=await loadFreshBinding({api,projectId:p.id,accountId:getAccount().id,localSources:getState().directorProjects}),book=linkedPromptBook(fresh.snapshot,fresh.decisions,getAccount().id);
   const model=mediaModelChoices(getState(),'video').find(m=>m.id===c.videoModel);if(!model)throw Error('视频接口模型不存在');const videoProfile=generationMediaProfiles(getState(),'video').find(m=>m.id===model.profileId);
   run.name=project(run).name;const coverage=productionCoverage(project(run));if(!coverage.length||coverage.some(e=>!e.scenes.length||e.scenes.some(s=>!s.count)))throw Error('导演项目仍有场景未生成提示词，请补齐后继续');
   const expected=productionExpectedPrompts(project(run)).map(p=>p.label).sort(),sourceStamp=bindingHash(productionExpectedPrompts(project(run)));const checkSource=()=>{ctx.guard();if(bindingHash(productionExpectedPrompts(project(run)))!==sourceStamp)throw Error('制作中导演提示词已改变，请核对后继续');};
   if(JSON.stringify(expected)!==JSON.stringify(book.entries.map(e=>e.label).sort()))throw Error('联动提示词与导演应有清单不一致，请同步后继续');
   const signature=bindingHash(book.entries.map(e=>[e.id,e.prompt,e.label]));if(run.videoSourceSignature&&run.videoSourceSignature!==signature)throw Error('提示词版本已改变，旧结果保留；请核对后创建新流程');run.videoSourceSignature=signature;
   if(!run.items.length)run.items=book.entries.map(e=>({id:e.id,label:e.label,episode:e.episode,scene:e.scene,status:'queued'}));
   if(JSON.stringify(run.items.map(i=>i.id).sort())!==JSON.stringify(book.entries.map(e=>e.id).sort()))throw Error('任务清单与提示词版本不一致');
   if(!run.episodes.length)run.episodes=[...new Set(run.items.map(i=>i.episode))].sort((a,b)=>a-b).map(number=>({number,stage:'waiting'}));await ctx.checkpoint();
   let cursor=0,editTail=Promise.resolve();const postJobs=new Map();
   const postReady=async()=>{checkSource();for(const ep of run.episodes){if(ep.stage==='done'||postJobs.has(ep.number))continue;const clips=run.items.filter(i=>i.episode===ep.number);if(!completeEpisode(book.entries.filter(e=>e.episode===ep.number).map(e=>e.id),clips))continue;
    const job=(async()=>{try{if(c.endStage==='archive'){ep.stage='done';await ctx.checkpoint();return;}ep.stage='upscale';await ctx.checkpoint();await checkPost(ctx,ep,'upscale');ctx.guard();if(c.endStage==='upscale'){ep.stage='done';await ctx.checkpoint();return;}
      ep.stage='edit-queued';await ctx.checkpoint();const task=editTail.catch(()=>{}).then(async()=>{ctx.guard();ep.stage='edit';await ctx.checkpoint();ep.result=await checkPost(ctx,ep,'edit');ep.stage='done';await ctx.checkpoint();});editTail=task;await task;
     }catch(e){ep.stage='attention';ep.error=e.message;await ctx.checkpoint();}})();postJobs.set(ep.number,job);
   }};
   await postReady();
   const worker=async()=>{while(cursor<run.items.length){ctx.guard();const item=run.items[cursor++];if(item.status==='downloaded')continue;const entry=book.entries.find(e=>e.id===item.id);if(!entry){item.status='blocked';item.error='来源提示词已变化';continue;}
    try{
     let tasks=await api.generationList({includeArchived:true}),job=tasks.find(j=>j.id===item.jobId)||tasks.find(j=>j.workflowRunId===run.id&&j.workflowItemId===item.id);
     if(!job){checkSource();if(['submitting','uncertain'].includes(item.status))throw Error('此前提交结果未确认，请先核对原任务');
      const settings={profileId:model.profileId,model:model.model,duration:Number(c.videoDuration),ratio:c.ratio,resolution:c.videoResolution};
      // All clips use the explicitly selected video settings, not an old editor draft.
      const source={...book,drafts:{...book.drafts,[entry.id]:{...book.drafts[entry.id],duration:Number(c.videoDuration)}}};const input=workflowInput(source,entry,settings,videoProfile);ctx.guard();
      await audit(ctx,{stage:'提交前素材检查',label:entry.label,prompt:input.prompt,references:input.references.map(r=>({name:r.displayName||r.name,kind:r.kind,assetId:r.assetId})),rule:'核对本条人物、场景、道具及引用；只做检查，不能修改人工选择'});
      item.status='submitting';await ctx.checkpoint();job=await api.generationSubmit({...input,projectId:p.id,episode:entry.episode,scene:entry.sceneId||entry.label.split('-').slice(0,2).join('-'),shotId:entry.sourcePromptId||entry.id,shotLabel:entry.label,workflowRunId:run.id,workflowItemId:item.id});item.jobId=job.id;item.status='submitted';await ctx.checkpoint();
     }
     if(job.status==='submitting'&&!job.jobId){item.status='uncertain';throw Error('原提交未取得上游任务编号，请核对原任务；未重复提交');}
     while(!['success','failed','uncertain'].includes(job.status)){ctx.guard();await wait(5000);ctx.guard();if(!job.nextPollAt||job.nextPollAt<=Date.now())job=await api.generationRefresh({id:job.id,apiKey:videoProfile.apiKey,endpoint:videoProfile.endpoint});}
     if(job.status!=='success'){item.status=job.status;throw Error(job.error||job.warning||'生成未完成');}
     ctx.guard();Object.assign(item,await api.productionArchive({runId:run.id,jobId:job.id,label:item.label,episode:item.episode}),{status:'downloaded',error:''});await ctx.checkpoint();await postReady();
    }catch(error){if(run.status!=='running')throw error;if(item.status==='submitting')item.status='uncertain';else if(!['failed','uncertain'].includes(item.status))item.status='blocked';item.error=error.message;await ctx.checkpoint();}
   }};
   await Promise.all(Array.from({length:Number(c.videoConcurrency)},worker));await postReady();await Promise.all(postJobs.values());
  },
  async pause(run){await api.productionStop?.({runId:run.id});const job=activeJobs.get(run.id);if(job){job.cancelled=true;job.wakeRetry?.();await Promise.allSettled((job.taskIds||[]).map(taskId=>api.cancelAiTask({taskId})));if(run.collabProjectId)await getArtDistributionController({api,accountId:getAccount().id,projectId:run.collabProjectId}).stop();}if(run.directorBatchId)await getQuick().pauseBatch(run.directorBatchId).catch(()=>{});}
 };
}
