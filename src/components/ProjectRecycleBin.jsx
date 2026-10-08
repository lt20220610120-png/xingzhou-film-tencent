import React,{useEffect,useState} from 'react';
import {Trash2,RotateCcw,Clock,Search} from 'lucide-react';
import {DeleteConfirm} from '../v06/DeleteConfirm.jsx';
import {recycleState,recycleExpiry,restoreRecycledProject,purgeRecycledProjects,setRecyclePolicy,cleanupRecycle,RECYCLE_LABELS} from '../../core/projectRecycle.js';
import './project-recycle.css';

const when=value=>{const t=typeof value==='number'?value:Date.parse(value);return Number.isFinite(t)?new Date(t).toLocaleString('zh-CN',{hour12:false}):'时间不明，暂不自动清理';};
const location=item=>item.kind==='script'?(item.project?.creator?.mode==='rewrite'||item.project?.mode==='rewrite'?'洗稿':item.project?.creator?.mode==='framework'?'原创 · 框架式创作':'原创'):item.kind==='fruit'?(item.project?.creator?.mode==='ip'?'IP 库':'果子库'):RECYCLE_LABELS[item.kind]||'未知位置';
const actions={trashed:'移入回收站',restored:'恢复项目',purged:'手动永久清理',expired:'到期自动清理',policy:'修改清理规则'};
export function ProjectRecycleBin({state,setState,saveStatus,onNavigate}){
 const bin=recycleState(state),[query,setQuery]=useState(''),[kind,setKind]=useState('all'),[automatic,setAutomatic]=useState(bin.policy.automatic),[days,setDays]=useState(bin.policy.retentionDays),[confirm,setConfirm]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{setAutomatic(bin.policy.automatic);setDays(bin.policy.retentionDays);},[bin.policy.automatic,bin.policy.retentionDays]);
 const attempt=fn=>{setError('');try{fn();}catch(e){setError(e.message);}};
 const restore=item=>attempt(()=>{setState(s=>restoreRecycledProject(s,item.id));setNotice(`“${item.name}”已恢复到${location(item)}，原正文、版本和项目编号保留。`);});
 const applyPolicy=()=>attempt(()=>{
  const policy={automatic,retentionDays:Number(days)};const next=setRecyclePolicy(state,policy),expiry=next.projectRecycle.items.filter(i=>{const t=recycleExpiry(i,policy);return t!==null&&t<=Date.now();});
  if(expiry.length){setConfirm({type:'policy',policy,count:expiry.length});return;}
  setState(s=>setRecyclePolicy(s,policy));setNotice('清理规则已更新。');
 });
 const confirmAction=()=>attempt(()=>{const action=confirm;setState(s=>action.type==='policy'?cleanupRecycle(setRecyclePolicy(s,action.policy)):purgeRecycledProjects(s,action.ids));setConfirm(null);setNotice(action.type==='policy'?'规则已更新，符合新规则的到期项目已清理。':'选中的回收站项目已永久清理，操作记录保留。');});
 const items=bin.items.filter(i=>(kind==='all'||i.kind===kind)&&`${i.name} ${location(i)}`.toLowerCase().includes(query.toLowerCase())).slice().sort((a,b)=>(Date.parse(b.deletedAt)||0)-(Date.parse(a.deletedAt)||0));
 return <main className="project-recycle-page"><header className="recycle-header"><div><span className="eyebrow">共用工具 · 本地资料</span><h1><Trash2 size={27}/>项目回收站</h1><p>误删的项目可以恢复，完整正文、素材和版本一起保留。</p></div><button className="secondary danger" disabled={!bin.items.length} onClick={()=>setConfirm({type:'clear',ids:bin.items.map(i=>i.id),count:bin.items.length})}>清空回收站</button></header>
 {error&&<p role="alert" className="recycle-error">{error}</p>}{notice&&<p role="status" className="recycle-notice">{notice}</p>}
 <section className="recycle-policy"><div><h2><Clock size={19}/>定期清理</h2><p>{bin.policy.automatic?`每个项目放入回收站满 ${bin.policy.retentionDays} 天后清理`:'已关闭自动清理，项目保留至手动清理'}。软件打开时和运行期间每小时检查。</p><small>清理释放项目快照，保留操作记录；你的导出文件和云端资源不受影响。</small></div><div className="recycle-policy-form"><label><input type="checkbox" aria-label="启用回收站自动清理" checked={automatic} onChange={e=>setAutomatic(e.target.checked)}/>自动清理</label><label>保留天数<input aria-label="回收站保留天数" type="number" min="1" max="365" disabled={!automatic} value={days} onChange={e=>setDays(e.target.value)}/></label><button className="primary" onClick={applyPolicy}>保存清理规则</button></div></section>
 <div className="recycle-filter"><label><Search size={16}/><input aria-label="搜索回收站项目" placeholder="搜索项目名称或原位置" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="回收站项目类型" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">全部类型</option>{Object.entries(RECYCLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><span>{bin.items.length} 个可恢复项目</span><small className={saveStatus?.error?'recycle-save-error':''}>{saveStatus?.error?`本地保存失败：${saveStatus.error}`:saveStatus?.saved?'已保存到本地':'正在保存本地资料…'}</small></div>
 <div className="recycle-grid">{items.map(item=><article className="recycle-item" key={item.id}><header><small>{location(item)}</small><h3 title={item.name}>{item.name||'未命名项目'}</h3></header><dl><dt>删除时间</dt><dd>{when(item.deletedAt)}</dd><dt>预计清理</dt><dd>{bin.policy.automatic?when(recycleExpiry(item,bin.policy)):'仅手动清理'}</dd><dt>保留内容</dt><dd>{item.project?.episodes?.length??item.project?.versions?.length??0} {item.kind==='library'?'个版本':'集'} · 完整项目快照</dd></dl><footer><button className="primary" onClick={()=>restore(item)}><RotateCcw size={15}/>恢复项目</button><button className="secondary danger" onClick={()=>setConfirm({type:'one',ids:[item.id],name:item.name,count:1})}>永久删除</button></footer></article>)}</div>
 {!items.length&&<div className="recycle-empty"><Trash2 size={32}/><h3>{bin.items.length?'没有匹配的项目':'回收站为空'}</h3><p>以后删除本地项目会先出现在这里，可在清理前恢复。</p></div>}
 <details className="recycle-audit"><summary>操作记录 · 最近 {bin.audit.length} 条</summary><p>记录移入、恢复、手动清理及到期清理，方便核对项目去向。</p>{bin.audit.slice().reverse().map(r=><div key={r.id}><time>{when(r.time)}</time><span>{actions[r.action]||r.action}</span><b>{r.name}</b>{r.action==='policy'&&<small>{r.policy?.automatic?`${r.policy.retentionDays} 天`:'仅手动清理'}</small>}</div>)}{!bin.audit.length&&<p>暂无操作记录。</p>}</details>
 {onNavigate&&<button className="secondary" onClick={()=>onNavigate('settings')}>打开资料与软件设置</button>}
 <DeleteConfirm open={!!confirm} title={confirm?.type==='policy'?'修改规则并清理到期项目':confirm?.type==='one'?'永久删除回收站项目':'永久清空回收站'} name={confirm?.name} detail={confirm?.type==='policy'?`新规则会立即清理已放入满 ${confirm.policy.retentionDays} 天的项目，目前有 ${confirm.count} 个。清理后无法从回收站恢复，是否继续？`:`将永久清理这 ${confirm?.count||0} 个回收站项目，无法再从回收站恢复。现有创作项目保留。`} confirmLabel={confirm?.type==='policy'?'应用规则并清理':'确认永久清理'} onCancel={()=>setConfirm(null)} onConfirm={confirmAction} error={error}/>
 </main>;
}
