import {useEffect,useMemo,useSyncExternalStore} from 'react';
import {bindingSnapshot,loadFreshBinding} from '../../core/promptArtBinding.js';
import {projectBindingCache,projectBindingScope,bindingStorageEpoch,subscribeBindingStorage} from '../../core/projectBindingCache.js';
import {activeDirectorEditionId} from '../../core/directorPromptEditions.js';
import {BINDING_SAVED_EVENT} from './useScenePromptLinks.js';

// Keep the last read-only view across tabs. Submission still calls the strict
// fresh validation path; cache entries never authorize model or cloud writes.
export default function useProjectPromptBinding({api,project,assets,accountId,localSources}){
 const source=(localSources||[]).find(row=>!row.cloudProjectId&&row.id===project.director_project_id);
 const directoryEpoch=useSyncExternalStore(subscribeBindingStorage,bindingStorageEpoch),scope=projectBindingScope(project,source);
 const cache=useMemo(()=>projectBindingCache(api,accountId,project.id,scope),[api,accountId,project.id,scope,directoryEpoch]);
 const value=useSyncExternalStore(cache.subscribe,cache.snapshot);
 useEffect(()=>{
  const load=()=>cache.load([project.episodes,project.analysis_progress,assets,source,project.director_project_id],async()=>{
   if(!api.promptArtLoad||!api.promptArtStatus)return null;
   const status=await api.promptArtStatus({projectId:project.id});
   const editionId=activeDirectorEditionId(project);
   return status?.enabled?loadFreshBinding({api,projectId:project.id,accountId,localSources:source?[source]:[],versionId:editionId?'edition:'+editionId:undefined,allowUnbound:true}):{snapshot:bindingSnapshot(project,await api.artReviewLoadLocal({projectId:project.id,accountId})||{},assets||[])};
  });
  void load();const sync=event=>{if(event.detail.projectId===project.id&&event.detail.accountId===accountId)void load();};
  window.addEventListener(BINDING_SAVED_EVENT,sync);return()=>window.removeEventListener(BINDING_SAVED_EVENT,sync);
 },[cache,api,project.id,project.episodes,project.analysis_progress,project.director_project_id,assets,source,accountId]);
 return {...value,data:value.data?{...value.data,publishedStoryboards:project.episodes?.some(ep=>ep.storyboardPrompts)?project.episodes.flatMap(ep=>ep.storyboardPrompts||[]):null}:value.data};
}
