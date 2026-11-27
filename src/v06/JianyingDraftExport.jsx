import React, { useRef, useState } from 'react';
import { FileVideo, Info } from 'lucide-react';
import { Dialog } from './GlobalTools.jsx';
import HoverInfo from './HoverInfo.jsx';
import './JianyingDraftExport.css';

const instructions = '只使用已下载到行舟项目资料目录的视频和配音。每个分镜采用一条可用视频，按集数、场次和分镜编号排列。缺失素材会列在导出结果中。';

export function JianyingDraftExport({api, selection, label, disabled=false, help=false}) {
 const inProgress=useRef(false);
 const [busy,setBusy]=useState(false),[result,setResult]=useState(null),[error,setError]=useState('');

 async function run() {
  if(inProgress.current)return;
  inProgress.current=true;
  setBusy(true);
  setResult(null);
  setError('');
  try {
   const output=await api.projectJianyingDraft(selection);
   if(output)setResult(output);
  } catch(cause) {
   setError(cause?.message||'请检查导出目录和本机素材后重试。');
  } finally {
   inProgress.current=false;
   setBusy(false);
  }
 }

 if(typeof api.projectJianyingDraft!=='function')return null;
 const notes=[...(result?.skipped||[]),...(result?.voiceNotes||[])];
 return <span className="jianying-draft-action">
  <button type="button" className="secondary jianying-draft-export" aria-label={label} aria-busy={busy} disabled={busy||disabled} onClick={run}>
   <FileVideo size={15} aria-hidden="true"/>{busy?'正在导出…':label}
  </button>
  {help&&<HoverInfo className="jianying-draft-help" label="剪映草稿导出说明" content={instructions}><Info size={16} aria-hidden="true"/></HoverInfo>}
  <Dialog open={Boolean(result||error)} title="剪映草稿导出" className="jianying-draft-report" restoreFocusWithoutScroll onClose={()=>{setResult(null);setError('');}}>
   {error?<p role="alert" className="collab-error">{error}</p>:result&&<>
    <p role="status">{result.folder?`已导出 ${result.shots} 个镜头、${result.voices} 段配音`:'没有可导出的本机视频'}</p>
    {result.folder&&<p className="jianying-draft-folder">{result.folder}</p>}
    {notes.length>0&&<ul aria-label="素材处理说明">{notes.map((note,index)=><li key={index}>{note}</li>)}</ul>}
   </>}
  </Dialog>
 </span>;
}
