import React,{useEffect,useRef,useState} from 'react';
import {Film,ArrowUpRight,RefreshCw,Download} from 'lucide-react';
import {projectVideoRows,filterProjectVideos,videoLabelCompare} from '../../core/projectVideoPool.js';
import {generationMediaProfiles} from '../../core/canvasStore.js';
import {GenerationResults} from './GenerationResults.jsx';
import './ProjectVideoPool.css';
export function ProjectVideoPool({project,api,state,accountId,onOpenStoryboard}){
 const [rows,setRows]=useState([]),[episode,setEpisode]=useState(''),[scene,setScene]=useState(''),[automatic,setAutomatic]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [status,setStatus]=useState('all'),[page,setPage]=useState(1);
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
 const scoped=filterProjectVideos(rows,{episode,scene}),successful=scoped.filter(r=>r.status==='success');
 const groups=[['all','全部',()=>true],['success','已完成',r=>r.status==='success'],['active','生成中',r=>['submitted','submitting','downloading'].includes(r.status)],['failed','待处理',r=>['failed','uncertain'].includes(r.status)],['not-started','未生成',r=>r.status==='not-started']];
 const shown=scoped.filter(groups.find(g=>g[0]===status)[2]),pages=Math.max(1,Math.ceil(shown.length/60)),currentPage=Math.min(page,pages),visible=shown.slice((currentPage-1)*60,currentPage*60);
 useEffect(()=>setPage(1),[episode,scene,status,project.id]);
 const download=async()=>{setBusy(true);setError('');try{const result=await api.projectVideoExport({projectId:project.id,ids:successful.map(r=>({jobId:r.mediaId?undefined:r.id,mediaId:r.mediaId}))});if(result)setNotice(`已下载 ${result.completed} 条${result.errors.length?`，${result.errors.length} 条未完成：${result.errors.join('；')}`:''}`);}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <section className="project-video-pool"><header><h2>视频池</h2><div className="video-pool-header-actions"><label className="video-pool-check"><input type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)}/>自动刷新</label><button aria-label="刷新视频状态" onClick={()=>window.dispatchEvent(new Event('xz-video-pool-refresh'))}><RefreshCw size={15}/>刷新</button><button className="primary" disabled={busy||!successful.length} onClick={download}><Download size={15}/>{busy?'正在下载…':`下载${scene?'本场':episode?'本集':'全剧'}（${successful.length}）`}</button></div></header>
 <div className="video-pool-toolbar"><div className="video-pool-status-tabs" role="group" aria-label="视频状态">{groups.map(([key,label,matches])=><button key={key} aria-pressed={key===status} onClick={()=>setStatus(key)}>{label}<span>{scoped.filter(matches).length}</span></button>)}</div><label>集数<select aria-label="视频池集数" value={episode} onChange={e=>{setEpisode(e.target.value);setScene('');}}><option value="">全剧</option>{[...new Set(rows.map(r=>r.episode).filter(Boolean))].sort((a,b)=>a-b).map(ep=><option key={ep} value={ep}>第 {ep} 集</option>)}</select></label><label>场景<select aria-label="视频池场景" value={scene} disabled={!episode} onChange={e=>setScene(e.target.value)}><option value="">全部场景</option>{[...new Set(filterProjectVideos(rows,{episode}).map(r=>r.scene).filter(Boolean))].sort(videoLabelCompare).map(s=><option key={s}>{s}</option>)}</select></label></div>
 {error&&<p role="alert" className="collab-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {!shown.length&&<div className="video-pool-empty"><Film size={30} aria-hidden="true"/><p>{!rows.length?'暂无分镜':'没有符合筛选的视频'}</p></div>}
 <div className="video-pool-grid">{visible.map(row=><article className={`video-pool-row${row.status==='not-started'?' video-pool-row--waiting':''}`} key={row.id}>{row.status==='not-started'?<><button className="video-pool-placeholder" aria-label={`打开分镜 ${row.label}`} disabled={!onOpenStoryboard} onClick={()=>onOpenStoryboard?.(row)}><Film size={27} aria-hidden="true"/>{onOpenStoryboard&&<span>前往分镜<ArrowUpRight size={14}/></span>}</button><header><h3>{row.label}</h3><span>未生成</span></header></>:<><h3>{row.label}</h3><GenerationResults tasks={[row]} api={api} onRefresh={()=>window.dispatchEvent(new Event('xz-video-pool-refresh'))}/></>}</article>)}</div>
 {pages>1&&<nav className="video-pool-pagination" aria-label="视频池分页"><button disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>上一页</button><span>{currentPage} / {pages}</span><button disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>下一页</button></nav>}
 </section>;
}
