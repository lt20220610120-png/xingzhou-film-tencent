import React,{useEffect,useRef,useState} from 'react';
import {projectVideoRows,filterProjectVideos,videoLabelCompare} from '../../core/projectVideoPool.js';
import {generationMediaProfiles} from '../../core/canvasStore.js';
import {GenerationResults} from './GenerationResults.jsx';
import './ProjectVideoPool.css';
export function ProjectVideoPool({project,api,state,accountId}){
 const [rows,setRows]=useState([]),[episode,setEpisode]=useState(''),[scene,setScene]=useState(''),[automatic,setAutomatic]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const loading=useRef(false),epoch=useRef(0),latest=useRef({state,project});latest.current={state,project};
 useEffect(()=>{const ticket=++epoch.current;let disposed=false;loading.current=false;setRows([]);setEpisode('');setScene('');setError('');
  const load=async()=>{if(loading.current)return;loading.current=true;try{
   let tasks=await api.generationList();
   for(const task of tasks.filter(t=>t.projectId===project.id&&['submitted','downloading'].includes(t.status))){
    if(disposed)return;if(task.nextPollAt&&task.nextPollAt>Date.now())continue;
    const profile=generationMediaProfiles(latest.current.state,'video').find(p=>p.id===task.profileId);
    if(profile)await api.generationRefresh({id:task.id,apiKey:profile.apiKey,endpoint:profile.endpoint}).catch(()=>{});
   }
   const media=await api.collabListMedia({projectId:project.id});tasks=await api.generationList();
   if(!disposed&&ticket===epoch.current){const cloud=latest.current.project,source=latest.current.state.directorProjects?.find(p=>p.id===cloud.director_project_id);setRows(projectVideoRows(source?{...cloud,episodes:source.episodes}:cloud,tasks,media));setError('');}
  }catch(e){if(!disposed)setError(e.message);}finally{if(ticket===epoch.current)loading.current=false;}};
  void load();const timer=automatic?setInterval(load,5000):null;window.addEventListener('xz-video-pool-refresh',load);
  return()=>{disposed=true;clearInterval(timer);window.removeEventListener('xz-video-pool-refresh',load);};
 },[project.id,accountId,automatic]);
 const shown=filterProjectVideos(rows,{episode,scene}),successful=shown.filter(r=>r.status==='success');
 const download=async()=>{setBusy(true);setError('');try{const result=await api.projectVideoExport({projectId:project.id,ids:successful.map(r=>({jobId:r.mediaId?undefined:r.id,mediaId:r.mediaId}))});if(result)setNotice(`已下载 ${result.completed} 条${result.errors.length?`，${result.errors.length} 条未完成：${result.errors.join('；')}`:''}`);}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <section className="project-video-pool"><header><div><h2>视频池</h2><p>按集数、场景、提示词顺序查看生成结果</p></div><button onClick={()=>window.dispatchEvent(new Event('xz-video-pool-refresh'))}>刷新状态</button></header>
 <div className="video-pool-toolbar"><label>集数<select value={episode} onChange={e=>{setEpisode(e.target.value);setScene('');}}><option value="">整个剧</option>{[...new Set(rows.map(r=>r.episode).filter(Boolean))].sort((a,b)=>a-b).map(ep=><option key={ep} value={ep}>第 {ep} 集</option>)}</select></label><label>场景<select value={scene} disabled={!episode} onChange={e=>setScene(e.target.value)}><option value="">全部场景</option>{[...new Set(filterProjectVideos(rows,{episode}).map(r=>r.scene).filter(Boolean))].sort(videoLabelCompare).map(s=><option key={s}>{s}</option>)}</select></label><label className="video-pool-check"><input type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)}/>每 5 秒自动监测</label><button className="primary" disabled={busy||!successful.length} onClick={download}>{busy?'正在下载…':`一键下载${scene?'本场':episode?'本集':'全剧'}（${successful.length}）`}</button></div>
 <div className="video-pool-counts"><span>共 {shown.length} 条</span><span>已完成 {successful.length}</span><span>生成中 {shown.filter(r=>['submitted','submitting','downloading'].includes(r.status)).length}</span><span>失败 / 待核对 {shown.filter(r=>['failed','uncertain'].includes(r.status)).length}</span><span>未生成 {shown.filter(r=>r.status==='not-started').length}</span></div>
 {error&&<p role="alert" className="collab-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {!rows.length&&<p>当前项目暂无分镜或生成结果。</p>}
 {shown.map(row=><article className="video-pool-row" key={row.id}><h3>{row.label}</h3>{row.status==='not-started'?<p>尚未生成，请在分镜中生成，或由管理员制作工作流接续。</p>:<GenerationResults tasks={[row]} api={api} onRefresh={()=>window.dispatchEvent(new Event('xz-video-pool-refresh'))}/>}</article>)}
 </section>;
}
