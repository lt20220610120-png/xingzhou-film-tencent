import React,{useEffect,useState} from 'react';

export function DoubaoWorkAccountSetup({model,onModelChange}) {
 const [status,setStatus]=useState(null),[models,setModels]=useState([]),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const refresh=async()=>{
  setBusy('refresh');setError('');
  try{
   if(!window.xingzhou?.doubaoWorkStatus)throw new Error('请在行舟影视 Windows 桌面应用中连接豆包工作');
   const next=await window.xingzhou.doubaoWorkStatus();setStatus(next);
   if(next.loggedIn){const found=await window.xingzhou.doubaoWorkModels();setModels(Array.isArray(found)?found:found.models||[]);}else setModels([]);
  }catch(e){setError(e.message);}finally{setBusy('');}
 };
 const open=async()=>{
  setBusy('open');setError('');
  try{if(!window.xingzhou?.doubaoWorkOpenLogin)throw new Error('请在桌面应用中打开客户端');setStatus(await window.xingzhou.doubaoWorkOpenLogin());}
  catch(e){setError(e.message);}finally{setBusy('');}
 };
 useEffect(()=>{refresh();},[]);
 return <div className="gemini-account-setup full">
  <div className="gemini-account-top"><strong>本机豆包工作</strong><span className={status?.loggedIn?'connected':''} role="status">{busy==='refresh'?'正在检查客户端…':status?.loggedIn?'已登录':status?.message||'等待连接'}</span></div>
  <p>使用豆包工作客户端已有的登录账号，无需 API Key。调用时会切换到客户端提交任务；请保持登录，任务结束前保留当前任务页面。此连接用于文本；图片、视频和语音仍使用各自的生成接口配置。</p>
  <div className="gemini-account-actions"><button type="button" className="secondary" disabled={!!busy} onClick={open}>{busy==='open'?'正在打开…':'打开豆包工作'}</button><button type="button" className="secondary" disabled={!!busy} onClick={refresh}>刷新连接与模型</button></div>
  <label>账号可用模型<select aria-label="豆包工作模型" value={model||'auto'} onChange={e=>onModelChange(e.target.value)}><option value="auto">自动 · 使用账号默认模型</option>{models.filter(m=>m.id!=='auto').map(m=><option key={m.id} value={m.id}>{m.name||m.id}</option>)}{model&&model!=='auto'&&!models.some(m=>m.id===model)&&<option value={model}>{model} · 已保存，待刷新核对</option>}</select></label>
  {error&&<p role="alert" className="auth-error">{error}</p>}
 </div>;
}
