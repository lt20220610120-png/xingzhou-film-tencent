import React, { useCallback, useState, useEffect, useRef } from 'react';
import { RefreshCw, Download, Copy, Film, Trash2, ChevronDown, ExternalLink, CircleAlert } from 'lucide-react';
import HoverInfo from './HoverInfo.jsx';
import models from '../../core/feituo-models.json';
import { mediaSource } from '../../core/generationReferences.js';
import { DeleteConfirm } from './DeleteConfirm.jsx';
import { MediaPreview } from './MediaPreview.jsx';
import './GenerationResults.css';

const names = { submitting: '提交中', submitted: '排队 / 生成中', downloading: '已生成 · 下载中', success: '已成功', failed: '失败', uncertain: '待核对' };
const resultStatus=task=>task.status==='submitted'&&task.remoteStatus==='awaiting-canvas'?'待在 LibTV 生成':names[task.status]||task.status;
const clearable = task => ['success', 'failed', 'uncertain'].includes(task.status);
function storageSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function GenerationResults({ tasks, api, onReuse, onRefresh, onDelete, onDeleteMany, onClear, compact=tasks.every(t=>t.kind==='video'),square=false,selectedIds=[],onSelect,latestId }) {
  const [preview, setPreview] = useState(null), [error, setError] = useState('');
  const [cleanup, setCleanup] = useState(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [menuOpen,setMenuOpen]=useState(false),menu=useRef(null),trigger=useRef(null);
  const cleanupChoices=[
    {label:'清除失败',rows:tasks.filter(t=>t.status==='failed')},
    {label:'清除已完成',rows:tasks.filter(t=>t.status==='success')},
    {label:'清除待核对',rows:tasks.filter(t=>t.status==='uncertain')},
    {label:'清空当前界面',rows:tasks,includeActive:true},
  ];
  useEffect(()=>{if(!menuOpen)return;const outside=e=>{if(!menu.current?.contains(e.target))setMenuOpen(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[menuOpen]);

  const closePreview = useCallback(() => setPreview(null), []);
  const askClear = (rows,label='清除这条生成结果',includeActive=false) => { setMenuOpen(false);setPreview(null); setError(''); setNotice(''); setCleanup({rows,label,includeActive}); };
  const confirmClear = async () => {
    if (busy || !cleanup?.rows.length) return;
    setBusy(true); setError('');
    try {
      const result = onDeleteMany?await onDeleteMany(cleanup.rows):onClear?await onClear(cleanup.rows.map(task => task.id),{includeActive:cleanup.includeActive}):await onDelete(cleanup.rows[0]);
      setCleanup(null);
      setNotice(onDeleteMany||onDelete?`已删除 ${result?.removed??cleanup.rows.length} 条。${result?.errors?.join('；')||''}`:`已清理 ${result.removed} 条，释放 ${storageSize(result.bytesFreed)}。${result.warning||''}`);
    } catch (cause) { setError(cause.message || '清理失败，请重试'); }
    finally { setBusy(false); }
  };
  const exportTask = async task => {
    let saved = false;
    const files = task.files?.length ? task.files : [task.filePath];
    for (const [index, filePath] of files.entries()) {
      const label=task.shotLabel||task.promptLabel;
      const result = await api.mediaExportFile({ filePath, url: task.urls?.[index] || task.url, kind: task.kind, ...(label?{filename:label+(files.length>1?`-${index+1}`:'')}:{}) });
      if (!result) break;
      saved = true;
    }
    return saved;
  };
  const download = async task => {
    setError('');
    try { if (await exportTask(task)) setNotice('文件已保存'); }
    catch (cause) { setError(cause.message); }
  };
  return <section className={`generation-results generation-results-refined${compact?' generation-results-compact':''}${square?' generation-results-square':''}`}>
    <header><div><h3>生成结果 <small>{tasks.length}</small></h3></div>
      <div className="generation-result-actions">
        <button className="secondary" disabled={busy} onClick={async () => { setError(''); try { await onRefresh(); } catch (cause) { setError(cause.message); } }}><RefreshCw size={15}/>刷新结果</button>
        {(onClear||onDeleteMany)&&<button className="danger" disabled={busy||!tasks.length} onClick={()=>askClear(tasks,'删除全部生成记录',true)}><Trash2 size={15}/>删除全部</button>}
        {onClear && <div className="generation-cleanup" ref={menu} onKeyDown={e=>{if(e.key==='Escape'){setMenuOpen(false);trigger.current?.focus();}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const buttons=[...menu.current.querySelectorAll('[role="menuitem"]:not(:disabled)')],index=buttons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}}}>
          <button ref={trigger} className="danger" disabled={busy||!tasks.length} aria-haspopup="menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(open=>!open)}><Trash2 size={15}/>清理结果<ChevronDown size={14}/></button>
          {menuOpen&&<div className="generation-cleanup-menu" role="menu" aria-label="清理生成结果">{cleanupChoices.map(choice=><button type="button" role="menuitem" key={choice.label} disabled={!choice.rows.length} className={choice.includeActive?'cleanup-all':''} onClick={()=>askClear(choice.rows,choice.label,choice.includeActive)}><span>{choice.label}</span><b>{choice.rows.length}</b></button>)}</div>}
        </div>}
      </div>
    </header>
    {error && !cleanup && <p className="collab-error" role="alert">{error}</p>}
    {notice && <p className="generation-cleanup-notice" role="status">{notice}</p>}
    <div className="generation-result-grid">{tasks.map(task => <article key={task.id}>
      <header>{onSelect&&task.status==='success'&&<label className="generation-result-select"><input type="checkbox" aria-label={`选择结果 ${task.id}`} checked={selectedIds.includes(task.id)} onChange={()=>onSelect(task)}/>{latestId===task.id?'最新':'选择'}</label>}<span className={`status-${task.status}`}>{resultStatus(task)}</span>{square&&(task.error||task.warning)&&<HoverInfo label="查看任务提示" content={task.error||task.warning}><CircleAlert size={14}/></HoverInfo>}<small>{task.kind === 'video' ? task.duration?`${task.duration} 秒`:'' : '图片'}</small></header>
      {(task.filePath || task.url) ? <button className="generation-result-preview" aria-label="预览生成结果" onClick={() => setPreview(task)}>
        {task.kind === 'image' ? <img loading="lazy" decoding="async" src={mediaSource(task)} alt="生成图片"/> : <video src={mediaSource(task)} preload={square?'metadata':'none'} muted/>}<span>点击预览</span>
      </button> : <div className="generation-result-placeholder"><Film/><span>{resultStatus(task)}</span></div>}
      <p className="generation-result-prompt" title={task.originalPrompt || task.prompt}>{task.originalPrompt || task.prompt}</p>
      {!square&&<><small>{models.find(model => model.id === task.model)?.name || task.model}</small>
      {task.jobId && <small title={task.jobId}>任务 {task.jobId}</small>}
      {task.checkedAt&&<small>最近检测 {new Date(task.checkedAt).toLocaleTimeString('zh-CN',{hour12:false})}{task.status==='success'?' · 视频池下载好':''}</small>}
      {(task.error || task.warning) && <details className="generation-result-error"><summary>{task.status === 'failed' ? '查看失败原因' : '查看任务提示'}</summary><p>{task.error || task.warning}</p></details>}</>}
      <footer><div className="generation-card-actions">
        {task.likeCanvasUrl&&<button className="secondary" aria-label="Like 原画布" title="Like 原画布" onClick={()=>api.openExternal(task.likeCanvasUrl)}>{square?<ExternalLink size={14}/>:'Like 原画布'}</button>}
        {task.libtvCanvasUrl&&<button className="secondary" aria-label="LibTV 原画布" title="LibTV 原画布" onClick={()=>api.openExternal(task.libtvCanvasUrl)}>{square?<ExternalLink size={14}/>:(task.remoteStatus==='awaiting-canvas'?'打开 LibTV 生成':'LibTV 原画布')}</button>}
        {onReuse && <button className="secondary" aria-label="复用" title="复用" onClick={() => onReuse(task)}><Copy size={14}/>{!square&&'复用'}</button>}
        {(task.filePath || task.url) && <button className="secondary" onClick={() => download(task)}><Download size={14}/>下载</button>}
        {(onClear || onDelete || onDeleteMany) && <button className="card-delete" title="清除这条结果" aria-label={`清除结果 ${task.promptLabel || task.shotLabel || task.id}`} disabled={busy} onClick={() => askClear([task],'删除这条生成记录',!clearable(task))}><Trash2 size={15}/></button>}
      </div>{task.costYuan != null && <small>¥{Number(task.costYuan).toFixed(2)}</small>}</footer>
    </article>)}</div>
    {!tasks.length && <div className="generation-empty"><Film/><p>还没有生成结果</p></div>}
    {preview && <MediaPreview key={preview.id} item={preview} onClose={closePreview} onDownload={exportTask}/>}
    <DeleteConfirm open={!!cleanup} title={`${cleanup?.label||'清理结果'}（${cleanup?.rows.length||0} 条）？`}
      detail={onDeleteMany||onDelete?'删除所选生成记录及对应云端视频，不删除分镜提示词，本机已保存文件保留。已提交的生成任务无法在此撤回，后台仍可能继续处理和计费。':`移除所选 ${cleanup?.rows.length||0} 条记录。运行中及待核对任务继续在后台处理；已完成和失败结果清理本地缓存。另存文件与共享素材保留。`}
      confirmLabel="确认删除" busy={busy} error={error} onCancel={() => { if (!busy) { setCleanup(null); setError(''); } }} onConfirm={confirmClear}/>
  </section>;
}
