import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {getPromptPublicationJob} from '../../core/promptPublicationJob.js';
import './prompt-publication.css';

const phases={queued:'排队',checking:'校验',preparing:'准备上传',uploading:'上传清单',publishing:'发布美术资产',checkpoint:'保存发布结果',saved:'云端已确认',unchanged:'已发布，跳过',complete:'已完成',failed:'失败'};
export function usePromptPublication(api,accountId,projectId){
 const job=useMemo(()=>getPromptPublicationJob(api,accountId,projectId),[api,accountId,projectId]);
 const state=useSyncExternalStore(job.subscribe,job.snapshot);return {job,state};
}
export default function PromptPublicationProgress({api,accountId,projectId,refresh}){
 const {state}=usePromptPublication(api,accountId,projectId),latestRefresh=useRef(refresh),[elapsed,setElapsed]=useState(0),[refreshError,setRefreshError]=useState('');latestRefresh.current=refresh;
 useEffect(()=>{if(!state.running)return;const update=()=>setElapsed(Math.floor((Date.now()-state.startedAt)/1000));update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[state.running,state.startedAt]);
 useEffect(()=>{if(!(state.cloudDone||state.done))return;let alive=true;const timer=setTimeout(()=>{Promise.resolve(latestRefresh.current?.({manual:true,assetsOnly:true})).then(()=>alive&&setRefreshError(''),error=>alive&&setRefreshError('发布结果已保留，素材刷新失败：'+error.message));},500);return()=>{alive=false;clearTimeout(timer);};},[state.cloudDone,state.done,state.running]);
 if(!state.startedAt)return null;
 const failed=(state.items||[]).filter(i=>i.phase==='failed'),completed=(state.items||[]).filter(i=>i.phase==='complete'),queued=(state.items||[]).filter(i=>i.phase==='queued').length;
 const seconds=state.running?elapsed:Math.floor(((state.finishedAt||Date.now())-state.startedAt)/1000);
 return <section className="prompt-publication-progress" aria-label="提示词发布进度">
  <header><b>{state.running?'正在后台发布':state.error||failed.length?'发布有未完成项':'发布完成'}</b><span>已完成 {state.done||0}/{state.total||0} 条 · {completed.length}/{state.items?.length||0} 集</span><span>并发 {state.active?.length||0}/4 · 排队 {queued} 集 · {seconds} 秒</span><small>不调用大模型</small></header>
  <progress aria-label="已发布提示词" max={state.total||1} value={state.done||0}/>
  {!!state.active?.length&&<p role="status">{state.active.map(i=>`第 ${i.episode} 集：${phases[i.phase]||i.phase}`).join('；')}</p>}
  {state.error&&<p role="alert">{state.error}</p>}
  {!!state.items?.length&&<details open={failed.length>0}><summary>逐集结果{state.skipped?` · 已发布跳过 ${state.skipped} 条`:''}{failed.length?` · ${failed.length} 集失败`:''}</summary><ul>{state.items.map(item=><li key={item.episode}><b>第 {item.episode} 集 · {item.count} 条</b><span>{item.skipped?'已发布，跳过':phases[item.phase]||item.phase}</span>{item.error&&<span role="alert">{item.error}</span>}</li>)}</ul></details>}
  {refreshError&&<p role="alert">{refreshError}</p>}
 </section>;
}
