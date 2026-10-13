import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Dialog} from './GlobalTools.jsx';
import {FormattedText} from '../components/FormattedText.jsx';
import {directorWorkPreview} from '../../core/directorWorkPreview.js';
import {versionPreviewPages} from '../../core/versionPreview.js';
export function DirectorLiveRepair({realtime,onClose}){
 const [preview,setPreview]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[kind,setKind]=useState('work'),[page,setPage]=useState(0),alive=useRef(true);
 const pages=useMemo(()=>versionPreviewPages(kind==='work'?directorWorkPreview(preview?.document):preview?.document?.script||''),[preview,kind]);
 useEffect(()=>{alive.current=true;realtime.repair('preview').then(r=>{if(alive.current)setPreview(r);}).catch(e=>{if(alive.current)setError(e.message);}).finally(()=>{if(alive.current)setBusy(false);});return()=>{alive.current=false;};},[]);
 async function apply(){setBusy(true);setError('');try{await realtime.repair('apply',preview.summary);if(alive.current)onClose();}catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}}
 return <Dialog open title="修复多人协作数据" className="director-version-dialog" onClose={busy?()=>{}:onClose}>
  <p>仅修复有协作合并证据的重复文字和重复记录；提示词、快速编辑、导演构想及生成记录保留。采用前会保存云端历史和本地副本。</p>
  {error&&<p role="alert">{error}</p>}
  {preview?.document?<><h3>{preview.document.name}</h3><p>修复后 {preview.summary.episodes} 集 · {preview.summary.prompts} 条提示词；合并 {preview.summary.duplicateRecords} 条重复记录，修复 {preview.summary.textRepairs} 处重复文字。</p>
   <div className="director-version-tabs"><button className={kind==='work'?'primary':'secondary'} onClick={()=>{setKind('work');setPage(0);}}>导演创作内容</button><button className={kind==='script'?'primary':'secondary'} onClick={()=>{setKind('script');setPage(0);}}>原剧本</button></div>
   <div className="version-preview-pages"><button className="secondary" disabled={page===0} onClick={()=>setPage(p=>p-1)}>上一页</button><span>第 {page+1} / {pages.length} 页</span><button className="secondary" disabled={page>=pages.length-1} onClick={()=>setPage(p=>p+1)}>下一页</button></div>
   <div className="director-version-preview"><FormattedText text={pages[page]||''}/></div>
   {!!preview.summary.conflicts.length&&<p role="alert">发现 {preview.summary.conflicts.length} 处独立创作差异，不能自动采用；请到协作版本查看并选择历史内容。</p>}
   <div className="director-version-confirm"><p>确认后，成员会重新连接到修复后的共同版本。所有成员请更新至 2.8.35 或以上。</p><div className="director-version-actions"><button className="secondary" disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy||preview.locked||!!preview.summary.conflicts.length} onClick={apply}>{busy?'正在修复…':'确认采用修复结果'}</button></div></div>
  </>:<p>{busy?'正在检查并准备修复预览…':'项目已修复，请关闭后刷新云端。'}</p>}
 </Dialog>;
}
