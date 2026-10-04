import React,{useEffect,useState} from 'react';

export function GeminiAccountSetup({model,onModelChange}) {
 const [status,setStatus]=useState(null),[models,setModels]=useState([]),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const refresh=async()=>{
  setBusy('refresh');setError('');
  try {
   if(!window.xingzhou?.geminiWebStatus)throw new Error('请在行舟影视桌面应用中连接 Gemini 网页账号');
   const next=await window.xingzhou.geminiWebStatus();setStatus(next);
   if(next.loggedIn){const found=await window.xingzhou.geminiWebModels();setModels(Array.isArray(found)?found:found.models||[]);}else setModels([]);
  }catch(e){setError(e.message);}finally{setBusy('');}
 };
 const login=async()=>{
  setBusy('login');setError('');
  try{if(!window.xingzhou?.geminiWebOpenLogin)throw new Error('请在桌面应用中登录');setStatus(await window.xingzhou.geminiWebOpenLogin());}
  catch(e){setError(e.message);}finally{setBusy('');}
 };
 useEffect(()=>{refresh();},[]);
 return <div className="gemini-account-setup full">
  <div className="gemini-account-top"><strong>Gemini 网页账号</strong><span className={status?.loggedIn?'connected':''} role="status">{busy==='refresh'?'正在检查登录…':status?.loggedIn?'已登录':status?.message||'等待登录'}</span></div>
  <p>首次在独立浏览器窗口登录，完成后关闭该窗口，再刷新登录与模型。登录状态保存在本机，调用时软件自动启动后台浏览器；Google 要求重新验证时，再登录一次。</p>
  <div className="gemini-account-actions"><button type="button" className="secondary" disabled={!!busy} onClick={login}>{busy==='login'?'正在打开…':'打开 Gemini 登录窗口'}</button><button type="button" className="secondary" disabled={!!busy} onClick={refresh}>刷新登录与模型</button></div>
  <label>账号可用模型<select aria-label="Gemini 网页模型" value={model||'auto'} onChange={e=>onModelChange(e.target.value)}><option value="auto">自动 · 使用账号默认模型</option>{models.map(m=><option key={m.id} value={m.id}>{m.name||m.modelName||m.id}</option>)}{model&&model!=='auto'&&!models.some(m=>m.id===model)&&<option value={model}>{model} · 已保存，待刷新核对</option>}</select></label>
  {error&&<p role="alert" className="auth-error">{error}</p>}
 </div>;
}
