import {useEffect,useMemo,useState} from 'react';
import {getPromptDistributionService,sceneReadyForPromptDistribution} from '../../core/promptDistributionService.js';
import {getArtReviewStore} from '../../core/artReviewPersistence.js';
import {notifyBindingSaved} from './useScenePromptLinks.js';

// Mounting subscribes only. AI starts through analysis or an explicit user action.
export default function useScenePromptDistribution({project,assets,accountId,snapshot,loaded,canEdit,profile,api,setError,setNotice}){
 const store=getArtReviewStore({api,projectId:project.id,accountId});
 const service=useMemo(()=>getPromptDistributionService({api,projectId:project.id,accountId,getContext:()=>({project,ledger:store.snapshot(),assets}),onSaved:data=>notifyBindingSaved(project.id,accountId,data)}),[api,project.id,accountId]);
 service.configure(()=>({project,ledger:store.snapshot(),assets}));
 const [,render]=useState(0);useEffect(()=>service.subscribe(()=>render(n=>n+1)),[service]);
 const state=service.status();
 return {...state,service,isBusy:service.isBusy,redistribute:async entry=>{
  if(!loaded||!canEdit)return;setError('');setNotice(`正在让模型重新读取 ${entry.label}…`);
  try{await service.run(entry.id,{profile,manual:true,versionId:snapshot.versionId});setNotice(`已按模型结果分发 ${entry.label}`);}catch(error){setError(error.message);throw error;}
 },stop:()=>{void service.stop();setNotice('已停止自动分发，可继续人工审核');},resume:async()=>{
  service.resume();const context={project,ledger:store.snapshot()};
  const results=await Promise.allSettled(snapshot.entries.filter(entry=>sceneReadyForPromptDistribution(context.project,context.ledger,entry.sceneId)).map(entry=>service.run(entry.id,{profile,versionId:snapshot.versionId})));
  const failed=results.filter(r=>r.status==='rejected');if(failed.length)setError(failed.map(r=>r.reason.message).join('；'));
 }};
}
