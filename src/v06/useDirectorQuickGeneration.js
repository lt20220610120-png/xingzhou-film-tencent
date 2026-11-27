import {directorEditionKey,sameDirectorEdition} from '../../core/directorPromptEditions.js';
import {createDirectorCheckpointReader} from '../../core/directorRunView.js';
import {storageWorkBusy} from '../../core/storageWork.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createQuickGenerationController, isQuickRunActive } from '../../core/directorQuickGeneration.js';
import { commitQuickSceneRun,directorSceneInput } from '../../core/directorQuickStore.js';
import { executeSkillWithAi, assertMessageCapacity } from '../../core/skillExecution.js';
import { parseDirectorScenes } from '../../core/scriptImport.js';
import { createDirectorBatchPlan, createDirectorBatchController, isDirectorBatchActive } from '../../core/directorBatchGeneration.js';
import { createDirectorCloudSync } from '../../core/directorCloudSync.js';
import { acknowledgeDirectorCloudSave } from '../../core/directorCloudProjects.js';
import {flushEditing} from '../editing.js';
import {createDirectorManualController,commitManualSceneRun} from '../../core/directorManualGeneration.js';
import {directorJobs} from '../../core/backgroundJobs.js';
import {beginDirectorSceneGeneration} from '../../core/directorGenerationSession.js';
import {sameJson} from '../../core/threeWayMerge.js';
import {estimateVideoDurations,normalizeVideoDurationLimit} from '../../core/videoDurationEstimator.js';
import {requestVideoDurationText} from '../../core/videoDurationRequest.js';
import {applyDirectorDurationResult,commitDirectorResegment,directorDurationTargets} from '../../core/directorDurationWorkflow.js';

function browserCheckpoints(accountRef) {
  const key=()=>`xz-director-quick-runs:${accountRef.current || 'signed-out'}`;
  const read=()=>JSON.parse(localStorage.getItem(key())||'{}');
  return {
    list:async()=>Object.values(read()),load:async({runId})=>read()[runId]||null,
    save:async({run})=>{if(run.snapshot.accountId!==accountRef.current)throw new Error('账号已切换，进度未覆盖');const data=read();data[run.id]=run;localStorage.setItem(key(),JSON.stringify(data));},
  };
}

/** Lives in App, so a scene or page switch never drops an in-flight transaction. */
export function useDirectorQuickGeneration({state,stateRef,setState,api,accountId,persistence,initialized}) {
  const accountRef=useRef(accountId);accountRef.current=accountId;
  const directorySwitchRef=useRef(false),directoryEpochRef=useRef(0);
  const [restoreError,setRestoreError]=useState('');
  const progress=useMemo(()=>{
    const listeners=new Set();let revision=0;
    return {publish:()=>{revision++;for(const listener of listeners)listener();},getRevision:()=>revision,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);}};
  },[]);
  const controllerRef=useRef(null);
  const durationTasks=useRef(new Map());
  const durationStatus=useRef(new Map());
  const estimateRunner=useRef(null);
  const manualControllerRef=useRef(null);
  const batchControllerRef=useRef(null),cloudSyncRef=useRef(null);
  if(!controllerRef.current){
    const getContext=target=>{
      const current=stateRef.current;
      const project=current.directorProjects?.find(p=>p.id===target.projectId);
      const episode=project?.episodes?.find(e=>e.id===target.episodeId);
      const episodeNumber=project?.episodes?.filter(e=>e.kind!=='setting'&&e.title!=='设定和小传').findIndex(e=>e.id===target.episodeId)+1;
      const scene=episode&&parseDirectorScenes(episode.content,episodeNumber).find(s=>s.label===target.sceneLabel);
      return {accountId:accountRef.current,project,episode,inputText:scene?(episode.quickSceneEdits?.[target.sceneLabel]??scene.content):undefined,
        skill:current.skills?.find(s=>s.id===target.skillId),profile:current.apiProfiles?.find(p=>p.id===target.profileId),
        permissions:{canGenerate:Boolean(scene)&&!directorySwitchRef.current&&!project?.cloudLocked&&!project?.cloudConflict&&!project?.cloudLiveNeedsRepair&&project?.canWrite!==false&&project?.permissions?.canGenerate!==false&&project?.permissions?.canWrite!==false&&episode?.canWrite!==false}};
    };
    const readList=createDirectorCheckpointReader({readPage:options=>api.directorQuickListRuns({...options,compactCompleted:true}),getScope:()=>accountRef.current+':'+directoryEpochRef.current,onIssues:issues=>setRestoreError(`有 ${issues.length} 条旧任务记录无法读取，其他进度已恢复；原文件已保留。`)});
    const checkpoints=api.directorQuickSaveRun?{
      list:readList,load:p=>api.directorQuickLoadRun(p),save:p=>api.directorQuickSaveRun(p),compactCompleted:true,
    }:browserCheckpoints(accountRef);
    const unwrap=result=>{
      if(result?.ok===false)throw Object.assign(new Error(result.error||'生成失败'),{partialText:result.partialText||'',code:result.code||'FAILED'});
      return result?.output ?? result;
    };
    const estimateRequests=new Map();
    const cancelRequest=taskId=>{
      const worker=estimateRequests.get(taskId);
      if(worker)worker.abort();else return api.cancelAiTask?.({taskId});
    };
    const estimate=async({segments,maxDurationSeconds,snapshot,taskId,signal,onEstimates,onProgress})=>{
      const profileId=snapshot.estimateProfileId||snapshot.profileId;
      const worker=new AbortController();estimateRequests.set(taskId,worker);
      const activeSignal=signal?AbortSignal.any([signal,worker.signal]):worker.signal;
      let attempt=0;
      try{return await estimateVideoDurations({segments,maxDurationSeconds,signal:activeSignal,onEstimates,onProgress,request:async({messages,maxOutputTokens,signal:requestSignal})=>{
        const profile=stateRef.current.apiProfiles?.find(row=>row.id===profileId);
        if(!profile)throw new Error('估时模型已移除，请重新选择');
        if(accountRef.current!==snapshot.accountId||directorySwitchRef.current)throw new Error('账号或资料位置已变化');
        assertMessageCapacity(messages,profile,{maxOutputTokens});
        return requestVideoDurationText({api,profile,taskId:`${taskId}:${++attempt}`,messages,maxOutputTokens,signal:requestSignal});
      }});}finally{estimateRequests.delete(taskId);}
    };
    estimateRunner.current=estimate;
    const commit=async(run,partial=false)=>{
      if(accountRef.current!==run.snapshot.accountId)return {applied:false,conflict:'账号已切换'};
      const apply=current=>{
        const result=commitQuickSceneRun({...current,accountId:accountRef.current},run,{partial});
        return result.applied?{...result,state:{...current,directorProjects:result.state.directorProjects}}:result;
      };
      if(run.durationRepair&&!partial){
        const directory=directoryEpochRef.current;
        return commitDirectorResegment({read:()=>stateRef.current,apply,publish:setState,
          save:value=>persistence.saveAndConfirm(value),
          isCurrent:()=>accountRef.current===run.snapshot.accountId&&directoryEpochRef.current===directory&&!directorySwitchRef.current});
      }
      let result;
      // App's setter publishes the latest ref synchronously. Every parallel
      // scene merges inside that setter, so another scene's saved results and
      // concurrent user edits remain part of this exact persisted snapshot.
      setState(current=>{
        result=apply(current);
        return result.applied?result.state:current;
      });
      if(!result.applied)return result;
      persistence.enqueue(stateRef.current);await persistence.flush();
      return {applied:true};
    };
    const beginRun=async run=>{let result;setState(current=>{result=beginDirectorSceneGeneration({...current,accountId:accountRef.current},run);return result.applied?{...current,directorProjects:result.state.directorProjects}:current;});if(!result.applied)return result;persistence.enqueue(stateRef.current);await persistence.flush();return{applied:true};};
    controllerRef.current=createQuickGenerationController({beginRun,estimateScene:estimate,
      getContext,checkpoints,onChange:progress.publish,cancelRequest,
      groundedTiming:true,editorialPlanning:true,maxQualityAttempts:3,
      executeText:async({messages,taskId,snapshot,maxOutputTokens=16384})=>{
        const context=getContext(snapshot),profile=context.profile;
        if(!profile)throw new Error('所选模型已不存在');
        assertMessageCapacity(messages,profile,{maxOutputTokens});
        return unwrap(await api.aiChat({...profile,profileId:profile.id,messages,taskId,resultEnvelope:true,maxOutputTokens,analysisMode:true}));
      },
      executeSkill:async({input,beforeUserMessages,taskId,snapshot,skillId,maxOutputTokens=16384})=>{
        const context=getContext(snapshot);
        return executeSkillWithAi({api,state:stateRef.current,profile:context.profile,skillId,input,beforeUserMessages,
          assistantRole:'行舟影视导演提示词助手',requestOptions:{taskId,resultEnvelope:true,maxOutputTokens,analysisMode:true}});
      },
      commitProgress:run=>commit(run,true),commitRun:run=>commit(run),
    });
    manualControllerRef.current=createDirectorManualController({getContext,checkpoints,beginRun,estimateScene:estimate,onChange:progress.publish,cancelRequest,
      executeSkill:async({input,taskId,snapshot,skillId,maxOutputTokens})=>executeSkillWithAi({api,state:stateRef.current,profile:getContext(snapshot).profile,skillId,input,assistantRole:'行舟影视导演提示词助手',requestOptions:{taskId,resultEnvelope:true,maxOutputTokens,analysisMode:true}}),
      reviewSkill:async({input,beforeUserMessages,taskId,snapshot,skillId,maxOutputTokens})=>executeSkillWithAi({api,state:stateRef.current,profile:getContext(snapshot).profile,skillId,input,beforeUserMessages,assistantRole:'行舟影视导演提示词复核Agent',requestOptions:{taskId,resultEnvelope:true,maxOutputTokens,analysisMode:true}}),
      commitRun:async run=>{if(accountRef.current!==run.snapshot.accountId)return{applied:false,conflict:'账号已切换'};let result;setState(current=>{result=commitManualSceneRun({...current,accountId:accountRef.current},run);return result.applied?{...current,directorProjects:result.state.directorProjects}:current;});if(!result.applied)return result;persistence.enqueue(stateRef.current);await persistence.flush();return{applied:true};},
    });
    const childFor=id=>manualControllerRef.current.get(id)?manualControllerRef.current:controllerRef.current;
    const batchScenes={get:id=>childFor(id).get(id),start:(context,opts)=>(context.segmentationMode==='manual'?manualControllerRef.current:controllerRef.current).start(context,opts),
      resume:async id=>((await checkpoints.load({runId:id}))?.kind==='manual-scene'?manualControllerRef.current:controllerRef.current).resume(id),
      stop:id=>childFor(id).stop(id),pauseAfterRequest:id=>childFor(id).pauseAfterRequest(id)};
    batchControllerRef.current=createDirectorBatchController({sceneController:batchScenes,checkpoints,getContext,onChange:progress.publish});
  }
  const controller=controllerRef.current;
  const manualController=manualControllerRef.current;
  const batchController=batchControllerRef.current;
  if(!cloudSyncRef.current)cloudSyncRef.current=createDirectorCloudSync({
    manualOnly:true,
    onBusyChange:progress.publish,
    getContext:()=>({accountId:accountRef.current,projects:stateRef.current.directorProjects||[]}),
    updateProject:args=>api.directorCollabPublishVersion(args),
    acknowledge:({cloud,submitted,projectId})=>setState(current=>({...current,directorProjects:acknowledgeDirectorCloudSave(current.directorProjects||[],cloud,submitted).map(p=>p.id===projectId?{...p,cloudSyncError:''}:p)})),
    onConflict:({projectId,message})=>setState(current=>({...current,directorProjects:(current.directorProjects||[]).map(p=>p.id===projectId?{...p,cloudSyncError:message}:p)})),
  });
  const cloudSync=cloudSyncRef.current;
  useEffect(()=>{
    if(!initialized||!accountId)return;
    let live=true;
    Promise.all([controller.restore(),manualController.restore(),batchController.restore()]).catch(e=>{if(live)setRestoreError(e.message);});
    return()=>{live=false;for(const active of durationTasks.current.values())active.abort();durationTasks.current.clear();durationStatus.current.clear();cloudSync.pause();batchController.pauseAll().catch(()=>{});controller.pauseAll().catch(()=>{});manualController.pauseAll().catch(()=>{});};
  },[accountId,initialized]);
  // Editing is local. Only an explicit upload publishes a captured version.
  useEffect(()=>{controller.activate();manualController.activate();batchController.activate();cloudSync.activate();return()=>{batchController.dispose();controller.dispose();manualController.dispose();cloudSync.dispose();};},[]);
  return useMemo(()=>{
  let seenRevision=-1,runs,batches;
  const summaries=()=>{
    const revision=progress.getRevision();
    if(revision!==seenRevision){
      seenRevision=revision;
      runs=[...controller.entries({summary:true}),...manualController.entries({summary:true})].filter(run=>run.snapshot.accountId===accountId);
      batches=batchController.entries({summary:true}).filter(batch=>batch.snapshot.accountId===accountId);
    }
    return {runs,batches};
  };
  const assertNoSingleWork=projectId=>{const prefix=JSON.stringify([accountRef.current,projectId]).slice(0,-1)+',';if(durationTasks.current.has(projectId)||directorJobs.entries().some(([key,job])=>key.startsWith(prefix)&&job.status==='running')||[...controller.entries({summary:true}),...manualController.entries({summary:true})].some(r=>r.snapshot.accountId===accountRef.current&&r.snapshot.projectId===projectId&&isQuickRunActive(r)))throw new Error('本项目有场景正在生成或估时，请稍后继续');};
  const freshSceneRequest=request=>{flushEditing();const current=stateRef.current,project=current.directorProjects?.find(p=>p.id===request.project.id),episode=project?.episodes?.find(e=>e.id===request.episode.id);if(!project||!episode)throw Error('项目或分集已变化');return{...request,maxDurationSeconds:normalizeVideoDurationLimit(request.maxDurationSeconds),accountId:accountRef.current,project,episode,inputText:directorSceneInput(project,episode,request.sceneLabel),skill:current.skills?.find(s=>s.id===request.skill?.id),profile:current.apiProfiles?.find(p=>p.id===request.profile?.id)};};
  const estimateSaved=async ({projectId,profileId,estimateProfileId,...scope})=>{
    flushEditing();assertNoSingleWork(projectId);
    if(durationTasks.current.has(projectId)||directorySwitchRef.current||summaries().batches.some(batch=>batch.snapshot.projectId===projectId&&isDirectorBatchActive(batch)))throw Error('本项目正在生成或估时，请稍后重试');
    const account=accountRef.current,directory=directoryEpochRef.current;
    const project=stateRef.current.directorProjects?.find(p=>p.id===projectId);
    const writable=current=>current&&!current.cloudLocked&&!current.cloudConflict&&!current.cloudLiveNeedsRepair&&current.canWrite!==false&&current.permissions?.canWrite!==false&&current.permissions?.canGenerate!==false;
    if(!writable(project))throw Error('当前项目锁定或无权估时');
    if(!stateRef.current.apiProfiles?.some(row=>row.id===(estimateProfileId||profileId)))throw Error('请选择估时模型');
    const targets=directorDurationTargets(project,scope);
    if(!targets.length)return {total:0};
    const latestProject=()=>stateRef.current.directorProjects?.find(p=>p.id===projectId);
    const current=()=>accountRef.current===account&&directoryEpochRef.current===directory&&!worker.signal.aborted&&writable(latestProject())&&sameDirectorEdition(latestProject(),{projectId,promptEditionId:directorEditionKey(project)});
    const worker=new AbortController();durationTasks.current.set(projectId,worker);
    const status={account,editionId:directorEditionKey(project),episodeId:scope.episodeId,sceneLabel:scope.sceneLabel,running:true,
      total:targets.reduce((count,target)=>count+target.prompts.length,0),succeeded:0,failed:0,retryId:null};
    const report=updates=>{if(durationTasks.current.get(projectId)!==worker)return;Object.assign(status,updates);durationStatus.current.set(projectId,{...status});progress.publish();};
    report({});
    try{
      for(const target of targets){
        if(!current())break;
        const live=latestProject().episodes.find(episode=>episode.id===target.episodeId);
        const prompts=target.prompts.filter(frozen=>live?.prompts?.some(row=>row.id===frozen.id&&row.content===frozen.content));
        if(!prompts.length)continue;
        const seen=new Set();
        const onEstimates=async updates=>{
          if(!current())return;
          const fresh=new Map([...updates].filter(([id])=>!seen.has(id)));
          if(!fresh.size)return;
          let applied=[];
          setState(state=>({...state,directorProjects:state.directorProjects.map(row=>{
            if(row.id!==projectId||!writable(row)||!sameDirectorEdition(row,{projectId,promptEditionId:directorEditionKey(project)}))return row;
            const next=applyDirectorDurationResult(row,target,fresh);
            if(next!==row){
              const previous=row.episodes.find(ep=>ep.id===target.episodeId).prompts;
              applied=next.episodes.find(ep=>ep.id===target.episodeId).prompts.filter((prompt,index)=>prompt!==previous[index]);
            }
            return next;
          })}));
          for(const id of fresh.keys())seen.add(id);
          if(!applied.length)return;
          persistence.enqueue(stateRef.current);await persistence.flush();
          if(current())report({succeeded:status.succeeded+applied.filter(prompt=>prompt.durationEstimate?.status==='estimated').length,
            failed:status.failed+applied.filter(prompt=>prompt.durationEstimate?.status==='pending').length});
        };
        const estimates=await estimateRunner.current({segments:prompts.map(p=>({id:p.estimateId||p.label,prompt:p.content,script:p.script})),maxDurationSeconds:target.limit,
          snapshot:{accountId:account,profileId,estimateProfileId},taskId:`director-duration-manual-${crypto.randomUUID()}`,signal:worker.signal,onEstimates,
          onProgress:({retryId})=>{
            const original=prompts.find(prompt=>(prompt.estimateId||prompt.label)===retryId);
            if(!current()||original&&!latestProject()?.episodes.find(ep=>ep.id===target.episodeId)?.prompts?.some(prompt=>prompt.id===original.id&&prompt.content===original.content))worker.abort();
            worker.signal.throwIfAborted();
            report({retryId:retryId||null});
          }});
        await onEstimates(estimates);
      }
      return {...status};
    }catch(error){if(!worker.signal.aborted)throw error;return {cancelled:true};}
    finally{report({running:false,cancelled:worker.signal.aborted,retryId:null});if(durationTasks.current.get(projectId)===worker)durationTasks.current.delete(projectId);progress.publish();}
  };
  return {
    startManualScene:request=>directorySwitchRef.current||durationTasks.current.has(request.project.id)?Promise.reject(new Error('资料位置正在切换或项目正在估时，请稍后生成')):manualController.start(freshSceneRequest(request)),
    startScene:request=>directorySwitchRef.current||durationTasks.current.has(request.project.id)?Promise.reject(new Error('资料位置正在切换或项目正在估时，请稍后生成')):controller.start(freshSceneRequest(request)),resume:(runId,options)=>directorySwitchRef.current?Promise.reject(new Error('资料位置正在切换，请稍后继续')):controller.resume(runId,options),stop:runId=>controller.stop(runId),
    get runs(){return summaries().runs;},restoreError,subscribe:progress.subscribe,getRevision:progress.getRevision,
    saveLocal:async()=>{persistence.enqueue(stateRef.current);await persistence.flush();},
    getManualSceneRun:id=>manualController.get(id),
    resumeManualScene:id=>directorySwitchRef.current?Promise.reject(new Error('资料位置正在切换，请稍后继续')):manualController.resume(id),
    stopManualScene:id=>manualController.stop(id),
    getSceneManualRuns:(projectId,episodeId,sceneLabel)=>manualController.entries({projectId,episodeId,sceneLabel,accountId}).filter(run=>sameDirectorEdition(stateRef.current.directorProjects?.find(p=>p.id===projectId),run.snapshot)),
    previewBatch:request=>createDirectorBatchPlan({...request,maxDurationSeconds:normalizeVideoDurationLimit(request.maxDurationSeconds),accountId}),
    estimateSaved,isProjectEstimating:projectId=>durationTasks.current.has(projectId),cancelEstimate:projectId=>durationTasks.current.get(projectId)?.abort(),
    getEstimateStatus:projectId=>{const status=durationStatus.current.get(projectId);return status&&status.account===accountId&&status.editionId===directorEditionKey(stateRef.current.directorProjects?.find(p=>p.id===projectId))?status:null;},
    resegmentScene:async(projectId,runId)=>{
      flushEditing();assertNoSingleWork(projectId);
      if(directorySwitchRef.current||summaries().batches.some(batch=>batch.snapshot.projectId===projectId&&isDirectorBatchActive(batch)))throw Error('本项目正在处理整本任务，请稍后重分');
      const run=await controller.resegment(runId);
      if(run.durationRepair?.error||run.phase==='stale')throw Error(run.errors?.[0]?.message||run.durationRepair?.error||'场景已变化，已保留原稿');
      return run;
    },
    startBatch:async plan=>{if(directorySwitchRef.current)throw new Error('资料位置正在切换');assertNoSingleWork(plan.snapshot.projectId);return batchController.start(plan);},
    resumeBatch:async id=>{if(directorySwitchRef.current)throw new Error('资料位置正在切换');const batch=batchController.get(id);if(!batch)throw new Error('找不到整本任务');if(!isDirectorBatchActive(batch))assertNoSingleWork(batch.snapshot.projectId);return batchController.resume(id);},
    pauseBatch:id=>batchController.pause(id),cancelBatch:id=>batchController.cancel(id),
    getBatch:id=>batchController.get(id),
    getProjectBatch:projectId=>{const row=summaries().batches.filter(b=>b.snapshot.projectId===projectId&&sameDirectorEdition(stateRef.current.directorProjects?.find(p=>p.id===projectId),b.snapshot)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];return row?batchController.get(row.id):null;},
    isProjectBatchActive:projectId=>summaries().batches.some(b=>b.snapshot.projectId===projectId&&isDirectorBatchActive(b)),
    isCloudSaving:cloudSync.isSaving,getCloudProject:id=>stateRef.current.directorProjects?.find(p=>p.id===id),
    uploadCloudProject:async id=>{
      if(directorySwitchRef.current)throw new Error('资料位置正在切换，请稍后上传');
      flushEditing();
      const account=accountRef.current;
      const project=stateRef.current.directorProjects?.find(p=>p.id===id);
      if(!project?.cloudBase&&!project?.cloudRemote)throw new Error('尚未取得云端版本，请刷新后重试');
      if(project.cloudLocked||project.canWrite===false||project.permissions?.canWrite===false)throw new Error('项目已锁定或没有写入权限，本地版本已保留');
      const document={name:project.name,script:project.masterScript||'',episodes:project.episodes||[]},previous=project.pendingCloudSubmission,base=project.cloudBase||project.cloudRemote;
      const submission=previous&&sameJson(previous.document,document)&&sameJson(previous.base,base)?previous:{id:crypto.randomUUID(),document:structuredClone(document),base:structuredClone(base),conflictOnly:Boolean(project.cloudConflict),createdAt:new Date().toISOString()};
      setState(current=>({...current,directorProjects:current.directorProjects.map(p=>p.id===id?{...p,pendingCloudSubmission:submission,localCollaborationVersions:previous?.id===submission.id?p.localCollaborationVersions:[...(p.localCollaborationVersions||[]),submission]}:p)}));
      persistence.enqueue(stateRef.current);await persistence.flush();
      if(account!==accountRef.current)throw new Error('账号已切换，本地版本已保留');
      if(directorySwitchRef.current||stateRef.current.directorProjects?.find(p=>p.id===id)?.cloudProjectId!==project.cloudProjectId)throw new Error('项目或资料位置已变化，本地版本已保留，请重新上传');
      const result=await cloudSync.flush(id,submission);
      if(!result?.acknowledged)throw new Error('上传未确认，本地版本已保留，请刷新后核对');
    },
    getSceneRun:(projectId,episodeId,sceneLabel)=>{const project=stateRef.current.directorProjects?.find(p=>p.id===projectId),activeId=project?.episodes?.find(e=>e.id===episodeId)?.activeSceneGenerationRuns?.[sceneLabel]?.runId;const row=summaries().runs.filter(run=>run.kind!=='manual-scene'&&(!activeId||run.id===activeId)&&run.snapshot.projectId===projectId&&run.snapshot.episodeId===episodeId&&run.snapshot.sceneLabel===sceneLabel&&sameDirectorEdition(project,run.snapshot)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];return row?controller.get(row.id):null;},
    pauseAndFlush:async()=>{for(const active of durationTasks.current.values())active.abort();await batchController.pauseAll();await controller.pauseAll();await manualController.pauseAll();cloudSync.pause();persistence.enqueue(stateRef.current);await persistence.flush();return stateRef.current;},
    prepareDirectorySwitch:async()=>{if(storageWorkBusy()||durationTasks.current.size||directorJobs.entries().some(([,j])=>j.status==='running')||[...(stateRef.current.fruitProjects||[]),...(stateRef.current.scriptProjects||[])].some(p=>(p.creator?.records||[]).some(r=>r.status==='running')))throw new Error('仍有创作任务正在运行，请任务完成后再切换资料目录');directorySwitchRef.current=true;directoryEpochRef.current++;try{await batchController.pauseAll();await controller.pauseAll();await manualController.pauseAll();cloudSync.pause();persistence.enqueue(stateRef.current);await persistence.suspendAfterFlush();return stateRef.current;}catch(e){directorySwitchRef.current=false;throw e;}},
    finishDirectorySwitch:()=>{directoryEpochRef.current++;try{persistence.resume(stateRef.current);window.dispatchEvent(new Event('xz-storage-changed'));}finally{directorySwitchRef.current=false;}},
    get active(){const current=summaries();return durationTasks.current.size>0||current.runs.some(isQuickRunActive)||current.batches.some(isDirectorBatchActive);},
  };
  },[accountId,restoreError,progress,controller,manualController,batchController,cloudSync,persistence,stateRef,setState]);
}
