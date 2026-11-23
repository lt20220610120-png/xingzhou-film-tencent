import React,{useState} from 'react';
import {ExternalLink,RefreshCw} from 'lucide-react';
import {Dialog} from './GlobalTools.jsx';
import {invalidateLibTVReads,useLibTVRead} from './libtvReads.js';
import {libTVError} from './libtvError.js';

export default function LibTVProjectControl({api,ownerKey,accountId='',disabled=false}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[dialog,setDialog]=useState(''),[name,setName]=useState(''),[link,setLink]=useState('');
 const {value:data,error:readError,refresh}=useLibTVRead(api,'projects',[accountId,ownerKey],()=>api.libtvProjects(),!!api.libtvProjects);
 if(!api.libtvProjects)return null;
 const act=async fn=>{
  setBusy(true);setError('');
  try{await fn();setDialog('');invalidateLibTVReads(api,{group:'projects',preserve:true});}
  catch(reason){setError(libTVError(reason));}
  finally{setBusy(false);}
 };
 const retry=async()=>{
  setBusy(true);setError('');
  try{await refresh();}catch{} // The shared status retains the last usable project.
  finally{setBusy(false);}
 };
 const locked=disabled||busy,selected=data?.projects?.find(p=>p.id===data.selectedId);
 return <div className="libtv-project-control"><label>LibTV 项目<select aria-label="LibTV 项目" disabled={locked||!data} value={data?.selectedId||''} onChange={e=>void act(()=>api.libtvUseProject({projectId:e.target.value}))}>{!selected&&<option value="">首次生成时创建默认项目</option>}{(data?.projects||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className="libtv-project-actions"><button type="button" disabled={locked} onClick={()=>{setError('');setName('');setDialog('new');}}>新建项目</button><button type="button" disabled={locked} onClick={()=>{setError('');setName('');setLink('');setDialog('connect');}}>连接已有项目</button>{selected&&<button type="button" aria-label="打开当前 LibTV 项目" title="打开当前项目" disabled={locked} onClick={()=>api.openExternal?.(selected.url)}><ExternalLink size={16}/></button>}<button type="button" aria-label="刷新 LibTV 项目" disabled={locked} onClick={()=>void retry()}><RefreshCw size={16}/></button></div>{readError&&!error&&!dialog&&<small role="status" data-libtv-read-status>{data?"项目暂未刷新":"项目暂不可读取"}，可手动刷新。</small>}{error&&!dialog&&<p role="alert" className="collab-error">{error}</p>}{dialog&&<Dialog open title={dialog==='new'?'新建 LibTV 项目':'连接已有 LibTV 项目'} onClose={()=>!busy&&setDialog('')}><form onSubmit={e=>{e.preventDefault();void act(()=>dialog==='new'?api.libtvCreateProject({name}):api.libtvUseProject({projectId:link,name}));}}>{dialog==='connect'&&<label>画布链接或项目编号<input aria-label="LibTV 画布链接或项目编号" value={link} onChange={e=>setLink(e.target.value)} required autoFocus/></label>}<label>项目名称{dialog==='connect'?'（可选）':''}<input aria-label="LibTV 项目名称" value={name} onChange={e=>setName(e.target.value)} maxLength={80} required={dialog==='new'} autoFocus={dialog==='new'}/></label>{error&&<p role="alert" className="collab-error">{error}</p>}<div className="libtv-project-actions"><button type="button" disabled={busy} onClick={()=>setDialog('')}>取消</button><button type="submit" className="primary" disabled={busy||dialog==='new'&&!name.trim()||dialog==='connect'&&!link.trim()}>{busy?'正在连接…':dialog==='new'?'创建并使用':'连接并使用'}</button></div></form></Dialog>}</div>;
}
