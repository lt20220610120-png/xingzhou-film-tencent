import React,{useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import winkIcon from '../assets/wink-ai-icon.png';
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
  const off=api?.onWinAiState?.(value=>{if(disposed)return;if(value?.ready)setBusy(false);if(value?.closed){setBusy(false);setError(value.error||'连接已关闭，请重新连接');}});
  Promise.resolve().then(()=>{if(disposed)return;if(typeof api?.winAiOpen!=='function')throw Error('请在最新版行舟影视桌面应用中使用 Win AI');return api.winAiOpen({bounds:bounds(),reconnect:attempt>0});}).then(()=>{if(!disposed&&current===generation.current){setBusy(false);update();}}).catch(e=>{if(!disposed&&current===generation.current){setBusy(false);setError(String(e?.message||e).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,'').replace(/^Error:\s*/,''));}});
  return()=>{disposed=true;generation.current++;observer.disconnect();window.removeEventListener('resize',update);cancelAnimationFrame(frame);off?.();const hide=api?.winAiHide||api?.winAiClose;void hide?.().catch(()=>{});};
 },[account?.id,attempt]);
 return <div className="win-ai-workspace"><aside className="win-ai-dock" aria-label="Win AI 控制"><img src={winkIcon} alt="Wink AI"/><button className="win-ai-refresh-button" disabled={busy} aria-label="刷新 Win AI" title="刷新 Win AI" onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={17} className={busy?'spin':''}/></button></aside><div ref={host} className="win-ai-host" aria-label="Win AI 控制台" aria-busy={busy}>{busy&&<p className="win-ai-message">正在打开 Win AI…</p>}{error&&<div className="win-ai-message" role="alert"><strong>暂时无法打开 Win AI</strong><p>{error}</p></div>}</div></div>;
}
