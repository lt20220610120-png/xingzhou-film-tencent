import {withStorageWork} from './storageWork.js';
import {getArtReviewStore,summarizeArtReview} from './artReviewPersistence.js';
import {runArtReviewAnalysis} from './artReviewRunner.js';
import {artWorkflowState} from './artWorkflow.js';
import {ensureArtScriptContext} from './artScriptContext.js';
import {reconcileArtDeferredDetails} from './artDeferredReconciliation.js';

const retryDelay=attempt=>Math.min(60000,2000*2**Math.min(attempt-1,5));
function waitForRetry(ms,job){
 if(job.cancelled)return Promise.resolve();
 return new Promise(resolve=>{const done=()=>{clearTimeout(timer);if(job.wakeRetry===done)delete job.wakeRetry;resolve();};const timer=setTimeout(done,ms);job.wakeRetry=done;if(job.cancelled)done();});
}

// The existing runner remains a single, checkpointed pass for guided and manual
// maintenance. Automatic mode defers evidence-poor cards after three attempts.
export const runContinuousArtAnalysis=args=>withStorageWork(async()=>{
 const {project,api,job={},onProgress}=args;
 // getArtReviewStore is project-ID scoped, never script-name scoped.
 const scoped=getArtReviewStore({api,projectId:project.id,accountId:args.accountId||''});
 await scoped.load(project,args.existingAssets||[]);
 if(args.workflow)await scoped.setWorkflow(args.workflow);
 const maintenance=args.detailsOnly||args.mapOnly||args.focusItem||args.targetEpisodeNumbers?.length;
 const continuous=!maintenance&&artWorkflowState(scoped.snapshot(),project).mode==='automatic';
 const notes=new Set(scoped.snapshot().analysisRun?.notes||[]);
 const checkpoint=async status=>scoped.setAnalysisRun({status,notes:[...notes],updatedAt:Date.now()});
 const retry=async(reason,attempt,label)=>{
  const text=String(reason||'模型回包尚未完整'),delay=retryDelay(attempt);
  notes.add(`${label}自动修复：${text}`);
  await checkpoint('retrying');job.retryAttempt=attempt;job.notice=`${label} · 自动补全第 ${attempt} 次，${delay/1000} 秒后重试：${text}`;onProgress?.();
  await (args.waitForRetry||waitForRetry)(delay,job);
 };
 let context,contextAttempt=0;
 while(!job.cancelled){
  try{context=await ensureArtScriptContext({...args,store:scoped});break;}
  catch(error){if(error.artCheckpointFailure||!continuous)throw error;await retry(error.message,++contextAttempt,'全剧背景');}
 }
 if(context&&!job.cancelled&&api.collabUpdateProject&&project.genre!==context.genre&&!context.cloudSynced){
  try{await api.collabUpdateProject({projectId:project.id,updates:{genre:context.genre}});await scoped.setContext({...context,cloudSynced:true});}
  catch(error){if(error.artCheckpointFailure)throw error;notes.add('全剧背景已保存在本机；云端同步待核对：'+String(error.message||error));}
 }
 const genre=context?.genre||args.genre||project.genre||'';
 if(!job.cancelled&&!continuous){
  const result=await runArtReviewAnalysis({...args,genre});await checkpoint(job.cancelled?'stopped':result.errors.length?'paused':'idle');return {...result,scriptContext:context};
 }
 let attempt=0,episodeNumber=null,feedback=[];
 if(!job.cancelled)await reconcileArtDeferredDetails({...args,store:scoped,genre});
 while(!job.cancelled){
  const state=artWorkflowState(scoped.snapshot(),project);
  if(state.phase!=='generate')break;
  if(episodeNumber!==state.episodeNumber){episodeNumber=state.episodeNumber;attempt=0;feedback=[];}
  job.retryAttempt=attempt;job.repairFeedback=feedback;
  const result=await runArtReviewAnalysis({...args,genre,targetEpisodeNumbers:[episodeNumber],repairFeedback:feedback,detailBatchSize:attempt>=2?1:6,deferMissing:true});
  if(job.cancelled)break;
  const after=artWorkflowState(scoped.snapshot(),project);
  if(after.phase!=='generate'||after.episodeNumber!==episodeNumber){
   await scoped.update(episodeNumber,r=>{delete r.failure;return r;});
   if(attempt)notes.add(`第 ${episodeNumber} 集已完成本轮分析，未决信息已标记等待后文。`);
   await reconcileArtDeferredDetails({...args,store:scoped,genre});
   await checkpoint('running');continue;
  }
  feedback=result.errors?.length?result.errors:['本集仍有未完成的清单、场景关联或描述，请仅补齐这些缺漏。'];
  await retry(feedback.join('；'),++attempt,`第 ${episodeNumber} 集`);
 }
 if(!job.cancelled&&artWorkflowState(scoped.snapshot(),project).phase==='complete')await reconcileArtDeferredDetails({...args,store:scoped,genre,final:true});
 const state=artWorkflowState(scoped.snapshot(),project);
 await checkpoint(job.cancelled?'stopped':state.phase==='complete'?'complete':'paused');
 return {...summarizeArtReview(scoped.snapshot(),project),scriptContext:context,errors:state.phase==='identity-conflict'?[state.message]:[]};
});
