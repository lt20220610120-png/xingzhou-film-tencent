import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {getPromptPublicationJob} from '../../core/promptPublicationJob.js';
import {useWorkspaceClock,useWorkspaceVisible} from './useWorkspacePolling.js';
import './prompt-publication.css';

const phases={queued:'排队',checking:'校验',preparing:'准备上传',uploading:'上传清单',publishing:'发布美术资产','checkpoint-wait':'已发布，等待保存结果',checkpoint:'合并保存发布结果',saved:'云端已确认',unchanged:'已发布，跳过',complete:'已完成',failed:'失败'};
export function usePromptPublication(api,accountId,projectId){
 const job=useMemo(()=>getPromptPublicationJob(api,accountId,projectId),[api,accountId,projectId]);
 const state=useSyncExternalStore(job.subscribe,job.snapshot);return {job,state};
}
export default function PromptPublicationProgress({api,accountId,projectId,refresh}){
 const {state}=usePromptPublication(api,accountId,projectId),latestRefresh=useRef(refresh),[refreshError,setRefreshError]=useState('');latestRefresh.current=refresh;
 const visible=useWorkspaceVisible(),now=useWorkspaceClock(state.running),refreshed=useRef('');
 const revision=JSON.stringify([state.startedAt,state.cloudDone,state.done,state.running]);
 useEffect(()=>{
  if(!visible||!(state.cloudDone||state.done)||refreshed.current===revision)return;
  let alive=true;
  const timer=setTimeout(()=>{
   Promise.resolve(latestRefresh.current?.({manual:true,assetsOnly:state.running,publicationComplete:!state.running})).then(()=>{
    if(alive){refreshed.current=revision;setRefreshError('');}
   },error=>{if(alive)setRefreshError('发布结果已保留，项目刷新失败：'+error.message);});
  },500);
  return()=>{alive=false;clearTimeout(timer);};
 },[visible,revision]);
 if(!state.startedAt)return null;
 const visibleDone=Math.max(state.done||0,state.cloudDone||0);
 const failed=(state.items||[]).filter(i=>i.phase==='failed'),completed=(state.items||[]).filter(i=>i.cloudPublished||i.phase==='complete'),queued=(state.items||[]).filter(i=>i.phase==='queued').length;
 const seconds=Math.max(0,Math.floor(((state.running?now:state.finishedAt||Date.now())-state.startedAt)/1000));
 return <section className="prompt-publication-progress" aria-label="提示词发布进度">
  <header><b>{state.running?'正在后台发布':state.error||failed.length?'发布有未完成项':'发布完成'}</b><span>云端已发布 {visibleDone}/{state.total||0} 条 · {completed.length}/{state.items?.length||0} 集</span>{state.running&&<span>并发 {state.active?.length||0}/4 · 排队 {queued} 集 · {seconds} 秒</span>}</header>
  <progress aria-label="已发布提示词" max={state.total||1} value={visibleDone}/>
  {!!state.active?.length&&<p role="status">{state.active.map(i=>`第 ${i.episode} 集：${phases[i.phase]||i.phase}`).join('；')}</p>}
  {state.error&&<p role="alert">{state.error}</p>}
  {!!state.items?.length&&<details open={failed.length>0}><summary>逐集结果{state.skipped?` · 已发布跳过 ${state.skipped} 条`:''}{failed.length?` · ${failed.length} 集失败`:''}</summary><ul>{state.items.map(item=><li key={item.episode}><b>第 {item.episode} 集 · {item.count} 条</b><span>{item.skipped?'已发布，跳过':phases[item.phase]||item.phase}</span>{item.error&&<span role="alert">{item.error}</span>}</li>)}</ul></details>}
  {refreshError&&<p role="alert">{refreshError}</p>}
 </section>;
}
