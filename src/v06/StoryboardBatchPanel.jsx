import {useWorkspacePolling} from './useWorkspacePolling.js';
import React,{useState,useEffect,useRef} from 'react';
import {Sparkles,Square,Play,TimerReset} from 'lucide-react';
import {Dialog} from './GlobalTools.jsx';
import {storyboardBatchItems} from '../../core/storyboardBatch.js';
import {hasUnsavedStoryboardTimingEdit,storyboardDraftKey} from '../../core/storyboardDefaults.js';
import {queueDraft,readQueuedDraft} from '../editing.js';
import './StoryboardBatchPanel.css';
const labels={pending:'待发送',preparing:'准备中',submitted:'已发送 · 平台处理中','awaiting-canvas':'待在 LibTV 生成',queued:'平台排队',generating:'生成中',downloading:'下载中',success:'已完成',failed:'失败',uncertain:'待核对',skipped:'已跳过',stopped:'已停止'};
const readDraft=key=>{try{const q=readQueuedDraft(key);return q.found?q.value:JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
export default function StoryboardBatchPanel({api,project,accountId,episodeId,sceneId,settings,assets,media,binding,canEdit,onProjectChange,onRecommended,settingsBusy,onStatusChange}){
 const [scope,setScope]=useState('scene'),[runs,setRuns]=useState([]),[pending,setPending]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const owned=useRef(new Map()),run=runs[0],scopeKey=JSON.stringify([accountId,project.id]);
 useEffect(()=>{setRuns([]);setError('');setPending(null);owned.current.clear();},[scopeKey]);
 const poll=useWorkspacePolling(async current=>{
  try{
   const rows=await api.storyboardBatchList({accountId,projectId:project.id});
   if(!current())return;
   setRuns(rows);
   let changed=false;
   for(const batch of rows)for(const item of batch.items){
    const key=batch.id+':'+item.id,capture=owned.current.get(key);
    if(capture&&item.jobId){
     if(JSON.stringify(readDraft(capture.key))===capture.before)queueDraft(capture.key,null);
     owned.current.delete(key);changed=true;
    }
   }
   if(changed&&api.collabGetProject){
    const fresh=await api.collabGetProject({projectId:project.id});
    if(current())onProjectChange(fresh);
   }
  }catch(e){if(current())setError(e.message);}
 },{scope:scopeKey,enabled:Boolean(api.storyboardBatchList),delay:5000});
 const load=()=>poll({afterCurrent:true});
 const prepare=()=>{
  setError('');
  try{
   const items=storyboardBatchItems({project,scope,episodeId,sceneId,settings,assets,media,binding,accountId,readDraft,skipUnavailable:true});
   if(!items.length)throw Error('当前范围没有分镜');
   const drafts=new Map(items.filter(item=>!item.skipUnsavedDraft).map(item=>{
    const key=storyboardDraftKey(project.id,{id:item.shotId,storyboardPublicationId:item.publicationId},accountId);
    return [item.shotId,{key,before:JSON.stringify(readDraft(key))}];
   }));
   setPending({items,drafts,scope,episodeId,sceneId});
  }catch(e){setError(e.message);}
 };
 const start=async()=>{
  if(busy||!pending)return;
  setBusy(true);setError('');
  const {items,drafts,...range}=pending;
  try{
   const result=await api.storyboardBatchStart({accountId,projectId:project.id,...range,skipUnavailable:true,items:items.map(item=>{
    const capture=drafts.get(item.shotId);
    const now=capture&&readDraft(capture.key);
    return hasUnsavedStoryboardTimingEdit({content:item.baseContent,generationConfig:item.baseGenerationConfig},now)?{shotId:item.shotId,skipUnsavedDraft:true}:item;
   })});
   for(const item of result.items){
    const capture=drafts.get(item.shotId);
    if(capture&&item.status!=='skipped')owned.current.set(result.id+':'+item.id,capture);
   }
   setRuns(current=>[result,...current]);setPending(null);void load();
  }catch(e){setError(String(e.message).replace(/^Error invoking remote method '[^']+': Error: /,''));}finally{setBusy(false);}
 };
 useEffect(()=>{onStatusChange?.(run?{percent:run.percent,running:run.running}:null);},[run,onStatusChange]);
 if(!api.storyboardBatchStart)return null;
 const act=async action=>{setBusy(true);setError('');try{await api[action]({accountId,projectId:project.id,id:run.id});await load();}catch(e){setError(e.message);}finally{setBusy(false);}};
 const skipped=run?.items.filter(item=>item.status==='skipped'&&item.error)||[];
 return <section className="storyboard-batch" aria-label="分镜批量生成"><div className="storyboard-batch-controls"><label>应用范围<select aria-label="批量生成范围" disabled={busy||run?.running} value={scope} onChange={e=>setScope(e.target.value)}><option value="scene">当前场景</option><option value="episode">当前一集</option><option value="project">全剧</option></select></label><button className="primary" disabled={!canEdit||busy||settingsBusy||run?.running||!settings?.profileId} onClick={prepare}><Sparkles size={15}/>一键生成</button><button className="secondary" disabled={!canEdit||busy||settingsBusy||run?.running||!settings?.profileId} onClick={()=>onRecommended?.(scope)}><TimerReset size={16}/>按建议时长设置</button>{run?.running&&<button className="secondary" disabled={busy} onClick={()=>act('storyboardBatchStop')}><Square size={14}/>停止发送</button>}{run&&!run.running&&((run.counts.stopped||0)+(run.counts.pending||0)>0)&&<button className="secondary" disabled={!canEdit||busy} onClick={()=>act('storyboardBatchResume')}><Play size={14}/>继续发送</button>}</div>
 {run&&<div className="storyboard-batch-progress"><div><span>发送 {run.sentPercent}%</span><span>完成 {run.percent}%</span><b>{run.total} 条</b></div><progress aria-label="批量完成进度" max="100" value={run.percent}/><div className="storyboard-batch-counts">{Object.entries(labels).filter(([key])=>run.counts[key]).map(([key,label])=><span key={key}>{label} <b>{run.counts[key]}</b></span>)}</div>{skipped.length>0&&<p role="status">已跳过 {skipped.slice(0,3).map(item=>`${item.label}（${item.error}）`).join('、')}{skipped.length>3?`等 ${skipped.length} 条`:' '}</p>}<details><summary>查看分镜进度</summary><div className="storyboard-batch-items">{run.items.map(item=><div key={item.id}><b>{item.label}</b><span>{labels[item.status]}</span>{item.error&&<small>{item.error}</small>}</div>)}</div></details></div>}
 {error&&<p className="collab-error" role="alert">{error}</p>}
 {pending&&<Dialog open title="确认批量生成" onClose={()=>!busy&&setPending(null)}><p>范围内共 {pending.items.length} 条分镜。已有结果或进行中、待核对的任务会跳过，未保存及不符合时长要求的分镜也会跳过。新提交可能产生费用。</p><footer className="storyboard-batch-confirm"><button className="secondary" disabled={busy} onClick={()=>setPending(null)}>取消</button><button className="primary" disabled={busy} onClick={start}>{busy?'正在加入队列…':'确认并开始'}</button></footer></Dialog>}
 </section>;
}
