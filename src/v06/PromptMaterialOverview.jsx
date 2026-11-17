import React,{useState} from 'react';
import {ChevronRight,Info} from 'lucide-react';
import './prompt-material-overview.css';

export default function PromptMaterialOverview({overview,selectedSceneId,onOpen,loaded,error}){
 const [filter,setFilter]=useState('issues'),[episode,setEpisode]=useState('all');
 const {rows,scenes,total,associated,published,ready,failed,processing}=overview;
 const matches=row=>filter==='all'||filter==='issues'&&row.needsAttention||filter==='unlinked'&&!row.associated||filter==='processing'&&row.processing||filter==='failed'&&['failed','interrupted'].includes(row.status)||filter==='media'&&row.status==='media'||filter==='unpublished'&&row.associated&&!row.published||filter==='ready'&&row.ready;
 const visible=scenes.filter(s=>episode==='all'||s.episode===Number(episode)).map(s=>({...s,visible:s.rows.filter(matches)})).filter(s=>s.visible.length);
 const active=rows.filter(r=>r.processing&&r.status!=='queued'),next=rows.filter(r=>r.status==='queued').sort((a,b)=>(a.task?.queuePosition||Infinity)-(b.task?.queuePosition||Infinity))[0];
 return <section className="prompt-material-overview" aria-label="全剧提示词素材总览" aria-busy={!loaded}>
  <header><h2>提示词素材 <small>{total} 条</small></h2><details className="material-help"><summary aria-label="保存、发布与素材就绪的区别"><Info size={16}/></summary><div role="note">关联结果自动保存；“无需参考图”只豁免所选缺项。清单发布不等于逐条素材就绪；图片与音色采用后才可作为分镜参考。</div></details><span role="status">{!loaded?'正在读取关联状态':processing?`${processing} 条处理中`:failed?`${failed} 条需重试`:'当前保存结果'}</span></header>
  <div className="material-metrics">
   <button onClick={()=>setFilter('unlinked')}><span>已关联</span><b>{associated}<small>/{total}</small></b><span>{total-associated} 条待完成</span></button>
   <button onClick={()=>setFilter('unpublished')}><span>已发布提示词</span><b>{published}<small>/{total}</small></b><span>{Math.max(0,associated-published)} 条关联后待发布</span></button>
   <button onClick={()=>setFilter('ready')}><span>分镜就绪</span><b>{ready}<small>/{total}</small></b><span>关联、发布、素材均完成</span></button>
   <button className={failed?'has-error':''} onClick={()=>setFilter('failed')}><span>失败 / 中断</span><b>{failed}</b><span>定位后恢复未完成项</span></button>
  </div>
  {(active.length>0||next)&&<div className="material-live" role="status"><span>{active.length?active.slice(0,6).map(r=>`${r.entry.label} ${r.label}`).join(' · '):'等待已启动任务完成准备'}{next?` · 接下来 ${next.entry.label}`:''}</span><details className="material-help"><summary aria-label="关联队列顺序说明"><Info size={15}/></summary><div>当前场景优先，等待越久优先级越高；已发出的请求不会被打断。排序会随场景切换更新。</div></details></div>}
  {error&&<p className="material-error" role="alert">{error}</p>}
  <div className="material-filters"><div role="group" aria-label="筛选提示词状态">{[['issues','未就绪'],['all','全部'],['unlinked','待关联'],['processing','处理中'],['media','素材待就绪'],['unpublished','待发布'],['ready','已就绪']].map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div><select aria-label="总览分集" value={episode} onChange={e=>setEpisode(e.target.value)}><option value="all">全剧</option>{[...new Set(rows.map(r=>r.entry.episode))].map(n=><option key={n} value={n}>第 {n} 集</option>)}</select></div>
  <div className="material-scene-list">{visible.map(s=><details className="material-scene" key={`${filter}:${episode}:${s.id}`} open={s.id===selectedSceneId||visible.length===1}>
   <summary><b>场景 {s.id}</b><span>关联 {s.associated}/{s.total}</span><span>发布 {s.published}/{s.total}</span><span className={s.ready===s.total?'is-ready':''}>就绪 {s.ready}/{s.total}</span>{s.failed>0&&<em>{s.failed} 条失败</em>}</summary>
   <div className="material-prompt-list">{s.visible.map(row=><button type="button" key={row.entry.id} className={`material-prompt-row state-${row.status}`} onClick={()=>onOpen(row.entry)} aria-label={`查看提示词 ${row.entry.label}，${row.label}`}>
    <b>{row.entry.label}</b><span className="material-state">{row.label}</span><span className="material-counts">{row.noReference?'已确认无需参考素材':`人物 ${row.counts.character} · 场景 ${row.counts.scene} · 道具 ${row.counts.prop} · 音色 ${row.counts.voice}`}</span><span className="material-reason">{row.issues[0]||(!row.published?'核实并发布后同步到分镜':row.ready?'已保存，可进入分镜':'')}</span><ChevronRight size={16}/>
   </button>)}</div>
  </details>)}{loaded&&!visible.length&&<p className="material-empty">{total?'当前筛选没有提示词':'当前版本暂无提示词'}</p>}</div>
 </section>;
}
