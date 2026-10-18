import React,{useEffect,useRef,useState} from 'react';
import {RefreshCw,Network} from 'lucide-react';
import './WinAIWorkspace.css';
export function WinAIWorkspace({account}){
 const host=useRef(null),generation=useRef(0),[busy,setBusy]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const current=++generation.current;let disposed=false,frame;
  const api=window.xingzhou;
  const bounds=()=>{const r=host.current?.getBoundingClientRect();return r?{x:Math.max(0,Math.round(r.left)),y:Math.max(0,Math.round(r.top)),width:Math.max(0,Math.floor(r.width)),height:Math.max(0,Math.floor(r.height))}:null;};
  setBusy(true);setError('');
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!disposed){const b=bounds();if(b)void api?.winAiBounds?.(b).catch(()=>{});}});};
  const observer=new ResizeObserver(update);if(host.current)observer.observe(host.current);window.addEventListener('resize',update);
  const off=api?.onWinAiState?.(value=>{if(!disposed&&value?.closed){setBusy(false);setError(value.error||'连接已关闭，请重新连接');}});
  Promise.resolve().then(()=>{if(disposed)return;if(typeof api?.winAiOpen!=='function')throw Error('请在最新版行舟影视桌面应用中使用 Win AI');return api.winAiOpen({bounds:bounds()});}).then(()=>{if(!disposed&&current===generation.current){setBusy(false);update();}}).catch(e=>{if(!disposed&&current===generation.current){setBusy(false);setError(String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,'').replace(/^Error:\s*/,''));}});
  return()=>{disposed=true;generation.current++;observer.disconnect();window.removeEventListener('resize',update);cancelAnimationFrame(frame);off?.();void api?.winAiClose?.().catch(()=>{});};
 },[account?.id,attempt]);
 return <div className="win-ai-workspace"><header><div><h1><Network size={22}/> Win AI</h1><p>已关联行舟账号：{account?.displayName||account?.username} · API 令牌与用量管理</p></div><button className="secondary" onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={15}/>重新连接</button></header><div ref={host} className="win-ai-host" aria-label="Win AI 控制台">{busy&&<p className="win-ai-message">正在使用当前行舟账号进入 Win AI，无需再次注册…</p>}{error&&<div className="win-ai-message" role="alert"><strong>暂时无法打开 Win AI</strong><p>{error}</p><button className="primary" onClick={()=>setAttempt(n=>n+1)}>重新连接</button></div>}</div></div>;
}
