import {bindingSnapshot,bindingHash,currentEntryBinding,saveDistribution} from './promptArtBinding.js';
import {selectBindingVersion,saveBindingVersion,promptSetId} from './promptBindingVersions.js';
import {applySceneDistribution,sceneDistributionMessages,sceneDistributionStamp,sceneCards} from './scenePromptDistribution.js';
import {isReviewCurrent,needsArtReviewDetails} from './artReview.js';
import {isArtDetailDeferred} from './artDeferredDetails.js';
import {runBindingRepair} from './importedArtBinding.js';
import {getArtModelQueue,requestArtModel} from './artModelQueue.js';
import {createTaskPool} from './asyncTaskPool.js';
import {listCollabEpisodes} from './collabEpisodes.js';

export function sceneReadyForPromptDistribution(project,ledger,sceneId){
 const number=Number(sceneId.split('-')[0]),episode=listCollabEpisodes(project.episodes).find(e=>e.episodeNumber===number),record=ledger.episodes?.[number];
 const scene=record?.scenes.find(s=>s.id===sceneId);
 return Boolean(episode&&isReviewCurrent(record,episode)&&record.status!=='empty'&&record.status!=='inventory-pending'&&scene?.mappingReady&&scene.items.length&&scene.items.every(i=>!needsArtReviewDetails(i)||isArtDetailDeferred(record,i)));
}

export function createPromptDistributionService({api,projectId,accountId,getContext,onSaved,concurrency}){
 let context=getContext,writer=Promise.resolve(),generation=0,notice='',paused=false;
 const tasks=new Map(),maintenance=new Set(),listeners=new Set(),modelQueue=getArtModelQueue(api),lane=concurrency?createTaskPool(concurrency):null;
 const emit=()=>listeners.forEach(fn=>fn());
 const entrySceneId=id=>{const label=context().project.episodes.flatMap(e=>e.prompts||[]).find(p=>p.id===id)?.label,match=/^(\d+)-(\d+)-(\d+)$/.exec(String(label||''));return match?`${Number(match[1])}-${Number(match[2])}`:null;};
 modelQueue.subscribe(emit);
 const read=async versionId=>{
  const saved=await api.promptArtLoad({projectId,accountId}),ctx=context();
  if(ctx.project.id!==projectId)throw Error('项目已变化');
  const current=bindingSnapshot(ctx.project,ctx.ledger,ctx.assets||[],saved?.snapshot);
  return {saved,ctx,currentSnapshot:current,...selectBindingVersion(current,saved,versionId)};
 };
 const mutate=(versionId,reduce)=>{
  const task=writer.then(async()=>{
   for(let attempt=0;attempt<4;attempt++){
    const state=await read(versionId),data=reduce(state);
    try{const next=await api.promptArtSave({projectId,accountId,baseRevision:state.saved?.revision||0,data});onSaved?.(next);emit();return next;}
    catch(error){if(!/另一窗口|记录.*更新/.test(error.message)||attempt===3)throw error;}
   }
  });writer=task.catch(()=>{});return task;
 };
 const service={
  configure(fn){context=fn;},read,mutate,getContext:()=>context(),
  async withSceneMaintenance(sceneId,fn){
   if(maintenance.has(sceneId))throw Error('本场正在补充，请完成后再试');
   maintenance.add(sceneId);emit();
   try{
    const state=await read(),ids=state.snapshot.entries.filter(e=>e.sceneId===sceneId).map(e=>e.id);
    if(ids.some(id=>tasks.has(id))||Object.values(state.saved?.sceneDistributionAttempts||{}).some(a=>a.status==='running'&&a.startedAt>Date.now()-10*60*1000&&ids.some(id=>a.label===state.snapshot.entries.find(e=>e.id===id)?.label)))throw Error('本场正在模型分发，请完成后再补充');
    return await fn();
   }finally{maintenance.delete(sceneId);emit();}
  },
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  isBusy:id=>tasks.has(id)||maintenance.has(entrySceneId(id)),
  status:()=>({working:tasks.size>0,entryIds:[...tasks.keys()],notice,paused,...modelQueue.status()}),
  resume(){paused=false;emit();},
  async stop(){paused=true;generation++;modelQueue.notify();const ids=[...tasks.values()].filter(t=>!t.manual).flatMap(t=>t.taskIds);await Promise.allSettled(ids.map(taskId=>api.cancelAiTask?.({taskId})));emit();},
  run(entryId,{profile,manual=false,versionId,job={}}={}){
   const sceneId=entrySceneId(entryId);
   if(maintenance.has(sceneId))return Promise.reject(Error('本场正在补充，请完成后再分发'));
   if(tasks.has(entryId))return tasks.get(entryId).promise;
   if(paused&&!manual)return Promise.reject(Error('已暂停自动分发'));
   if(!profile)return Promise.reject(Error('请选择分发模型'));
   const token=generation,task={manual,taskIds:[]};
   const stopped=()=>job.cancelled||(!manual&&generation!==token);
   task.promise=(lane&&!manual?lane.run:fn=>Promise.resolve().then(fn))(async()=>{
    let claimKey,stamp,owner,selectedId,decisionToken,captured;
    try{
     if(stopped())throw Error('任务已停止');
     let state=await read(versionId);const entry=state.snapshot.entries.find(e=>e.id===entryId);
     if(!entry||!sceneReadyForPromptDistribution(state.ctx.project,state.ctx.ledger,entry.sceneId))throw Error('场景清单尚未分析完成，请先分析本场清单');
     selectedId=state.snapshot.versionId;stamp=sceneDistributionStamp(state.snapshot,entry);claimKey=selectedId+':'+entryId;
     const followedCurrent=selectedId===promptSetId(state.currentSnapshot);
     const previous=state.saved?.sceneDistributionAttempts?.[claimKey];
     if(!manual&&previous?.stamp===stamp&&previous.status==='done'&&state.decisions[entryId]?.origin==='scene-inventory-ai')return state.decisions[entryId];
     captured=state;owner=crypto.randomUUID();decisionToken=bindingHash(state.decisions[entryId]||null);
     await mutate(selectedId,latest=>{
      if(stopped())throw Error('任务已停止');
      if(followedCurrent&&promptSetId(latest.currentSnapshot)!==selectedId)throw Error('提示词来源版本已变化，旧分发未应用');
      state=latest;captured=latest;stamp=sceneDistributionStamp(latest.snapshot,latest.snapshot.entries.find(e=>e.id===entryId));decisionToken=bindingHash(latest.decisions[entryId]||null);
      const running=latest.saved?.sceneDistributionAttempts?.[claimKey];
      if(running?.status==='running'&&running.startedAt>Date.now()-10*60*1000)throw Error('本条正在另一窗口分发，请稍后再试');
      return {...saveBindingVersion(latest.saved,latest.snapshot,latest.decisions),sceneDistributionAttempts:{...latest.saved?.sceneDistributionAttempts,[claimKey]:{stamp,status:'running',owner,startedAt:Date.now(),label:entry.label}}};
     });
     // Seed only persisted/manual choices. Heuristic suggestions never become a result.
     const seeded=currentEntryBinding(state.snapshot,entry,state.decisions[entryId]);
     const seed={...seeded,needs:state.decisions[entryId]?.signature===seeded.signature?state.decisions[entryId].needs:seeded.needs.filter(n=>n.locked),issue:''};
     notice=`${manual?'重新':'自动'}分发 ${entry.label}`;emit();
     const result=await runBindingRepair({messages:sceneDistributionMessages(state.snapshot,entry,seed),call:messages=>{
      const taskId=crypto.randomUUID();task.taskIds.push(taskId);job.taskIds||=[];job.taskIds.push(taskId);
      const cardCount=state.snapshot.entries.find(e=>e.id===entryId)?sceneCards(state.snapshot,state.snapshot.entries.find(e=>e.id===entryId)).length:0;
      return requestArtModel(api,{...structuredClone(profile),profileId:profile.id,messages,taskId,maxOutputTokens:Math.min(8192,Math.max(2048,512+cardCount*64)),analysisMode:true},{manual,job,isStopped:stopped});
     },isStopped:stopped,validate:raw=>applySceneDistribution(state.snapshot,entry,seed,raw)});
     if(stopped())throw Error('任务已停止');
     await mutate(selectedId,latest=>{
      if(stopped())throw Error('任务已停止');
      if(followedCurrent&&promptSetId(latest.currentSnapshot)!==selectedId)throw Error('提示词来源版本已变化，旧分发未应用');
      const current=latest.snapshot.entries.find(e=>e.id===entryId);
      if(!current||sceneDistributionStamp(latest.snapshot,current)!==stamp)throw Error('本条来源或场景清单已变化，旧分发未应用');
      if(bindingHash(latest.decisions[entryId]||null)!==decisionToken)throw Error('分发期间关联已被人工修改，已保留最新选择');
      if(latest.saved.sceneDistributionAttempts?.[claimKey]?.owner!==owner)throw Error('本条分发任务已变化');
      const rebased={...result,signature:currentEntryBinding(latest.snapshot,current).signature};
      const decisions={...latest.decisions,[entryId]:saveDistribution(latest.snapshot,current,rebased)};
      return {...saveBindingVersion(latest.saved,latest.snapshot,decisions),sceneDistributionAttempts:{...latest.saved.sceneDistributionAttempts,[claimKey]:{stamp,status:'done',label:entry.label}}};
     });
     notice=`已分发 ${entry.label}`;return result;
    }catch(error){
     if(captured&&owner)try{await mutate(selectedId,latest=>{
      if(latest.saved?.sceneDistributionAttempts?.[claimKey]?.owner!==owner)throw Error('其他任务已接手');
      return {...saveBindingVersion(latest.saved,latest.snapshot,latest.decisions),sceneDistributionAttempts:{...latest.saved.sceneDistributionAttempts,[claimKey]:{stamp,status:'failed',label:captured.snapshot.entries.find(e=>e.id===entryId)?.label,error:error.message}}};
     });}catch{/* Never overwrite a newer decision just to record failure. */}
     notice=error.message;throw error;
    }
   });
   tasks.set(entryId,task);emit();
   const done=()=>{tasks.delete(entryId);emit();};task.promise.then(done,done);return task.promise;
  }
 };
 return service;
}

const registries=new WeakMap();
export function getPromptDistributionService(options){
 const {api,projectId,accountId}=options;let registry=registries.get(api);if(!registry){registry=new Map();registries.set(api,registry);}
 const key=accountId+':'+projectId;if(!registry.has(key))registry.set(key,createPromptDistributionService(options));
 const service=registry.get(key);if(options.getContext)service.configure(options.getContext);return service;
}
