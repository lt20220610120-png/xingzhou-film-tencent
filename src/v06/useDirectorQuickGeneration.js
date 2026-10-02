import { useEffect, useRef, useState } from 'react';
import { createQuickGenerationController, isQuickRunActive } from '../../core/directorQuickGeneration.js';
import { commitQuickSceneRun } from '../../core/directorQuickStore.js';
import { executeSkillWithAi, assertMessageCapacity } from '../../core/skillExecution.js';
import { parseDirectorScenes } from '../../core/scriptImport.js';
import { createDirectorBatchPlan, createDirectorBatchController, isDirectorBatchActive } from '../../core/directorBatchGeneration.js';
import { createDirectorCloudSync } from '../../core/directorCloudSync.js';
import { acknowledgeDirectorCloudSave } from '../../core/directorCloudProjects.js';

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
  const directorySwitchRef=useRef(false);
  const [,render]=useState(0);
  const [restoreError,setRestoreError]=useState('');
  const controllerRef=useRef(null);
  const batchControllerRef=useRef(null),cloudSyncRef=useRef(null),cloudScheduledRef=useRef(new Map());
  if(!controllerRef.current){
    const getContext=target=>{
      const current=stateRef.current;
      const project=current.directorProjects?.find(p=>p.id===target.projectId);
      const episode=project?.episodes?.find(e=>e.id===target.episodeId);
      const episodeNumber=project?.episodes?.filter(e=>e.kind!=='setting'&&e.title!=='设定和小传').findIndex(e=>e.id===target.episodeId)+1;
      const scene=episode&&parseDirectorScenes(episode.content,episodeNumber).find(s=>s.label===target.sceneLabel);
      return {accountId:accountRef.current,project,episode,inputText:scene?(episode.quickSceneEdits?.[target.sceneLabel]??scene.content):undefined,
        skill:current.skills?.find(s=>s.id===target.skillId),profile:current.apiProfiles?.find(p=>p.id===target.profileId),
        permissions:{canGenerate:Boolean(scene)&&!directorySwitchRef.current&&!project?.cloudLocked&&!project?.cloudConflict&&project?.canWrite!==false&&project?.permissions?.canGenerate!==false&&project?.permissions?.canWrite!==false&&episode?.canWrite!==false}};
    };
    const checkpoints=api.directorQuickSaveRun?{
      list:()=>api.directorQuickListRuns(),load:p=>api.directorQuickLoadRun(p),save:p=>api.directorQuickSaveRun(p),
    }:browserCheckpoints(accountRef);
    const unwrap=result=>{
      if(result?.ok===false)throw Object.assign(new Error(result.error||'生成失败'),{partialText:result.partialText||'',code:result.code||'FAILED'});
      return result?.output ?? result;
    };
    const commit=async(run,partial=false)=>{
      if(accountRef.current!==run.snapshot.accountId)return {applied:false,conflict:'账号已切换'};
      let result;
      // App's setter publishes the latest ref synchronously. Every parallel
      // scene merges inside that setter, so another scene's saved results and
      // concurrent user edits remain part of this exact persisted snapshot.
      setState(current=>{
        result=commitQuickSceneRun({...current,accountId:accountRef.current},run,{partial});
        return result.applied?{...current,directorProjects:result.state.directorProjects}:current;
      });
      if(!result.applied)return result;
      persistence.enqueue(stateRef.current);await persistence.flush();
      return {applied:true};
    };
    controllerRef.current=createQuickGenerationController({
      getContext,checkpoints,onChange:()=>render(n=>n+1),cancelRequest:taskId=>api.cancelAiTask?.({taskId}),
      groundedTiming:true,maxQualityAttempts:3,
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
    batchControllerRef.current=createDirectorBatchController({sceneController:controllerRef.current,checkpoints,getContext,onChange:()=>render(n=>n+1)});
  }
  const controller=controllerRef.current;
  const batchController=batchControllerRef.current;
  if(!cloudSyncRef.current)cloudSyncRef.current=createDirectorCloudSync({
    getContext:()=>({accountId:accountRef.current,projects:stateRef.current.directorProjects||[]}),
    updateProject:args=>api.directorCollabUpdateProject(args),
    acknowledge:({cloud,submitted,projectId})=>setState(current=>({...current,directorProjects:acknowledgeDirectorCloudSave(current.directorProjects||[],cloud,submitted).map(p=>p.id===projectId?{...p,cloudSyncError:''}:p)})),
    onConflict:({projectId,message})=>setState(current=>({...current,directorProjects:(current.directorProjects||[]).map(p=>p.id===projectId?{...p,cloudSyncError:message}:p)})),
  });
  const cloudSync=cloudSyncRef.current;
  useEffect(()=>{
    if(!initialized||!accountId)return;
    let live=true;
    Promise.all([controller.restore(),batchController.restore()]).catch(e=>{if(live)setRestoreError(e.message);});
    return()=>{live=false;cloudSync.pause();cloudScheduledRef.current.clear();batchController.pauseAll().catch(()=>{});controller.pauseAll().catch(()=>{});};
  },[accountId,initialized]);
  useEffect(()=>{
    if(!initialized||!accountId)return;
    for(const project of state.directorProjects||[]){
      if(!project.cloudProjectId||!project.cloudBase||project.cloudLocked||project.cloudConflict)continue;
      const signature=JSON.stringify({name:project.name,script:project.masterScript||'',episodes:project.episodes||[]});
      if(signature===JSON.stringify(project.cloudBase)||cloudScheduledRef.current.get(project.id)===signature)continue;
      cloudScheduledRef.current.set(project.id,signature);cloudSync.enqueue(project.id);
    }
  },[state.directorProjects,accountId,initialized]);
  useEffect(()=>{controller.activate();batchController.activate();cloudSync.activate();return()=>{batchController.dispose();controller.dispose();cloudSync.dispose();};},[]);
  const runs=controller.entries().filter(run=>run.snapshot.accountId===accountId);
  const batches=batchController.entries().filter(batch=>batch.snapshot.accountId===accountId);
  return {
    startScene:request=>directorySwitchRef.current?Promise.reject(new Error('资料位置正在切换，请稍后生成')):controller.start({...request,accountId}),resume:runId=>directorySwitchRef.current?Promise.reject(new Error('资料位置正在切换，请稍后继续')):controller.resume(runId),stop:runId=>controller.stop(runId),
    runs,restoreError,
    previewBatch:request=>createDirectorBatchPlan({...request,accountId}),
    startBatch:plan=>directorySwitchRef.current?Promise.reject(new Error('资料位置正在切换')):batchController.start(plan),
    resumeBatch:id=>directorySwitchRef.current?Promise.reject(new Error('资料位置正在切换')):batchController.resume(id),
    pauseBatch:id=>batchController.pause(id),cancelBatch:id=>batchController.cancel(id),
    getProjectBatch:projectId=>batches.filter(b=>b.snapshot.projectId===projectId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]||null,
    isProjectBatchActive:projectId=>batches.some(b=>b.snapshot.projectId===projectId&&isDirectorBatchActive(b)),
    isCloudSaving:cloudSync.isSaving,retryCloudSync:id=>cloudSync.flush(id),
    getSceneRun:(projectId,episodeId,sceneLabel)=>runs.filter(run=>run.snapshot.projectId===projectId&&run.snapshot.episodeId===episodeId&&run.snapshot.sceneLabel===sceneLabel).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]||null,
    pauseAndFlush:async()=>{await batchController.pauseAll();await controller.pauseAll();cloudSync.pause();persistence.enqueue(stateRef.current);await persistence.flush();return stateRef.current;},
    prepareDirectorySwitch:async()=>{directorySwitchRef.current=true;try{await batchController.pauseAll();await controller.pauseAll();cloudSync.pause();persistence.enqueue(stateRef.current);await persistence.suspendAfterFlush();return stateRef.current;}catch(e){directorySwitchRef.current=false;throw e;}},
    finishDirectorySwitch:()=>{try{persistence.resume(stateRef.current);cloudScheduledRef.current.clear();}finally{directorySwitchRef.current=false;}},
    active:runs.some(isQuickRunActive)||batches.some(isDirectorBatchActive),
  };
}
