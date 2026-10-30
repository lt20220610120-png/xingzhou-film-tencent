import React,{useEffect,useRef,useState} from 'react';
import {projectVideoRows,filterProjectVideos,videoLabelCompare} from '../../core/projectVideoPool.js';
import {generationMediaProfiles} from '../../core/canvasStore.js';
import {GenerationResults} from './GenerationResults.jsx';
import './ProjectVideoPool.css';
export function ProjectVideoPool({project,api,state,accountId}){
 const [rows,setRows]=useState([]),[episode,setEpisode]=useState(''),[scene,setScene]=useState(''),[automatic,setAutomatic]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const loading=useRef(false),epoch=useRef(0),latest=useRef({state,project});latest.current={state,project};
 useEffect(()=>{const ticket=++epoch.current;let disposed=false,mediaPending=false,cloudMedia=[],mediaAt=0;const querying=new Set();loading.current=false;setRows([]);setEpisode('');setScene('');setError('');
  const display=tasks=>{if(disposed||ticket!==epoch.current)return;const cloud=latest.current.project,source=latest.current.state.directorProjects?.find(p=>p.id===cloud.director_project_id);setRows(projectVideoRows(source?{...cloud,episodes:source.episodes}:cloud,tasks,cloudMedia));};
  const load=async()=>{if(loading.current)return;loading.current=true;try{
   const tasks=await api.generationList({includeArchived:true});display(tasks); // Show submitted receipts immediately, never wait for query/download or cloud reads.
   for(const task of tasks.filter(t=>t.projectId===project.id&&!['success','failed'].includes(t.status)&&(t.jobId||t.status==='downloading'))){
    if(disposed||querying.has(task.id)||task.nextPollAt&&task.nextPollAt>Date.now())continue;
    const profile=generationMediaProfiles(latest.current.state,'video').find(p=>p.id===task.profileId);if(!profile)continue;querying.add(task.id);
    void api.generationRefresh({id:task.id,apiKey:profile.apiKey,endpoint:profile.endpoint}).then(()=>api.generationList({includeArchived:true})).then(display).catch(e=>{if(!disposed)setError('原任务查询暂未完成：'+e.message);}).finally(()=>querying.delete(task.id));
   }
   if(!mediaPending&&Date.now()-mediaAt>30000){mediaPending=true;void api.collabListMedia({projectId:project.id}).then(media=>{cloudMedia=media;mediaAt=Date.now();return api.generationList({includeArchived:true});}).then(display).catch(e=>{if(!disposed)setError('云端视频读取暂未完成，本机提交记录仍正常显示：'+e.message);}).finally(()=>{mediaPending=false;});}
  }catch(e){if(!disposed)setError(e.message);}finally{if(ticket===epoch.current)loading.current=false;}};
  void load();const timer=automatic?setInterval(load,4000):null;window.addEventListener('xz-video-pool-refresh',load);
  return()=>{disposed=true;clearInterval(timer);window.removeEventListener('xz-video-pool-refresh',load);};
 },[project.id,accountId,automatic]);
 const shown=filterProjectVideos(rows,{episode,scene}),successful=shown.filter(r=>r.status==='success');
 const download=async()=>{setBusy(true);setError('');try{const result=await api.projectVideoExport({projectId:project.id,ids:successful.map(r=>({jobId:r.mediaId?undefined:r.id,mediaId:r.mediaId}))});if(result)setNotice(`已下载 ${result.completed} 条${result.errors.length?`，${result.errors.length} 条未完成：${result.errors.join('；')}`:''}`);}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <section className="project-video-pool"><header><div><h2>视频池</h2><p>按集数、场景、提示词顺序查看生成结果</p></div><button onClick={()=>window.dispatchEvent(new Event('xz-video-pool-refresh'))}>刷新状态</button></header>
 <div className="video-pool-toolbar"><label>集数<select value={episode} onChange={e=>{setEpisode(e.target.value);setScene('');}}><option value="">整个剧</option>{[...new Set(rows.map(r=>r.episode).filter(Boolean))].sort((a,b)=>a-b).map(ep=><option key={ep} value={ep}>第 {ep} 集</option>)}</select></label><label>场景<select value={scene} disabled={!episode} onChange={e=>setScene(e.target.value)}><option value="">全部场景</option>{[...new Set(filterProjectVideos(rows,{episode}).map(r=>r.scene).filter(Boolean))].sort(videoLabelCompare).map(s=><option key={s}>{s}</option>)}</select></label><label className="video-pool-check"><input type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)}/>每 4 秒自动监测</label><button className="primary" disabled={busy||!successful.length} onClick={download}>{busy?'正在下载…':`一键下载${scene?'本场':episode?'本集':'全剧'}（${successful.length}）`}</button></div>
 <div className="video-pool-counts"><span>共 {shown.length} 条</span><span>已成功 {successful.length}</span><span>生成中 {shown.filter(r=>['submitted','submitting','downloading'].includes(r.status)).length}</span><span>失败 / 待核对 {shown.filter(r=>['failed','uncertain'].includes(r.status)).length}</span><span>未生成 {shown.filter(r=>r.status==='not-started').length}</span></div>
 {error&&<p role="alert" className="collab-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {!rows.length&&<p>当前项目暂无分镜或生成结果。</p>}
 {shown.map(row=><article className="video-pool-row" key={row.id}><h3>{row.label}</h3>{row.status==='not-started'?<p>尚未生成，请在分镜中生成，或由管理员制作工作流接续。</p>:<GenerationResults tasks={[row]} api={api} onRefresh={()=>window.dispatchEvent(new Event('xz-video-pool-refresh'))}/>}</article>)}
 </section>;
}
