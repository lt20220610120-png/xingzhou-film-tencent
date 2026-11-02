import {runPromptModelChain,modelPolicyRows} from '../../core/productionModelPolicy.js';
import {listCollabEpisodes} from '../../core/collabEpisodes.js';
import {sourceReviewScenes,editArtReview,isSceneVerified,needsArtReviewDetails,reviewRoster,decodeArtReviewOutput} from '../../core/artReview.js';
import {fillArtReviewDetails} from '../../core/artReviewRunner.js';
import {repairProductionBindings} from '../../core/productionBindingRepair.js';
import {isFundingError,productionRecoveryGoals,productionRecoveryFingerprint} from '../../core/productionRecovery.js';
import {supplementPromptMissingReferences} from '../../core/promptMissingSupplement.js';
import {resolveProductionProject,productionProjectCandidates} from '../../core/productionProject.js';
import {productionArtMonitor} from '../../core/productionMonitor.js';
import {productionIssues,productionCoverage,productionExpectedPrompts,completeEpisode,productionVideoIssues,VOICE_AUTOMATION_RULE,voiceAutomationEnabled,voicePolicyIssues} from '../../core/productionFurnace.js';
import {getArtDistributionController} from '../../core/artAnalysisPipeline.js';
import {runContinuousArtAnalysis} from '../../core/artContinuousAnalysis.js';
import {getArtReviewStore} from '../../core/artReviewPersistence.js';
import {getPromptDistributionService} from '../../core/promptDistributionService.js';
import {promptReviewState,promptHumanReviewSignature} from '../../core/promptReviewBatch.js';
import {loadFreshBinding,linkedPromptBook} from '../../core/promptArtBinding.js';
import {planProductionReferenceSelection,selectProductionReferences} from '../../core/productionReferenceSelection.js';
import {workflowInput} from '../../core/adminWorkflow.js';
import {produceImages} from '../../core/productionImages.js';
import {runProductionVideoTask} from '../../core/productionVideoTask.js';
import {videoAttemptChoices} from '../../core/productionVideoPolicy.js';
import {assetHasImages} from '../../core/assetImages.js';
import {mediaModelChoices} from '../../core/modelChoices.js';
import {generationMediaProfiles} from '../../core/canvasStore.js';
import {createDirectorSync} from '../../core/cloudTraffic.js';
import {bindingHash,sceneInventoryCards} from '../../core/promptArtBinding.js';
import {readProjectVoices} from '../../core/voiceAnalysisRunner.js';
import {projectVoiceRoster} from '../../core/characterVoices.js';
import {prepareAutomaticVoice,runVoiceBatch} from '../../core/voiceReview.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const json=text=>JSON.parse(String(text).replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));
export function productionArtResumePlan(project,ledger,binding){
 const m=productionArtMonitor(project,ledger,binding);return {inventory:m.inventory,mapOnly:[...new Set([...m.mapping,...m.episodes.filter(e=>!e.complete&&!e.changed&&e.inventory).map(e=>e.number)])]};
}
export function missingInformationEpisodes(project,ledger){
 return listCollabEpisodes(project.episodes).filter(ep=>{
  const record=ledger.episodes?.[ep.episodeNumber];if(record?.sourceContent!==ep.content)return true;
  const inventoryReady=reviewRoster(record).length>0||decodeArtReviewOutput(record.inventory,ep.episodeNumber).complete;
  return !inventoryReady||sourceReviewScenes(ep).some(source=>!record.scenes?.some(s=>s.id===source.id&&s.source===source.source&&(s.mappingReady||s.items?.length)));
 });
}
export function createProductionAdapters({api,getState,setState,getQuick,getAccount}){
 const activeJobs=new Map(),syncDirector=createDirectorSync();
 const project=run=>{const p=getState().directorProjects?.find(p=>p.id===run.projectId);if(!p)throw Error('导演项目不存在');return p;};
 const voiceModelFor=c=>mediaModelChoices(getState(),'audio').find(m=>m.id===c.voiceModelId)||generationMediaProfiles(getState(),'audio').find(m=>m.id===c.voiceModelId);
 const profile=id=>{const p=getState().apiProfiles.find(p=>p.id===id);if(!p)throw Error('所选模型配置不存在');return p;};
 async function collab(ctx){
  const source=project(ctx.run),stamp=bindingHash([source.id,source.masterScript,source.episodes]);
  if(ctx.collabSnapshot?.stamp===stamp)return ctx.collabSnapshot.project;
  const saved=await resolveProductionProject({api,source:project(ctx.run),hasVideoJobs:Boolean(ctx.run.items?.length||ctx.run.videoSourceSignature),preferredId:ctx.run.collabProjectId||ctx.run.config.collabProjectId,guard:ctx.guard,log:ctx.log,checkpoint:async id=>{ctx.run.collabProjectId=id;await ctx.checkpoint();}});
  const result=await syncDirector(saved,source,value=>api.collabUpdateProject(value));ctx.collabSnapshot={stamp,project:result};return result;
 }
 async function readArt(ctx,refresh=false){
  if(ctx.artSnapshot&&!refresh)return ctx.artSnapshot;
  let p;
  if(ctx.readOnly){const source=project(ctx.run),rows=await api.collabListProjects(),candidates=productionProjectCandidates(rows,source.id),id=ctx.run.collabProjectId||ctx.run.config.collabProjectId||candidates[0]?.id;
   p=id&&candidates.some(v=>v.id===id)?await api.collabGetProject({projectId:id}):{id:'',episodes:source.episodes};
  }else p=await collab(ctx);
  const assets=p.id?await api.collabListAssets({projectId:p.id}):[];ctx.guard();
  if(!p.id){const monitor=productionArtMonitor(p,{episodes:{}},{snapshot:{entries:[],cards:[]},decisions:{}},[],ctx.run.monitor?.art);ctx.run.monitor={...ctx.run.monitor,checkedAt:Date.now(),art:monitor};await ctx.checkpoint();return {p,assets,monitor};}
  const store=getArtReviewStore({api,projectId:p.id,accountId:getAccount().id});await store.load(p,assets);
  const service=getPromptDistributionService({api,projectId:p.id,accountId:getAccount().id,getContext:()=>({project:p,assets,ledger:store.snapshot()})}),binding=await service.read();ctx.guard();
  const monitor=productionArtMonitor(p,store.snapshot(),binding,assets,ctx.run.monitor?.art,{voiceEnabled:voiceAutomationEnabled(ctx.run.config)});ctx.run.monitor={...ctx.run.monitor,checkedAt:Date.now(),art:monitor};
  ctx.artSnapshot={p,assets,store,service,binding,monitor};await ctx.checkpoint();return ctx.artSnapshot;
 }
 async function checkPost(ctx,ep,stage,clipId){
  let result=await api.productionPostStatus({runId:ctx.run.id,episode:ep.number,stage,...(clipId?{clipId}:{})});
  if(result.status==='idle')result=await api.productionPost({runId:ctx.run.id,episode:ep.number,stage,...(clipId?{clipId}:{}),clips:ctx.run.items.filter(i=>i.episode===ep.number)});
  while(result.status==='running'){await wait(5000);ctx.guard();result=await api.productionPostStatus({runId:ctx.run.id,episode:ep.number,stage,...(clipId?{clipId}:{})});}
  if(result.status!=='done')throw Error(result.error||'后期尚未完成');return result.result;
 }
 async function work(ctx,task,messages){ctx.guard();if(!api.productionWork)throw Error('Agent 工作组件尚未加载，请升级并重新打开软件');const rules='\n【行舟影视自动化人物音色流程】\n你是接入行舟影视自动化制作的 Agent。'+(voiceAutomationEnabled(ctx.run.config)?'音色开关已开启，按配置的并发数执行人物音色阶段。'+VOICE_AUTOMATION_RULE:'音色开关已关闭，跳过音色生成和补全，不要求选择语音模型，不以缺少音色阻塞美术或视频，不擅自开启音色。已有人工采用音色和其他成果保留。')+(ctx.run.config.workflowRules?'\n管理员确认的制作规则：'+ctx.run.config.workflowRules:'');const enriched=messages.map((m,i)=>i===0&&m.role==='system'?{...m,content:m.content+rules}:m);const result=await api.productionWork({runId:ctx.run.id,task,messages:enriched});ctx.guard();return result;}
 async function publishReady(ctx,state){
  const {store,p}=state,targets=state.monitor.episodes.filter(e=>!e.changed).flatMap(e=>e.scenes.filter(s=>!s.published).map(s=>({number:e.number,id:s.id}))),byEpisode=new Map();
  for(const target of targets){const scene=store.snapshot().episodes[target.number]?.scenes.find(s=>s.id===target.id);if(!scene?.items.length||scene.items.some(needsArtReviewDetails))continue;if(!byEpisode.has(target.number))byEpisode.set(target.number,[]);byEpisode.get(target.number).push(target.id);}
  if(!byEpisode.size)return 0;ctx.guard();await store.updateMany([...byEpisode].map(([number,ids])=>({number,reduce:r=>{ctx.guard();for(const id of ids)if(!isSceneVerified(r.scenes.find(s=>s.id===id)))r=editArtReview(r,{type:'approve',sceneId:id},`超创 · ${ctx.run.config.agentModel}`);return r;}})));
  let cursor=0,published=0;const groups=[...byEpisode];await Promise.all(Array.from({length:Math.min(4,groups.length)},async()=>{while(cursor<groups.length){ctx.guard();const [number,ids]=groups[cursor++];try{await ctx.log?.(`自动发布目标：第 ${number} 集 ${ids.join('、')}，复用已就绪清单。`);await store.publish(number,ids);ctx.guard();published+=ids.length;await ctx.checkpoint();}catch(error){ctx.guard();ctx.run.artWarnings=[...(ctx.run.artWarnings||[]),`${ids.join('、')} 发布接续：${error.message}`];}}}));
  if(published){delete ctx.artSnapshot;await ctx.log?.(`已自动发布 ${published} 场；正在重新读取图片卡片。`,'success');}return published;
 }
 async function repairAssociations(ctx){
  let state=await readArt(ctx,true);const selected=profile(ctx.run.config.analysisProfileId),agentApi=api,distributionProfile=selected;
  const service=getPromptDistributionService({api:agentApi,projectId:state.p.id,accountId:getAccount().id,getContext:()=>({project:state.p,assets:state.assets,ledger:state.store.snapshot()})});
  const repaired=await repairProductionBindings({service,profile:distributionProfile,voiceEnabled:voiceAutomationEnabled(ctx.run.config),guard:ctx.guard,work:(task,messages)=>work(ctx,task,messages),log:ctx.log});
  const fresh=await service.read(),missing=promptReviewState(fresh,{}).pendingMissing;
  if(missing.length){ctx.guard();await ctx.log?.(`Agent 目标：补充 ${missing.length} 项真实缺失素材，并重新关联到对应提示词。`);const guardedStore={...state.store,update:(n,reduce)=>state.store.update(n,r=>{ctx.guard();return reduce(r);})};const result=await supplementPromptMissingReferences({service,store:guardedStore,api:{...agentApi,aiChat:p=>work(ctx,'art-repair',p.messages)},targets:missing.map(({entry,need})=>({entryId:entry.id,needId:need.id,signature:promptHumanReviewSignature(fresh.snapshot,entry,fresh.decisions[entry.id])})),profile:distributionProfile,actor:'超创 Agent',onProgress:t=>{void ctx.log?.(t);}});repaired.failures.push(...result.failures);}
  ctx.guard();state=await readArt(ctx,true);await publishReady(ctx,state);await readArt(ctx,true);return repaired;
 }
 return {
  async monitor(ctx){
   if(api.productionVerify&&ctx.run.items?.some(i=>i.status==='downloaded')){
    ctx.run.outputVerificationFailed=true;const files=await api.productionVerify({runId:ctx.run.id});ctx.guard();ctx.run.outputVerificationFailed=false;ctx.run.monitor={...ctx.run.monitor,files};
    for(const item of ctx.run.items)if(files.invalidItems.includes(item.id)){item.status='uncertain';item.error='原片文件验收未通过，接续原任务重新归档；未重新提交生成';}
    for(const ep of ctx.run.episodes)if(files.invalidEpisodes.includes(ep.number)||ctx.run.items.some(i=>i.episode===ep.number&&files.invalidItems.includes(i.id))){ep.stage='waiting';ep.error='输出文件需要接续核对';}
    await ctx.checkpoint();
   }
   const coverage=productionCoverage(project(ctx.run)),scenes=coverage.flatMap(e=>e.scenes),promptDone=coverage.length>0&&coverage.every(e=>e.scenes.length>0&&e.scenes.every(s=>s.complete));
   const {monitor,store:voiceStore,p:voiceProject,assets:monitorAssets}=await readArt({...ctx,readOnly:true},true);
   ctx.run.monitor={...ctx.run.monitor,prompts:{episodes:coverage.length,scenes:scenes.length,complete:scenes.filter(s=>s.complete).length,count:scenes.reduce((n,s)=>n+s.count,0)}};
   await ctx.log?.(`批量监测完成：提示词 ${scenes.filter(s=>s.count).length}/${scenes.length} 场，清单已发布 ${monitor.summary.published}/${monitor.summary.scenes} 场，已有图片 ${monitor.summary.images}/${monitor.summary.assets}；只接续缺项，不重做已完成成果。`);
   const voiceRoster=voiceStore&&voiceAutomationEnabled(ctx.run.config)?projectVoiceRoster(voiceProject,voiceStore.snapshot()):null;
   const voiceDone=!voiceAutomationEnabled(ctx.run.config)||Boolean(voiceRoster?.complete&&voiceRoster.characters.every(x=>voiceStore.snapshot().voiceProfiles?.[x.key]?.confirmed));
   return {information:Boolean(voiceStore)&&missingInformationEpisodes(voiceProject,voiceStore.snapshot()).length===0&&projectVoiceRoster(voiceProject,voiceStore.snapshot()).complete,prompts:promptDone,voices:voiceDone,art:monitor.episodes.length>0&&monitor.episodes.every(e=>e.complete),images:monitor.summary.assets>0&&monitorAssets.every(a=>assetHasImages(a)||ctx.run.imageItems?.[a.id]?.status==='skipped')};
  },
  async inspect(run){const source=project(run),rows=await api.collabListProjects(),candidates=productionProjectCandidates(rows,source.id);const id=run.collabProjectId||run.config.collabProjectId||candidates[0]?.id;
   let assets=[],cloud;if(id&&candidates.some(p=>p.id===id)){cloud=await api.collabGetProject({projectId:id});assets=await api.collabListAssets({projectId:id});}
   return {director:{id:source.id,name:source.name,coverage:productionCoverage(source)},collabProjectId:id||'',candidates:candidates.map(p=>({id:p.id,name:p.name,updated_at:p.updated_at})),assets:{total:assets.length,withImages:assets.filter(assetHasImages).length},publishedScenes:Object.values(cloud?.analysis_progress||{}).reduce((n,r)=>n+Object.keys(r.review?.published||{}).length,0),stages:run.stages,errors:run.stageErrors||{},items:run.items.map(i=>({label:i.label,status:i.status,error:i.error})).slice(0,60)};
  },
  async chat(run,{text,model,history}){const context=await this.inspect(run);const reply=await api.productionChat({runId:run.id,text,model,history,context});return {...reply,context};},
  async selectCollab(run,id){const rows=await api.collabListProjects();if(!productionProjectCandidates(rows,run.projectId).some(p=>p.id===id))throw Error('只能选择当前导演项目的正常协作项目');return id;},
  async validateSettings(config,run){const errors=productionIssues(config,{project:project(run),models:mediaModelChoices(getState(),'image'),profiles:getState().apiProfiles,skills:getState().skills});errors.push(...productionVideoIssues(config,getState()));if(errors.length)throw Error(errors.join('；'));await this.validateVoicePolicy(config);},
  async validate(ctx){await this.validateVoicePolicy(ctx.run.config);await getQuick().saveLocal();const problems=productionVideoIssues(ctx.run.config,getState()),checked=await api.productionPreflight(ctx.run.config);if(problems.length||checked.issues.length)throw Error([...problems,...checked.issues].join('；'));ctx.run.name=project(ctx.run).name;await ctx.checkpoint();},
  async validateVideoPolicy(config){const issues=productionVideoIssues(config,getState());if(issues.length)throw Error(issues.join('；'));},
  async prompts(ctx){
   const {run}=ctx,c=run.config;ctx.guard();let p=project(run);run.name=p.name;await ctx.checkpoint();
   const existingCoverage=productionCoverage(p),existingMissing=existingCoverage.flatMap(e=>e.scenes).filter(s=>!s.complete);
   if(!existingCoverage.length||existingCoverage.some(e=>!e.scenes.length))throw Error('导演项目缺少可识别的场景，请检查分集与场景编号');
   if(!existingMissing.length){run.promptConfigured=true;run.coverage=existingCoverage;run.reusedExisting={...(run.reusedExisting||{}),prompts:true};await ctx.notice('已发现完整提示词，直接复用，不重新生成、不重复审核');return;}
   if(!run.promptConfigured){setState(s=>({...s,directorProjects:s.directorProjects.map(v=>v.id===p.id?{...v,style:c.style,aspectRatio:c.ratio}:v)}));run.promptConfigured=true;await getQuick().saveLocal();await ctx.checkpoint();}
   await runPromptModelChain({ctx,profiles:getState().apiProfiles,remaining:()=>productionCoverage(project(run)).flatMap(e=>e.scenes).filter(s=>!s.complete),generate:async selected=>{
    ctx.guard();p=project(run);const skill=getState().skills.find(s=>s.id===c.promptSkillId);if(!skill)throw Error('提示词 Skill 不存在');
    const quick=getQuick(),pending=productionCoverage(p).flatMap(e=>e.scenes.filter(s=>!s.complete).map(s=>({...s,episodeId:e.id})));
    for(const scene of pending){
     const previous=quick.getSceneRun?.(p.id,scene.episodeId,scene.label);
     if(previous&&quick.resume){ctx.guard();try{await quick.resume(previous.id,{profileId:selected.id,restoreOutput:true});}catch(error){await ctx.log?.(`${scene.label} 接续：${error.message}`,'warning');}}
    }
    p=project(run);
    const plan=await getQuick().previewBatch({project:p,skill,profile:selected,maxDurationSeconds:Number(c.maxDuration),concurrency:4,existingPolicy:'incomplete-only',segmentationMode:'auto'});
    run.directorBatchId=plan.id;await ctx.checkpoint();await getQuick().startBatch(plan);
   }});
   const coverage=productionCoverage(project(run));run.coverage=coverage;await ctx.checkpoint();
   const missing=coverage.flatMap(e=>e.scenes).filter(s=>!s.complete);if(missing.length)throw Error(`仍缺少提示词：${missing.map(s=>s.label).join('、')}`);
   await ctx.notice('提示词已补齐，保留现有内容，不重复做整本审核');
  },
  async information(ctx){
   const {run}=ctx,c=run.config;let p=await collab(ctx);const assets=await api.collabListAssets({projectId:p.id});
   if(!assets.length&&api.collabUpdateProject){p=await api.collabUpdateProject({projectId:p.id,updates:{style:c.artStyle}});p=await api.collabUpdateProject({projectId:p.id,scope:'art-image-settings',updates:{image_composition:c.composition}});ctx.collabSnapshot=null;}
   const store=getArtReviewStore({api,projectId:p.id,accountId:getAccount().id});await store.load(p,assets);
   const readingProfile=profile(c.analysisProfileId),job={cancelled:false,taskIds:[]};activeJobs.set(run.id,job);
   try{
    const missing=missingInformationEpisodes(p,store.snapshot());
    if(missing.length){await ctx.notice('信息读取：美术清单、人物身份与关联场景');const analysis=await runContinuousArtAnalysis({project:p,api,accountId:getAccount().id,profile:readingProfile,existingAssets:assets,genre:p.genre||'',workflow:'automatic',pipeline:false,targetEpisodeNumbers:missing.map(e=>e.episodeNumber),preserveExisting:true,job});if(analysis.errors?.length)throw Error(analysis.errors.join('；'));if(!job.cancelled&&missingInformationEpisodes(p,store.snapshot()).length)throw Error('美术清单或人物场景关联尚未读取完整，保留当前信息后继续补缺');}
    if(job.cancelled)return {partial:true};
    const result=await readProjectVoices({project:p,store,api,profile:readingProfile,job});ctx.artSnapshot=null;
    if(result.errors.length)throw Error(result.errors.join('；'));
    await ctx.notice('人物身份、关联场景和正常对白已读取；继续人物音色');
   }finally{if(activeJobs.get(run.id)===job)activeJobs.delete(run.id);}
  },
  async validateVoicePolicy(c){if(!voiceAutomationEnabled(c))return;const issues=voicePolicyIssues(c);if(issues.length)throw Error(issues.join('；'));profile(c.voiceCompletionProfileId);profile(c.voiceDistributionProfileId);if(!voiceModelFor(c))throw Error('人物音色模型已不存在');},
  async voices(ctx){
   if(!voiceAutomationEnabled(ctx.run.config))return {skipped:true};
   if(ctx.run.stageErrors?.information)throw Error('信息读取尚未完成：'+ctx.run.stageErrors.information);
   const {run}=ctx,c=run.config,completion=profile(c.voiceCompletionProfileId),distribution=profile(c.voiceDistributionProfileId),voiceModel=voiceModelFor(c);if(!voiceModel)throw Error('人物音色模型已不存在');
   run.voiceAutomation={completed:false};const voiceAccountId=getAccount().id;const keepResult=()=>{try{return getAccount().id===voiceAccountId;}catch{return false;}};
   const job={taskIds:[],stopped:false,get cancelled(){return this.stopped||run.status!=='running'||!voiceAutomationEnabled(run.config);},set cancelled(value){this.stopped=value;}};activeJobs.set(run.id,job);
   try{
    const p=await collab(ctx),assets=await api.collabListAssets({projectId:p.id}),store=getArtReviewStore({api,projectId:p.id,accountId:getAccount().id});await store.load(p,assets);ctx.guard();
    const missing=missingInformationEpisodes(p,store.snapshot());
    if(missing.length&&!job.cancelled){await ctx.notice('先读取缺失剧本信息，再准备人物音色');const analysis=await runContinuousArtAnalysis({project:p,api,accountId:getAccount().id,profile:completion,existingAssets:assets,genre:p.genre||'',workflow:'automatic',pipeline:false,targetEpisodeNumbers:missing.map(e=>e.episodeNumber),preserveExisting:true,job});if(analysis.errors?.length)throw Error(analysis.errors.join('；'));if(!job.cancelled&&missingInformationEpisodes(p,store.snapshot()).length)throw Error('人物身份或关联场景尚未读取完整，请继续信息读取');}
    if(job.cancelled)return {skipped:true};
    await ctx.notice('读取人物正常对白并补齐音色前置信息');const reading=await readProjectVoices({project:p,store,api,profile:completion,job,onProgress:()=>{}});
    const characters=projectVoiceRoster(p,store.snapshot()).characters;
    run.voiceAutomation={completed:false,modelId:voiceModel.id,completionProfileId:completion.id,distributionProfileId:distribution.id,concurrency:Number(c.voiceConcurrency||1),policy:'每个人物生成第一条后自动采用'};
    const result=await runVoiceBatch({characters,getProfile:key=>store.snapshot().voiceProfiles?.[key],mode:'prepare',concurrency:c.voiceConcurrency??1,job,generate:async character=>{
     ctx.guard();if(job.cancelled)return;
     await prepareAutomaticVoice({character,store,api,selected:voiceModel,model:completion,project:p,job,keepResult});
     if(!job.cancelled)await ctx.log?.(`自动采用 ${character.name} 的第一条生成音色（分发模型：${distribution.name||distribution.id}）。`,'success');
    }});
    const errors=[...(reading?.errors||[]),...result.errors];run.voiceAutomation.completed=!job.cancelled&&errors.length===0;run.voiceWarnings=job.cancelled?[]:errors;ctx.artSnapshot=null;return {partial:!job.cancelled&&errors.length>0};
   }finally{if(activeJobs.get(run.id)===job)activeJobs.delete(run.id);}
  },
  async art(ctx){
   const {run}=ctx,c=run.config;let {p,assets,monitor}=await readArt(ctx);ctx.guard();
   const inventory=monitor.inventory,mapOnly=monitor.mapping;
   // Repair missing scene containers from the exact current source without
   // discarding the saved roster, mappings, approvals or publication receipts.
   for(const row of monitor.episodes.filter(e=>e.inventory&&!e.changed&&e.scenes.some(s=>s.missingRecord))){ctx.guard();const ep=listCollabEpisodes(p.episodes).find(e=>e.episodeNumber===row.number);await ctx.artSnapshot.store.update(row.number,record=>({...record,scenes:sourceReviewScenes(ep).map(source=>record.scenes.find(s=>s.id===source.id)||source)}));}
   if(monitor.episodes.length&&monitor.episodes.every(e=>e.complete)){run.reusedExisting={...(run.reusedExisting||{}),art:true};run.artWarnings=[];await ctx.notice(`复用协作项目「${p.name}」：已发布 ${monitor.summary.published} 场，跳过关联与发布，继续补齐图片。`);return;}
   await ctx.notice(`跳过已完成 ${monitor.summary.complete} 场：${inventory.length} 集缺清单，${mapOnly.length} 集缺关联，${monitor.pendingScenes.length} 场待核实或发布。`);
   if(!assets.length){p=await api.collabUpdateProject({projectId:p.id,updates:{style:c.artStyle}});p=await api.collabUpdateProject({projectId:p.id,scope:'art-image-settings',updates:{image_composition:c.composition}});}
   const job={cancelled:false,taskIds:[]};activeJobs.set(run.id,job);
   try{await ctx.notice('连续分析清单、补齐描述并按提示词关联');
    const result={errors:[]};
    for(const [numbers,onlyMapping] of [[inventory,false],[mapOnly,true]]){if(!numbers.length)continue;try{
     const partial=await runContinuousArtAnalysis({project:p,api,accountId:getAccount().id,profile:profile(c.analysisProfileId),existingAssets:assets,genre:p.genre||'',workflow:'automatic',pipeline:true,targetEpisodeNumbers:numbers,...(onlyMapping?{targetSceneIds:monitor.episodes.flatMap(e=>e.scenes.filter(s=>s.needsMapping).map(s=>s.id))}:{}),mapOnly:onlyMapping,preserveExisting:true,voiceEnabled:voiceAutomationEnabled(c),job,waitForRetry:async(ms,j)=>{ctx.guard();if(j.retryAttempt>=2)throw Error('清单分析两轮未完成，请检查模型或原文');await wait(Math.min(ms,5000));}});result.errors.push(...partial.errors||[]);
    }catch(error){ctx.guard();result.errors.push(error.message);await ctx.log?.(`未完成清单保留待处理：${error.message}；继续尝试发布就绪场景。`,'warning');}}ctx.guard();
    const state=await readArt(ctx,true),{store,service,binding}=state;
    run.artWarnings=[...result.errors,...state.monitor.warnings];
    await publishReady(ctx,state);
    let after=await readArt(ctx,true);
    if(after.monitor.episodes.some(e=>e.scenes.some(s=>!s.associated))){const repaired=await repairAssociations(ctx);run.artWarnings.push(...repaired.failures);after=await readArt(ctx,true);}
    for(const row of after.monitor.episodes)for(const scene of row.scenes)if(!scene.complete)run.artWarnings.push(`${scene.id}：${scene.reasons.join('；')}`);
    run.artWarnings=[...new Set(run.artWarnings)];await ctx.checkpoint();return {partial:!after.monitor.episodes.every(e=>e.complete)};
   }finally{activeJobs.delete(run.id);}
  },
  async images(ctx){const {run}=ctx,c=run.config,p=await collab(ctx),assets=await api.collabListAssets({projectId:p.id}),choices=mediaModelChoices(getState(),'image'),policies=modelPolicyRows(c,'image').map(row=>{const model=choices.find(m=>m.id===row.modelId);if(!model)throw Error('生图主备模型已变化');return {...model,...row};});await ctx.notice('已读取协作项目「'+p.name+'」的 '+assets.length+' 张资产卡片，复用已有图片并处理未完成项。');return produceImages({ctx,api,project:p,assets,policies,work:(task,messages)=>work(ctx,task,messages)});},
  async videos(ctx){
   if(ctx.run.outputVerificationFailed)throw Error('原片文件验收未完成，请检查输出目录后继续；原任务与成果均保留');
   const {run}=ctx,c=run.config,p=await collab(ctx),fresh=await loadFreshBinding({api,projectId:p.id,accountId:getAccount().id,localSources:getState().directorProjects}),initialBook=linkedPromptBook(fresh.snapshot,fresh.decisions,getAccount().id,{voiceEnabled:voiceAutomationEnabled(c),omittedAssetIds:Object.keys(run.imageItems||{}).filter(id=>run.imageItems[id].status==='skipped')});let book=initialBook;
   const model=mediaModelChoices(getState(),'video').find(m=>m.id===c.videoModel);if(!model)throw Error('视频接口模型不存在');const videoProfile=generationMediaProfiles(getState(),'video').find(m=>m.id===model.profileId);await ctx.notice(`读取到 ${book.entries.length} 条联动提示词，开始按条提交或接续原视频任务。`);
   run.name=project(run).name;const coverage=productionCoverage(project(run));if(!coverage.length||coverage.some(e=>!e.scenes.length||e.scenes.some(s=>!s.complete)))throw Error('导演项目仍有场景未生成提示词，请补齐后继续');
   const expected=productionExpectedPrompts(project(run)).map(p=>p.label).sort(),sourceStamp=bindingHash(productionExpectedPrompts(project(run)));const checkSource=()=>{ctx.guard();if(bindingHash(productionExpectedPrompts(project(run)))!==sourceStamp)throw Error('制作中导演提示词已改变，请核对后继续');};
   if(JSON.stringify(expected)!==JSON.stringify(book.entries.map(e=>e.label).sort()))throw Error('联动提示词与导演应有清单不一致，请同步后继续');
   const signature=bindingHash(book.entries.map(e=>[e.id,e.prompt,e.label]));if(run.videoSourceSignature&&run.videoSourceSignature!==signature)throw Error('提示词版本已改变，旧结果保留；请核对后创建新流程');run.videoSourceSignature=signature;
   if(!run.items.length)run.items=book.entries.map(e=>({id:e.id,label:e.label,episode:e.episode,scene:e.scene,status:'queued'}));
   if(JSON.stringify(run.items.map(i=>i.id).sort())!==JSON.stringify(book.entries.map(e=>e.id).sort()))throw Error('任务清单与提示词版本不一致');
   if(!run.episodes.length)run.episodes=[...new Set(run.items.map(i=>i.episode))].sort((a,b)=>a-b).map(number=>({number,stage:'waiting'}));await ctx.checkpoint();
   let editTail=Promise.resolve();const postJobs=new Map(),clipJobs=new Map();
   const postReady=async()=>{checkSource();
    if(c.endStage!=='archive')for(const item of run.items.filter(i=>i.status==='downloaded')){
     if(clipJobs.has(item.id))continue;
     const task=(async()=>{try{item.upscaleStatus='running';await ctx.checkpoint();item.upscaleResult=await checkPost(ctx,{number:item.episode},'upscale',item.id);item.upscaleStatus='done';delete item.upscaleError;}catch(error){item.upscaleStatus='failed';item.upscaleError=error.message;}await ctx.checkpoint();})();clipJobs.set(item.id,task);
    }
    for(const ep of run.episodes){if(ep.stage==='done'||postJobs.has(ep.number))continue;const clips=run.items.filter(i=>i.episode===ep.number);if(!completeEpisode(book.entries.filter(e=>e.episode===ep.number).map(e=>e.id),clips))continue;
    const job=(async()=>{try{if(c.endStage==='archive'){ep.stage='done';await ctx.checkpoint();return;}ep.stage='upscale';await ctx.checkpoint();await Promise.all(clips.map(i=>clipJobs.get(i.id)));if(clips.some(i=>i.upscaleStatus!=='done'))throw Error(clips.find(i=>i.upscaleError)?.upscaleError||'本集超分尚未齐全');await checkPost(ctx,ep,'upscale');ctx.guard();if(c.endStage==='upscale'){ep.stage='done';await ctx.checkpoint();return;}
      ep.stage='edit-queued';await ctx.checkpoint();const task=editTail.catch(()=>{}).then(async()=>{ctx.guard();ep.stage='edit';await ctx.checkpoint();ep.result=await checkPost(ctx,ep,'edit');ep.stage='done';await ctx.checkpoint();});editTail=task;await task;
     }catch(e){ep.stage='attention';ep.error=e.message;await ctx.checkpoint();}})();postJobs.set(ep.number,job);
   }};
   await postReady();const tasks=await api.generationList({includeArchived:true}),videoModels=mediaModelChoices(getState(),'video'),choices=videoAttemptChoices(c,videoModels),capacity=new Map();
   // A slot lasts through submission, polling and download. Each ordered policy
   // entry owns its limit, so fallback work can speed up or slow down safely.
   const acquire=async(selected,job)=>{
    const choice=selected||choices.find(m=>m.videoPolicyKey===job.workflowVideoPolicyKey)||choices.find(m=>m.profileId===job.profileId&&m.model===job.model)||choices[0],key=choice.videoPolicyKey,limit=Number(choice.videoConfig.videoConcurrency);
    if(!Number.isInteger(limit)||limit<1||limit>8)throw Error('视频并发数量应在 1–8 之间');
    if(!capacity.has(key))capacity.set(key,{active:0,waiting:[]});const slots=capacity.get(key);
    while(slots.active>=limit){await new Promise(resolve=>slots.waiting.push(resolve));ctx.guard();}
    ctx.guard();slots.active++;let released=false;return ()=>{if(released)return;released=true;slots.active--;for(const resume of slots.waiting.splice(0))resume();};
   };
   const worker=async(item)=>{ctx.guard();if(item.status==='downloaded')return;const entry=book.entries.find(e=>e.id===item.id);if(!entry){item.status='blocked';item.error='来源提示词已变化';return;}
    try{
     await runProductionVideoTask({ctx,item,tasks,models:videoModels,wait,acquire,
      submit:async selected=>{
       checkSource();const selectedProfile=generationMediaProfiles(getState(),'video').find(m=>m.id===selected.profileId);
       const parameters=selected.videoConfig,settings={profileId:selected.profileId,model:selected.model,duration:Number(parameters.videoDuration),ratio:parameters.ratio,resolution:parameters.videoResolution,allowReferenceSelection:true};
       const source={...book,drafts:{...book.drafts,[entry.id]:{...book.drafts[entry.id],duration:Number(parameters.videoDuration)}}},input=workflowInput(source,entry,settings,selectedProfile);ctx.guard();
       await planProductionReferenceSelection({ctx,input,entry:{...entry,id:item.id},work:(task,messages)=>work(ctx,task,messages)});
       const outbound=selectProductionReferences(input);
       ctx.guard();item.status='submitting';await ctx.checkpoint();const result=await api.generationSubmit({...input,projectId:p.id,episode:entry.episode,scene:entry.sceneId||entry.label.split('-').slice(0,2).join('-'),shotId:entry.sourcePromptId||entry.id,shotLabel:entry.label,workflowRunId:run.id,workflowItemId:item.id,workflowVideoPolicyKey:selected.videoPolicyKey});
       item.referenceVerification=result.referenceVerification||outbound.referenceVerification;await ctx.log?.('发送引用验收：'+item.label+'，'+item.referenceVerification.selected.length+' 张参考图逐项对应 @；舍弃 '+item.referenceVerification.omitted.length+' 张低权重参考图。');return result;
      },
      refresh:async job=>{const original=generationMediaProfiles(getState(),'video').find(m=>m.id===job.profileId)||videoProfile;return api.generationRefresh({id:job.id,apiKey:original.apiKey,endpoint:original.endpoint});},
      archive:job=>api.productionArchive({runId:run.id,jobId:job.id,label:item.label,episode:item.episode}),onReady:postReady});
    }catch(error){if(run.status!=='running')throw error;if(isFundingError(error)){ctx.videoBudget=error.message;item.status='failed';}else if(/前置引用核验失败，尚未提交生成/.test(error.message))item.status='blocked';else if(item.status==='submitting')item.status='uncertain';else if(!['failed','uncertain','retry-exhausted','success'].includes(item.status))item.status='blocked';item.error=error.message;await ctx.checkpoint();}
   };
   const running=new Map(),attempted=new Map();let loadedRevision=-1;
   const workerLimit=choices.reduce((sum,m)=>sum+Math.max(1,Math.min(8,Number(m.videoConfig.videoConcurrency)||1)),0);
   while(true){
    ctx.guard();const revision=ctx.materialRevision||0;
    if(loadedRevision!==revision){if(loadedRevision!==-1||ctx.imagesPending||revision){const current=await loadFreshBinding({api,projectId:p.id,accountId:getAccount().id,localSources:getState().directorProjects});book=linkedPromptBook(current.snapshot,current.decisions,getAccount().id,{voiceEnabled:voiceAutomationEnabled(c),omittedAssetIds:Object.keys(run.imageItems||{}).filter(id=>run.imageItems[id].status==='skipped')});checkSource();}loadedRevision=revision;}
    const queue=run.items.filter(item=>{
     if(item.status==='downloaded'||running.has(item.id)||attempted.get(item.id)===revision)return false;
     // Preserve unknown paid submissions even if their references are unavailable.
     if(['uncertain','submitting'].includes(item.status)||item.jobId||tasks.some(j=>j.workflowRunId===run.id&&j.workflowItemId===item.id))return true;
     const draft=book.drafts[item.id];if(draft?.referenceBindingMode==='confirmed')return true;
     item.status='blocked';item.error=draft?.bindingIssue||'等待本条素材关联和图片';return false;
    });
    for(const item of queue.slice(0,Math.max(0,workerLimit-running.size))){attempted.set(item.id,revision);const task=worker(item).finally(()=>running.delete(item.id));running.set(item.id,task);}
    if(!running.size&&!ctx.imagesPending){if((ctx.materialRevision||0)!==revision)continue;break;}
    // A single completed clip or image event frees the coordinator to admit work;
    // a slow video in another slot never becomes a whole-round barrier.
    const waits=[...running.values()];if(ctx.imagesPending)waits.push(ctx.waitForMaterials?ctx.waitForMaterials(revision):wait(1000));
    await Promise.race(waits);await postReady();
   }
   await Promise.all(clipJobs.values());await postReady();await Promise.all(postJobs.values());

  },
  async recover(ctx){
   const {run}=ctx;ctx.guard();if(['prompts','information'].some(k=>run.stages[k]?.status==='partial'))return {retry:true,delay:30000};const goals=productionRecoveryGoals(run),fingerprint=productionRecoveryFingerprint(goals,run.config),old=run.recovery||{},same=old.fingerprint===fingerprint;
   run.recovery={...old,fingerprint,attempts:same?(old.attempts||0)+1:1,goals:goals.map(g=>({...g,status:'pending'})),lastAt:Date.now()};await ctx.checkpoint();
   await ctx.log?.(`自主接续：${goals.length} 个未完成目标。先补清单/发布和关联，再继续图片、视频和后期；已完成成果保留。`);
   let state=await readArt(ctx,true),published=await publishReady(ctx,state),repaired={restored:0,distributed:0,failures:[]};
   const canPlan=!same||!old.nextAgentAt||Date.now()>=old.nextAgentAt;
   if(canPlan&&api.productionWork){
    const plan=json(await work(ctx,'recovery-plan',[{role:'system',content:'你负责让影视制作继续到最终交付。根据真实错误判断根因，为阻塞下一步的项目设定可验证目标。程序支持发布就绪清单、补美术描述、复核旧绑定、重新分发缺绑定、补充缺卡、修复生图提示词、接续已有生成/下载及后期任务。余额不足须如实说明，未知提交不能重做。只返回JSON {"reason":"根因与接续策略","actions":["publish-ready|repair-art|repair-bindings|retry-images|retry-videos|retry-post|retry-prompts"]}，不返回任意脚本。'}, {role:'user',content:JSON.stringify({goals:goals.slice(0,60),completed:run.monitor?.art?.summary,recipes:(run.recipes||[]).slice(-8)})}]));
    if(typeof plan.reason!=='string'||!Array.isArray(plan.actions)||plan.actions.some(a=>!['publish-ready','repair-art','repair-bindings','retry-images','retry-videos','retry-post','retry-prompts'].includes(a)))throw Error('Agent 恢复策略格式无效，保留目标重试');
    run.recovery.plan=plan;run.recovery.nextAgentAt=Date.now()+Math.min(15*60*1000,30000*2**Math.min(run.recovery.attempts,5));await ctx.log?.(`Agent 接续策略：${plan.reason}`);await ctx.checkpoint();
    const agentApi={...api,aiChat:p=>work(ctx,'art-repair',p.messages)},profile={id:'production-agent',model:run.config.agentModel},job={cancelled:false,taskIds:[]};activeJobs.set(run.id,job);
    try{
     const episodes=listCollabEpisodes(state.p.episodes);
     for(const row of state.monitor.episodes.filter(e=>plan.actions.includes('repair-art')&&!e.changed&&e.scenes.some(s=>s.details))){ctx.guard();const record=state.store.snapshot().episodes[row.number],eligible=record.scenes.filter(s=>row.scenes.some(v=>v.id===s.id&&!v.published)).flatMap(s=>s.items.filter(needsArtReviewDetails));if(!eligible.length)continue;await ctx.log?.(`Agent 目标：补齐第 ${row.number} 集 ${eligible.length} 项美术描述，随后自动核实发布。`);await fillArtReviewDetails({store:state.store,project:state.p,episode:episodes.find(e=>e.episodeNumber===row.number),profile,api:agentApi,job,genre:state.p.genre||'',eligible});}
     state=await readArt(ctx,true);published+=await publishReady(ctx,state);if(plan.actions.includes('repair-bindings')||plan.actions.includes('retry-videos'))repaired=await repairAssociations(ctx);ctx.guard();
    }finally{activeJobs.delete(run.id);}
    if(repaired.restored||repaired.distributed||published){const final=await readArt(ctx,true),id='auto-repair-art-binding-v1',previous=run.recipes?.find(r=>r.id===id);run.recipes=[...(run.recipes||[]).filter(r=>r.id!==id),{id,trigger:'提示词已生成，但清单未发布、关联缺失或来源签名变化',steps:[...(published?['原清单描述已就绪时，自动核实并调用原发布接口，再读取发布凭据']:[]),...(repaired.restored?['Agent核对旧选择、原文锚点和同场身份，CAS保存并验证当前结构签名']:[]),...(repaired.distributed?['Agent定向分发缺失关联，重新读取并确认结构问题已清空']:[])],verified:true,verifiedAt:Date.now(),successes:(previous?.successes||0)+1,evidence:{published:final.monitor.summary.published,associated:final.monitor.summary.associated,restored:repaired.restored,distributed:repaired.distributed}}];await ctx.log?.('已验证本轮修复结果，保存为超创制作经验；剩余目标继续接续。','success');}
   }
   const fundingImages=(run.imageErrors||[]).filter(i=>isFundingError(i.error)),fundingVideo=(run.items||[]).filter(i=>isFundingError(i.error));
   const remaining=productionRecoveryGoals(run);run.recovery.goals=run.recovery.goals.map(g=>({...g,status:remaining.some(v=>v.kind===g.kind&&v.target===g.target)?'pending':'done'}));run.recovery.failures=repaired.failures;await ctx.checkpoint();
   if(fundingImages.length||fundingVideo.length)return {budget:true,reason:`${fundingImages.length?`生图主备渠道余额不足（${fundingImages.length} 项等待）`:''}${fundingImages.length&&fundingVideo.length?'；':''}${fundingVideo.length?`视频渠道余额不足（${fundingVideo.length} 项等待）`:''}。已保存成果，充值或更换已授权渠道后点击继续。`};
   for(const key of ['art','images'])if(run.stages[key]?.status==='partial')run.stages[key]={status:'pending'};
   return {retry:true,delay:published||repaired.restored||repaired.distributed?0:Math.min(300000,10000*2**Math.min(run.recovery.attempts,5))};
  },
  async pause(run){await api.productionStop?.({runId:run.id});const job=activeJobs.get(run.id);if(job){job.cancelled=true;job.wakeRetry?.();await Promise.allSettled((job.taskIds||[]).map(taskId=>api.cancelAiTask({taskId})));if(run.collabProjectId)await getArtDistributionController({api,accountId:getAccount().id,projectId:run.collabProjectId}).stop();}if(run.directorBatchId)await getQuick().pauseBatch(run.directorBatchId).catch(()=>{});}
 };
}
