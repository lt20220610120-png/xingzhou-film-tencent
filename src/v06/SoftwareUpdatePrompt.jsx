import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowUpCircle,Download,RefreshCw,X,Check} from 'lucide-react';
import {interpretUpdateResult} from '../../core/appServices.js';
const key='xingzhou-update-dismissed-version';
const readable=e=>String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,'');
export function SoftwareUpdatePrompt({api=window.xingzhou}){
 const [update,setUpdate]=useState(null),[phase,setPhase]=useState('checking'),[error,setError]=useState(''),[open,setOpen]=useState(false),[ignore,setIgnore]=useState(false),[progress,setProgress]=useState(0);
 const dialog=useRef(null),later=useRef(null),sequence=useRef(0),alive=useRef(false),busy=useRef(false),current=useRef(null);current.current={update,phase};
 const check=useCallback(async(manual=false)=>{if(manual&&['ready','downloading','installing'].includes(current.current?.phase)){setOpen(true);return;}if(busy.current){if(manual)setOpen(true);return;}const id=++sequence.current;setPhase('checking');setError('');if(manual)setOpen(true);try{
  const next=interpretUpdateResult(await api.checkUpdate());if(!alive.current||id!==sequence.current)return;setUpdate(next);setPhase(next.available?'available':'idle');let dismissed='';try{dismissed=localStorage.getItem(key)||'';}catch{}
  if(manual||(next.available&&dismissed!==next.version)){setIgnore(false);setOpen(true);}
 }catch(e){if(alive.current&&id===sequence.current){setError(readable(e));setPhase('error');if(manual)setOpen(true);}}},[api]);
 useEffect(()=>{if(!api?.checkUpdate)return;alive.current=true;void check();const listener=()=>void check(true);window.addEventListener('xingzhou-check-update',listener);const off=api.onUpdateProgress?.(value=>{if(alive.current)setProgress(Math.max(0,Math.min(100,Number(value.percent)||0)));});return()=>{alive.current=false;sequence.current++;window.removeEventListener('xingzhou-check-update',listener);off?.();};},[api,check]);
 const dismiss=()=>{if(phase==='installing')return;if(ignore&&update?.available)try{localStorage.setItem(key,update.version);}catch{}setOpen(false);};
 useEffect(()=>{if(!open)return;const node=dialog.current,previous=document.activeElement;node.showModal();later.current?.focus();return()=>{node.close();previous?.focus();};},[open]);
 const download=async()=>{if(busy.current)return;busy.current=true;setPhase('downloading');setProgress(0);setError('');try{await api.downloadUpdate({version:update.version});if(alive.current)setPhase('ready');}catch(e){if(alive.current){setError(readable(e));setPhase('available');}}finally{busy.current=false;}};
 const install=async()=>{if(busy.current)return;busy.current=true;setPhase('installing');setError('');try{await api.installUpdate();}catch(e){if(alive.current){setError(readable(e));setPhase('ready');}}finally{busy.current=false;}};
 if(!open)return null;
 return createPortal(<dialog ref={dialog} className="startup-update-dialog" aria-labelledby="startup-update-title" onCancel={e=>{e.preventDefault();dismiss();}}>
  <button className="startup-update-close" aria-label="关闭更新提示" disabled={phase==='installing'} onClick={dismiss}><X size={19}/></button>
  <span className="startup-update-icon">{phase==='idle'?<Check size={24}/>:<ArrowUpCircle size={25}/>}</span>
  <h2 id="startup-update-title">{phase==='checking'?'正在检查更新':phase==='error'?'检查更新失败':phase==='idle'?'已是最新版本':phase==='ready'?'新版本已准备就绪':'发现新版本'}</h2>
  {update&&<p className="startup-update-version">当前 v{update.currentVersion}{update.available&&<> <span>→</span> v{update.version}</>}</p>}
  {update?.available&&update.notes&&<div className="startup-update-notes" tabIndex={0} aria-label="更新内容">{update.notes}</div>}
  {phase==='downloading'&&<div className="startup-update-progress" role="status"><span>正在下载<strong>{Math.round(progress)}%</strong></span><progress aria-label="更新下载进度" max="100" value={progress}/></div>}
  {phase==='installing'&&<p role="status">正在启动安装程序…</p>}
  {error&&<p className="startup-lock-error" role="alert">{error}</p>}
  {update?.available&&<label className="startup-update-ignore"><input type="checkbox" checked={ignore} onChange={e=>setIgnore(e.target.checked)}/>不再提醒此版本</label>}
  <div className="startup-update-actions"><button ref={later} disabled={phase==='installing'} onClick={dismiss}>{update?.available?'下次再说':'关闭'}</button>
   {phase==='available'&&<button className="primary" onClick={download}><Download size={16}/>立即更新</button>}
   {phase==='ready'&&<button className="primary" onClick={install}>安装并重启</button>}
   {phase==='error'&&<button className="primary" onClick={()=>check(true)}><RefreshCw size={15}/>重试</button>}
  </div>
 </dialog>,document.body);
}
