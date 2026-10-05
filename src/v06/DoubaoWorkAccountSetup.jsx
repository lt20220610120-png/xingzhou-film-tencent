import React,{useEffect,useState} from 'react';

export function DoubaoWorkAccountSetup({model,onModelChange}) {
 const [status,setStatus]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const refresh=async()=>{
  setBusy('refresh');setError('');
  try{
   if(!window.xingzhou?.doubaoWorkStatus)throw new Error('请在行舟影视 Windows 桌面应用中连接豆包工作');
   setStatus(await window.xingzhou.doubaoWorkStatus());
  }catch(e){setError(e.message);}finally{setBusy('');}
 };
 const open=async()=>{
  setBusy('open');setError('');
  try{if(!window.xingzhou?.doubaoWorkOpenLogin)throw new Error('请在桌面应用中打开客户端');setStatus(await window.xingzhou.doubaoWorkOpenLogin());}
  catch(e){setError(e.message);}finally{setBusy('');}
 };
 useEffect(()=>{refresh();},[]);
 return <div className="gemini-account-setup full">
  <div className="gemini-account-top"><strong>本机豆包工作</strong><span role="status">{busy==='refresh'?'正在检查安装…':'后台暂不可用'}</span></div>
  <p>前台自动操作已停用。目前尚未找到可验证的豆包工作账号后台接口，客户端登录不能代表行舟影视可以后台调用。请切换已接通的 Gemini、Codex 或文本 API 继续创作；之前生成的任务仍保留在豆包工作。</p>
  <div className="gemini-account-actions"><button type="button" className="secondary" disabled={!!busy} onClick={open}>{busy==='open'?'正在打开…':'手动打开豆包工作'}</button><button type="button" className="secondary" disabled={!!busy} onClick={refresh}>检查安装状态</button></div>
  {status&&<p>{status.installed?'已检测到本机安装；后台连接暂不可用。':'未检测到本机安装。'}{busy==='open'?'':status.message?.startsWith('已打开')?' 已打开客户端供手动使用。':''}</p>}
  <label>已保存模型<select aria-label="豆包工作模型" value={model||'auto'} disabled><option value={model||'auto'}>{model||'自动'} · 后台暂不可用</option></select></label>
  {error&&<p role="alert" className="auth-error">{error}</p>}
 </div>;
}
