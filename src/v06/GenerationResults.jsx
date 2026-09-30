import React, { useEffect, useState } from 'react';
import { RefreshCw, Download, Copy, Film, Trash2, X } from 'lucide-react';
import models from '../../core/feituo-models.json';
import { mediaSource } from '../../core/generationReferences.js';
import { DeleteConfirm } from './DeleteConfirm.jsx';

const names = { submitting: '提交中', submitted: '排队 / 生成中', downloading: '下载中', success: '已完成', failed: '失败', uncertain: '待核对' };
const clearable = task => ['success', 'failed'].includes(task.status);
function storageSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function GenerationResults({ tasks, api, onReuse, onRefresh, onDelete, onClear }) {
  const [preview, setPreview] = useState(null), [error, setError] = useState('');
  const [cleanup, setCleanup] = useState(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const candidates = tasks.filter(clearable);
  useEffect(() => {
    if (!preview) return;
    const close = event => { if (event.key === 'Escape') setPreview(null); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [preview]);
  const askClear = selected => { setPreview(null); setError(''); setNotice(''); setCleanup(selected); };
  const confirmClear = async () => {
    if (busy || !cleanup?.length) return;
    setBusy(true); setError('');
    try {
      const result = await onClear(cleanup.map(task => task.id));
      setCleanup(null);
      setNotice(`已清除 ${result.removed} 条结果，释放本机空间 ${storageSize(result.bytesFreed)}。${result.warning || (result.filesRetained ? '仍在使用或不属于软件缓存的文件已保留。' : '')}`);
    } catch (cause) { setError(cause.message || '清理失败，请重试'); }
    finally { setBusy(false); }
  };
  const download = async task => {
    setError('');
    try { for (const filePath of task.files?.length ? task.files : [task.filePath]) await api.mediaExportFile({ filePath, url: task.url, kind: task.kind }); }
    catch (cause) { setError(cause.message); }
  };
  return <section className="generation-results generation-results-refined">
    <header><div><h3>生成结果 <small>{tasks.length}</small></h3><p>预览、下载与管理已生成的作品</p></div>
      <div className="generation-result-actions">
        <button className="secondary" disabled={busy} onClick={async () => { setError(''); try { await onRefresh(); } catch (cause) { setError(cause.message); } }}><RefreshCw size={15}/>刷新结果</button>
        {onClear && <button className="danger" disabled={busy || !candidates.length} onClick={() => askClear(candidates)}><Trash2 size={15}/>清除全部结果</button>}
      </div>
    </header>
    {onClear && <p className="generation-storage-note">清理可释放本机空间；另存的下载文件和云端协作素材保留。运行中及待核对的任务不参与清理。</p>}
    {error && !cleanup && <p className="collab-error" role="alert">{error}</p>}
    {notice && <p className="generation-cleanup-notice" role="status">{notice}</p>}
    <div className="generation-result-grid">{tasks.map(task => <article key={task.id}>
      <header><span className={`status-${task.status}`}>{names[task.status] || task.status}</span><small>{task.kind === 'video' ? `${task.duration || ''} 秒` : '图片'}</small></header>
      {(task.filePath || task.url) ? <button className="generation-result-preview" aria-label="预览生成结果" onClick={() => setPreview(task)}>
        {task.kind === 'image' ? <img loading="lazy" decoding="async" src={mediaSource(task)} alt="生成图片"/> : <video src={mediaSource(task)} preload="none" muted/>}<span>点击预览</span>
      </button> : <div className="generation-result-placeholder"><Film/><span>{names[task.status]}</span></div>}
      <p className="generation-result-prompt" title={task.originalPrompt || task.prompt}>{task.originalPrompt || task.prompt}</p>
      <small>{models.find(model => model.id === task.model)?.name || task.model}</small>
      {task.jobId && <small title={task.jobId}>任务 {task.jobId}</small>}
      {(task.error || task.warning) && <details className="generation-result-error"><summary>{task.status === 'failed' ? '查看失败原因' : '查看任务提示'}</summary><p>{task.error || task.warning}</p></details>}
      <footer><div className="generation-card-actions">
        {onReuse && <button className="secondary" onClick={() => onReuse(task)}><Copy size={14}/>复用</button>}
        {(task.filePath || task.url) && <button className="secondary" onClick={() => download(task)}><Download size={14}/>下载</button>}
        {(onClear && clearable(task) || onDelete && task.status === 'success') && <button className="card-delete" title="清除这条结果" aria-label={`清除结果 ${task.promptLabel || task.shotLabel || task.id}`} disabled={busy} onClick={() => onClear ? askClear([task]) : onDelete(task)}><Trash2 size={15}/></button>}
      </div>{task.costYuan != null && <small>¥{Number(task.costYuan).toFixed(2)}</small>}</footer>
    </article>)}</div>
    {!tasks.length && <div className="generation-empty"><Film/><p>还没有生成结果</p><small>生成作品后，可在这里预览、下载或复用</small></div>}
    {preview && <div className="generation-preview-overlay" role="dialog" aria-modal="true" aria-label="作品预览"><button aria-label="关闭预览" onClick={() => setPreview(null)}><X/></button>{preview.kind === 'image' ? <img src={mediaSource(preview)} alt="生成结果大图"/> : <video src={mediaSource(preview)} controls autoPlay/>}</div>}
    <DeleteConfirm open={!!cleanup} title={cleanup?.length === 1 ? '清除这条生成结果？' : '清除全部生成结果？'}
      detail={`将清除当前列表中选定的 ${cleanup?.length || 0} 条已完成或失败的结果及其本地副本，清除后无法在这里恢复。另存到其他文件夹的下载、云端协作素材和仍被使用的文件会保留。运行中和待核对的任务会保留。`}
      confirmLabel="确认清除" busy={busy} error={error} onCancel={() => { if (!busy) { setCleanup(null); setError(''); } }} onConfirm={confirmClear}/>
  </section>;
}
