import {useEffect,useMemo,useState} from 'react';
import {getPromptDistributionService,sceneReadyForPromptDistribution} from '../../core/promptDistributionService.js';
import {getArtDistributionController} from '../../core/artAnalysisPipeline.js';
import {getArtReviewStore} from '../../core/artReviewPersistence.js';
import {notifyBindingSaved} from './useScenePromptLinks.js';

// Mounting subscribes only. AI starts through analysis or an explicit user action.
export default function useScenePromptDistribution({project,assets,accountId,snapshot,loaded,canEdit,profile,api,setError,setNotice}){
 const store=getArtReviewStore({api,projectId:project.id,accountId});
 const service=useMemo(()=>getPromptDistributionService({api,projectId:project.id,accountId,getContext:()=>({project,ledger:store.snapshot(),assets}),onSaved:data=>notifyBindingSaved(project.id,accountId,data)}),[api,project.id,accountId]);
 service.configure(()=>({project,ledger:store.snapshot(),assets}));
 const controller=useMemo(()=>getArtDistributionController({api,projectId:project.id,accountId}),[api,project.id,accountId]);
 controller.configure({project,store,existingAssets:assets,onBindingSaved:data=>notifyBindingSaved(project.id,accountId,data)});
 const [,render]=useState(0);useEffect(()=>{const update=()=>render(n=>n+1),a=service.subscribe(update),b=controller.subscribe(update);return()=>{a();b();};},[service,controller]);
 const state={...service.status(),...controller.status()};
 return {...state,service,isBusy:service.isBusy,redistribute:async entry=>{
  if(!loaded||!canEdit)return;setError('');setNotice(`正在让模型重新读取 ${entry.label}…`);
  try{await service.run(entry.id,{profile,manual:true,versionId:snapshot.versionId});setNotice(`已按模型结果分发 ${entry.label}`);}catch(error){setError(error.message);throw error;}
 },stop:()=>{void controller.stop();setNotice('已停止清单分发，信息读取和已保存结果保留');},resume:async()=>{
  if(!loaded||!canEdit||!profile)return;setError('');setNotice('正在分发所有已有上游清单…');
  try{const errors=await controller.start({profile});if(errors.length)setError([...new Set(errors)].slice(0,4).join('；'));else setNotice('已有上游清单分发完成');}catch(error){setError(error.message);}
 }};
}
