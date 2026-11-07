import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {LogOut,X} from 'lucide-react';
export function LogoutConfirm({open,onCancel,onConfirm}){
 const dialog=useRef(null),cancel=useRef(null),pending=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!open)return;const previous=document.activeElement;setError('');dialog.current.showModal();cancel.current?.focus();return()=>{dialog.current?.close();previous?.focus();};},[open]);
 const confirm=async()=>{if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await onConfirm();}catch(e){setError(String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,''));}finally{pending.current=false;setBusy(false);}};
 if(!open)return null;
 return createPortal(<dialog ref={dialog} className="logout-confirm" aria-labelledby="logout-title" aria-describedby="logout-description" onCancel={e=>{e.preventDefault();if(!pending.current)onCancel();}}>
  <button className="access-close" aria-label="取消退出登录" disabled={busy} onClick={onCancel}><X size={20}/></button><span className="access-icon"><LogOut size={25}/></span><span className="access-eyebrow">账号管理</span>
  <h2 id="logout-title">是否确定退出登录？</h2><p id="logout-description">退出后需重新登录，才能继续使用工作台。</p>
  {error&&<p className="auth-error" role="alert">{error}</p>}
  <div className="access-dialog-actions"><button ref={cancel} disabled={busy} onClick={onCancel}>取消</button><button className="primary" disabled={busy} onClick={confirm}>{busy?'正在退出…':'确定退出'}</button></div>
 </dialog>,document.body);
}
