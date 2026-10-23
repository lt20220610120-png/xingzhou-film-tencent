import React,{useState,useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {HardDrive,RefreshCw,Trash2,X} from 'lucide-react';

const bytes=value=>value<1024*1024?`${Math.round(value/1024)} KB`:`${(value/1024/1024).toFixed(1)} MB`;
const when=value=>new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const states={active:'任务使用中',legacy:'旧版副本 · 到期清理',unused:'可清理',expired:'已到期'};
export function TemporaryReferenceManager({api,className=''}){
 const [open,setOpen]=useState(false),[data,setData]=useState(null),[selected,setSelected]=useState(new Set()),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const panel=useRef(null),trigger=useRef(null),inFlight=useRef(false);
 const load=async()=>{if(typeof api?.generationReferenceList!=='function')throw Error('请升级客户端后使用临时素材管理');const result=await api.generationReferenceList();setData(result);setSelected(new Set());return result;};
 const refresh=async()=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{await load();}catch(e){setError(e.message);}finally{inFlight.current=false;setBusy(false);}};
 useEffect(()=>{if(!open)return;void refresh();panel.current?.focus();const listener=e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false);}if(e.key==='Tab'){const items=[...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')];if(!items.length)return;const first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener('keydown',listener);return()=>{document.removeEventListener('keydown',listener);trigger.current?.focus();};},[open]);
 const clean=async mode=>{
  if(inFlight.current)return;const rows=(data?.items||[]).filter(r=>r.canDelete&&(mode==='expired'?r.state==='expired':mode==='unused'||selected.has(r.id)));
  if(!rows.length)return;
  if(!window.confirm(`清理 ${rows.length} 个云端临时副本（${bytes(rows.reduce((s,r)=>s+r.size,0))}）？\n只清理已到期或任务已结束的副本，本机原文件、项目图片和生成结果保留。`))return;
  inFlight.current=true;setBusy(true);setError('');setNotice('');
  try{const result=await api.generationReferenceCleanup({ids:rows.map(r=>r.id)});await load();setNotice(`已清理 ${result.removed} 项，释放 ${bytes(result.bytesFreed)}${result.skipped?`；${result.skipped} 项已被任务使用，已保留`:''}。${result.failed?.length?'未完成：'+result.failed.map(r=>r.name+'（'+r.message+'）').join('、'):''}`);}catch(e){setError(e.message);}finally{inFlight.current=false;setBusy(false);}
 };
 const items=data?.items||[],available=items.filter(r=>r.canDelete),expired=available.filter(r=>r.state==='expired');
 return <><button ref={trigger} className={`temporary-reference-trigger ${className}`} type="button" onClick={()=>{setNotice('');setError('');setOpen(true);}}><HardDrive size={16}/>管理临时素材</button>{open&&createPortal(<div className="temporary-reference-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}><section className="temporary-reference-dialog" role="dialog" aria-modal="true" aria-labelledby="temporary-reference-title" tabIndex={-1} ref={panel}>
  <header><div><h2 id="temporary-reference-title">云端临时素材</h2><p>视频生成时上传的参考副本；与本机资料、项目资产和生成结果分开管理。</p></div><button aria-label="关闭临时素材管理" onClick={()=>setOpen(false)}><X size={20}/></button></header>
  {data&&<div className="temporary-reference-usage"><strong>{data.count} / {data.limits.count} 个</strong><span>{bytes(data.bytes)} / {bytes(data.limits.bytes)}</span><span>可清理 {available.length} 项</span></div>}
  <p className="temporary-reference-note">相同文件会复用有效副本。使用中的素材自动保护，任务结束后可提前清理。旧版副本无法确认任务状态，将保留至 48 小时到期；下一次生成会重新上传已清理的副本。</p>
  <div className="temporary-reference-actions"><button disabled={busy} onClick={refresh}><RefreshCw size={14}/>{busy?'处理中…':'刷新用量'}</button><button disabled={busy||!expired.length} onClick={()=>clean('expired')}>清理已到期（{expired.length}）</button><button disabled={busy||!available.length} onClick={()=>clean('unused')}>清理全部可清理项（{available.length}）</button><button disabled={busy||!selected.size} onClick={()=>clean('selected')}><Trash2 size={14}/>清理所选（{selected.size}）</button></div>
  {error&&<p role="alert" className="temporary-reference-error">{error}</p>}{notice&&<p role="status" className="temporary-reference-result">{notice}</p>}
  <div className="temporary-reference-list" role="region" aria-label="临时素材列表" tabIndex={0}>{items.map(row=><label key={row.id} className="temporary-reference-row"><input type="checkbox" aria-label={`选择${row.name}`} disabled={busy||!row.canDelete} checked={selected.has(row.id)} onChange={e=>setSelected(old=>{const next=new Set(old);e.target.checked?next.add(row.id):next.delete(row.id);return next;})}/><span className="temporary-reference-name"><b title={row.name}>{row.name}</b><small>{({image:'图片',audio:'音频',video:'视频'})[row.kind]||'素材'} · {bytes(row.size)} · {when(row.expiresAt)} 到期</small></span><span className={`temporary-reference-state ${row.canDelete?'available':''}`}>{states[row.state]||'保留'}</span></label>)}{!items.length&&!busy&&<p>当前没有云端临时副本。</p>}</div>
 </section></div>,document.body)}</>;
}
