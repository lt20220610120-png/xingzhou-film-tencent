import { useEffect, useRef, useState } from 'react';
import { createQuickGenerationController, isQuickRunActive } from '../../core/directorQuickGeneration.js';
import { commitQuickSceneRun } from '../../core/directorQuickStore.js';
import { executeSkillWithAi, assertMessageCapacity } from '../../core/skillExecution.js';
import { parseDirectorScenes } from '../../core/scriptImport.js';

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
  if(!controllerRef.current){
    const getContext=target=>{
      const current=stateRef.current;
      const project=current.directorProjects?.find(p=>p.id===target.projectId);
      const episode=project?.episodes?.find(e=>e.id===target.episodeId);
      const episodeNumber=project?.episodes?.filter(e=>e.kind!=='setting'&&e.title!=='设定和小传').findIndex(e=>e.id===target.episodeId)+1;
      const scene=episode&&parseDirectorScenes(episode.content,episodeNumber).find(s=>s.label===target.sceneLabel);
      return {accountId:accountRef.current,project,episode,inputText:scene?(episode.quickSceneEdits?.[target.sceneLabel]??scene.content):undefined,
        skill:current.skills?.find(s=>s.id===target.skillId),profile:current.apiProfiles?.find(p=>p.id===target.profileId),
        permissions:{canGenerate:Boolean(scene)&&!directorySwitchRef.current&&!project?.cloudLocked&&project?.canWrite!==false}};
    };
    const checkpoints=api.directorQuickSaveRun?{
      list:()=>api.directorQuickListRuns(),load:p=>api.directorQuickLoadRun(p),save:p=>api.directorQuickSaveRun(p),
    }:browserCheckpoints(accountRef);
    const unwrap=result=>{
      if(result?.ok===false)throw Object.assign(new Error(result.error||'生成失败'),{partialText:result.partialText||'',code:result.code||'FAILED'});
      return result?.output ?? result;
    };
    controllerRef.current=createQuickGenerationController({
      getContext,checkpoints,onChange:()=>render(n=>n+1),cancelRequest:taskId=>api.cancelAiTask?.({taskId}),
      executeText:async({messages,taskId,snapshot})=>{
        const context=getContext(snapshot),profile=context.profile;
        if(!profile)throw new Error('所选模型已不存在');
        assertMessageCapacity(messages,profile,{maxOutputTokens:16384});
        return unwrap(await api.aiChat({...profile,profileId:profile.id,messages,taskId,resultEnvelope:true,maxOutputTokens:16384}));
      },
      executeSkill:async({input,beforeUserMessages,taskId,snapshot,skillId})=>{
        const context=getContext(snapshot);
        return executeSkillWithAi({api,state:stateRef.current,profile:context.profile,skillId,input,beforeUserMessages,
          assistantRole:'行舟影视导演提示词助手',requestOptions:{taskId,resultEnvelope:true,maxOutputTokens:16384}});
      },
      commitRun:async run=>{
        if(accountRef.current!==run.snapshot.accountId)return {applied:false,conflict:'账号已切换'};
        const result=commitQuickSceneRun({...stateRef.current,accountId:accountRef.current},run);
        if(!result.applied)return result;
        setState(current=>({...current,directorProjects:result.state.directorProjects}));
        persistence.enqueue(stateRef.current);await persistence.flush();
        return {applied:true};
      },
    });
  }
  const controller=controllerRef.current;
  useEffect(()=>{
    if(!initialized||!accountId)return;
    let live=true;
    controller.restore().catch(e=>{if(live)setRestoreError(e.message);});
    return()=>{live=false;controller.pauseAll().catch(()=>{});};
  },[accountId,initialized]);
  useEffect(()=>{controller.activate();return()=>{controller.dispose();};},[]);
  const runs=controller.entries().filter(run=>run.snapshot.accountId===accountId);
  return {
    startScene:request=>directorySwitchRef.current?Promise.reject(new Error('资料位置正在切换，请稍后生成')):controller.start({...request,accountId}),resume:runId=>directorySwitchRef.current?Promise.reject(new Error('资料位置正在切换，请稍后继续')):controller.resume(runId),stop:runId=>controller.stop(runId),
    runs,restoreError,
    getSceneRun:(projectId,episodeId,sceneLabel)=>runs.filter(run=>run.snapshot.projectId===projectId&&run.snapshot.episodeId===episodeId&&run.snapshot.sceneLabel===sceneLabel).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]||null,
    pauseAndFlush:async()=>{await controller.pauseAll();persistence.enqueue(stateRef.current);await persistence.flush();return stateRef.current;},
    prepareDirectorySwitch:async()=>{directorySwitchRef.current=true;try{await controller.pauseAll();persistence.enqueue(stateRef.current);await persistence.suspendAfterFlush();return stateRef.current;}catch(e){directorySwitchRef.current=false;throw e;}},
    finishDirectorySwitch:()=>{try{persistence.resume(stateRef.current);}finally{directorySwitchRef.current=false;}},
    active:runs.some(isQuickRunActive),
  };
}
