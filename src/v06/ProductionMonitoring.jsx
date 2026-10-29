import React,{useState} from 'react';
import {RefreshCw,ScanLine} from 'lucide-react';
import './ProductionMonitoring.css';
export function ProductionMonitoring({run,production}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const info=run.monitor,art=info?.art,s=art?.summary,p=info?.prompts;
 const refresh=async()=>{setBusy(true);setError('');try{await production.refresh(run.id);}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <section className="production-monitor" aria-label="成果监测与接续">
  <header><div><ScanLine size={18}/><b>成果监测</b><small>{info?.checkedAt?`${new Date(info.checkedAt).toLocaleTimeString('zh-CN',{hour12:false})} 批量核实`:'开始后批量读取已有成果'}</small></div><button type="button" disabled={busy||run.status==='running'} onClick={refresh}><RefreshCw size={14}/>{busy?'读取中…':'刷新成果'}</button></header>
  {s&&<><div className="production-monitor-counts"><div><span>提示词覆盖</span><b>{p?.complete??'—'} / {p?.scenes??'—'} 场</b><small>{p?.count??s.prompts} 条提示词</small></div><div><span>已发布清单</span><b>{s.published} / {s.scenes} 场</b><small>{s.associated} 场已有提示词关联</small></div><div><span>已有美术图片</span><b>{s.images} / {s.assets} 卡片</b><small>保留已有图片，只补缺项</small></div></div>
   <details><summary>{s.complete} 场直接复用 · {art.pendingScenes.length} 场待接续 · 查看依据与缺项</summary><div className="production-monitor-rows">{art.episodes.map(e=><div key={e.number}><b>第 {e.number} 集</b><span>{e.changed?'正文已变更，保留原成果':e.complete?'成果已就绪，跳过重复操作':!e.inventory?'缺清单':`${e.scenes.filter(v=>v.complete).length}/${e.scenes.length} 场完成`}</span>{e.scenes.map(scene=><p key={scene.id}><strong>{scene.id}</strong> · {scene.published?'已发布':'未发布'} · 关联 {scene.bound}/{scene.prompts} 条{scene.complete?' · 直接复用':''}{scene.reasons.length>0&&<small>{scene.reasons.join('；')}</small>}</p>)}</div>)}</div></details></>}
  <>{info?.files&&<details><summary>原片验收通过 {info.files.checked} 条 · {info.files.issues.length} 项文件问题</summary>{info.files.issues.map((text,i)=><p key={i}>{text}</p>)}</details>}</><small className="production-monitor-help">按来源、清单签名、关联和任务凭据检测；刷新不调用生成模型。不同集可同步生成、超分和剪辑，Topaz 与剪辑各自逐集排队。</small>{error&&<p role="alert">{error}</p>}
 </section>;
}
