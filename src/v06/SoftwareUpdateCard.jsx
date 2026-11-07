import React from 'react';
import {ArrowUpCircle,Check,Download,RefreshCw} from 'lucide-react';
export function SoftwareUpdateCard({version,update,phase,error,progress,onDownload,onInstall,onRetry}){
 const active=update?.available,working=['checking','downloading','installing'].includes(phase);
 return <section className="license-update software-update-card" aria-label="软件更新">
  <header><span className="access-icon">{phase==='idle'?<Check size={22}/>:<ArrowUpCircle size={23}/>}</span><div><span className="access-eyebrow">保持灵感，保持更新</span><h2>{phase==='checking'?'正在检查更新':phase==='ready'?'新版本已准备就绪':active?'发现新版本':'已是最新版本'}</h2></div>{active&&<b className="update-version">v{update.version}</b>}</header>
  <p className="update-version-line">当前版本 v{version||'…'}{active&&<> <span>→</span> v{update.version}</>}</p>
  {active&&update.notes&&<div className="update-release-notes" tabIndex={0} aria-label="更新内容">{update.notes}</div>}
  {phase==='downloading'&&<div className="update-download-progress" role="status"><span>正在下载更新<strong>{Math.round(progress)}%</strong></span><progress aria-label="更新下载进度" max="100" value={progress}/></div>}
  {phase==='installing'&&<p role="status">正在启动安装程序…</p>}
  {error&&<p className="auth-error" role="alert">{error}</p>}
  <div className="update-card-actions">{phase==='available'&&<button className="primary" onClick={onDownload}><Download size={16}/>下载更新</button>}{phase==='ready'&&<button className="primary" onClick={onInstall}><ArrowUpCircle size={16}/>安装并重启</button>}{!working&&onRetry&&<button className="update-retry" onClick={onRetry}><RefreshCw size={15}/>重新检查</button>}</div>
 </section>;
}
