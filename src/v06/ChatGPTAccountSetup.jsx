import React,{useEffect,useRef,useState} from 'react';
import {runChatGPTAccountAction} from './chatgpt-account-status.mjs';
export function ChatGPTAccountSetup(){
 const [status,setStatus]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const sequence=useRef(0);
 const call=async(action)=>{const id=++sequence.current;setBusy(action);setError('');try{const result=await runChatGPTAccountAction(window.xingzhou,action);if(id===sequence.current)setStatus(result);}catch(e){if(id===sequence.current){setError(e.message);setStatus({loggedIn:false,authState:'unknown',message:e.message,code:e.code});}}finally{if(id===sequence.current)setBusy('');}};
 useEffect(()=>{call('refresh');return()=>{sequence.current++;};},[]);
 return <div className="gemini-account-setup full"><div className="gemini-account-top"><strong>ChatGPT 网页账号</strong><span role="status" className={status?.loggedIn?'connected':''}>{busy==='refresh'?'检查登录中…':busy==='login'?'打开登录窗口中…':status?.running?status.message:status?.loggedIn?'已登录，待测试正文':status?.message||'等待连接'}</span></div><p>在独立窗口完成登录或网站验证后，保留窗口并刷新连接，再测试正文。连接成功后窗口会最小化，后台调用继续使用同一网页会话及当前默认模型；会话保存在本机。</p><div className="gemini-account-actions"><button type="button" className="secondary" disabled={!!busy||status?.running} onClick={()=>call('login')}>打开 ChatGPT 登录窗口</button><button type="button" className="secondary" disabled={!!busy} onClick={()=>call('refresh')}>刷新连接</button></div><label>网页模型<select aria-label="ChatGPT 网页模型" value="auto" disabled><option value="auto">自动 · 网页当前默认模型</option></select></label>{error&&<p role="alert" className="auth-error">{error}</p>}</div>;
}
