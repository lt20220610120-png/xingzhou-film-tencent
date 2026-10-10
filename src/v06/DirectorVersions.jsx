import React,{useEffect,useRef,useState} from 'react';
import {Dialog} from './GlobalTools.jsx';
import {FormattedText} from '../components/FormattedText.jsx';

const labels={baseline:'共享基准',accepted:'已上传',conflict:'冲突待制片选择',restore:'制片恢复'};
const versionTime=v=>{const d=new Date(v.created_at||v.createdAt);return Number.isNaN(d.getTime())?'时间未记录':d.toLocaleString();};
export function DirectorVersions({project,api,onClose,onCloud,onLocal}){
 const [rows,setRows]=useState([]),[before,setBefore]=useState(null),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(''),[tab,setTab]=useState('cloud');
 const live=useRef(true),request=useRef(0);
 useEffect(()=>{live.current=true;load();return()=>{live.current=false;request.current++;};},[project.cloudProjectId]);
 async function load(cursor){setBusy(true);setError('');try{const result=await api.directorCollabListVersions({projectId:project.cloudProjectId,...(cursor?{before:cursor}:{})});if(!live.current)return;setRows(old=>cursor?[...old,...result.versions]:result.versions);setBefore(result.nextBefore);}catch(e){if(live.current)setError(e.message);}finally{if(live.current)setBusy(false);}}
 async function select(row){const id=++request.current;setConfirm('');setSelected(null);setBusy(true);setError('');try{const v=await api.directorCollabGetVersion({projectId:project.cloudProjectId,versionId:row.id});if(live.current&&request.current===id)setSelected(v);}catch(e){if(live.current)setError(e.message);}finally{if(live.current&&request.current===id)setBusy(false);}}
 async function adopt(){const operation=++request.current;setBusy(true);setError('');try{
   if(tab==='local'){onLocal(selected.document);setConfirm('');return;}
   const current=await api.directorCollabGetProject({projectId:project.cloudProjectId});
   if(!live.current||request.current!==operation)return;
   const restored=await api.directorCollabRestoreVersion({projectId:project.cloudProjectId,versionId:selected.id,mode:confirm,currentDocument:{name:current.name,script:current.script||'',episodes:current.episodes||[]}});
   if(!live.current)return;onCloud(restored);setConfirm('');await load();
  }catch(e){if(live.current)setError(e.message);}finally{if(live.current)setBusy(false);}}
 const local=[...(project.localCollaborationVersions||[])].reverse();
 return <Dialog open title="协作版本" onClose={busy?()=>{}:onClose} className="director-version-dialog">
   <p>编辑仅保存本地，点击“上传云端”后共享。所有上传版本和冲突版本保留；只有项目制片可决定云端采用版本。历史版本不会按回收站期限清理。</p>
   <div className="director-version-tabs"><button disabled={busy} className={tab==='cloud'?'primary':'secondary'} onClick={()=>{setTab('cloud');setSelected(null);setConfirm('');}}>云端版本</button><button disabled={busy} className={tab==='local'?'primary':'secondary'} onClick={()=>{setTab('local');setSelected(null);setConfirm('');}}>我的本地版本</button><button className="secondary" disabled={busy} onClick={()=>load()}>刷新版本</button></div>
   {error&&<p role="alert">{error}</p>}
   <div className="director-version-layout"><div className="director-version-list">
     {(tab==='cloud'?rows:local).map(v=><button key={v.id} className={`secondary ${selected?.id===v.id?'selected':''}`} disabled={busy} onClick={()=>tab==='cloud'?select(v):(setSelected(v),setConfirm(''))}>
       <strong>{tab==='cloud'?`版本 ${v.sequence} · ${v.author_name||'成员'}`:'我的上传前副本'}</strong><span>{tab==='cloud'?labels[v.status]:'本地保留'} · {versionTime(v)}</span>
     </button>)}
     {tab==='cloud'&&before&&<button className="secondary" disabled={busy} onClick={()=>load(before)}>更早版本</button>}
     {!(tab==='cloud'?rows:local).length&&<p>{busy?'读取中…':'暂无版本；首次上传后会保留共享基准和成员版本。'}</p>}
   </div><div className="director-version-preview">
     {selected?<><h3>{selected.document.name}</h3><p>{selected.document.episodes?.length||0} 集 · {selected.document.script?.length||0} 字</p><FormattedText text={(selected.published_document||selected.document).script||''}/>
       {tab==='local'?<button className="secondary" disabled={busy} onClick={()=>setConfirm('local')}>取回到我的本地副本</button>:project.cloudRole==='producer'&&!project.cloudLocked?<div className="director-version-actions">{selected.status==='conflict'&&<button className="primary" disabled={busy} onClick={()=>setConfirm('resolve')}>采用此人的冲突修改</button>}<button className="secondary" disabled={busy} onClick={()=>setConfirm('restore')}>恢复整份历史版本</button></div>:<p>可查看版本；云端采用由项目制片决定。</p>}
     </>:<p>选择版本查看完整剧本。每人的提交和共享结果分别保留。</p>}
   </div></div>
   {confirm&&<div className="director-version-confirm"><p>{confirm==='resolve'?'采用此人的冲突修改，保留其他位置的无冲突改动。':confirm==='local'?'取回到自己的本地副本，当前本地内容会先另存版本，云端保持不变。':'将共享项目恢复为这份完整历史版本。恢复前的共享内容会另存版本，本地未上传修改仍保留。'}</p><button className="secondary" disabled={busy} onClick={()=>setConfirm('')}>取消</button><button className="primary" disabled={busy} onClick={adopt}>{busy?'处理中…':'确认采用'}</button></div>}
 </Dialog>;
}
