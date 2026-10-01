import React from 'react';
import { isQuickRunActive } from '../../core/directorQuickGeneration.js';

export function DirectorQuickControls({settings,onSettingsChange}) {
  return <div className="quick-segmentation-settings">
    <label>分段方式<select aria-label="分段方式" value={settings.segmentationMode} onChange={e=>onSettingsChange({...settings,segmentationMode:e.target.value})}>
      <option value="manual">人工分段</option><option value="auto">自动分段</option>
    </select></label>
    <label>最高视频时长<select aria-label="最高视频时长" disabled={settings.segmentationMode!=='auto'} value={settings.maxDurationSeconds} onChange={e=>onSettingsChange({...settings,maxDurationSeconds:Number(e.target.value)})}>
      {Array.from({length:30},(_,i)=>i+1).map(n=><option key={n} value={n}>{n} 秒</option>)}
    </select></label>
  </div>;
}

export function DirectorQuickProgress({run,onStop,onResume,sourceView,onSourceViewChange,stale,error}) {
  const active=isQuickRunActive(run);
  const descriptions={planning:'分析整场与时长','validating-plan':'核对分段计划',generating:`生成提示词 ${run?.currentSegmentIndex||1}/${run?.plan?.segments.length||'…'}`,auditing:'核对衔接与完整性','ready-to-commit':'保存生成结果',completed:'本轮已完成',paused:'已暂停，可继续',failed:'生成中断，草稿已保留','needs-review':'内容需要核对，草稿已保留',stale:'原文或设置已变化，请重新生成'};
  return <div className="quick-auto-progress">
    <div className="quick-source-tabs" aria-label="场景内容视图">
      <button className={sourceView==='source'?'active':''} onClick={()=>onSourceViewChange('source')}>原文</button>
      <button className={sourceView==='plan'?'active':''} disabled={!run?.plan} onClick={()=>onSourceViewChange('plan')}>自动分段稿{run?.plan?` · ${run.plan.segments.length} 段`:''}</button>
    </div>
    {run&&<div className="quick-run-status" role="status"><span>{descriptions[run.phase]||run.phase}</span>{active?<button onClick={onStop}>停止</button>:['paused','failed','needs-review'].includes(run.phase)&&!stale?<button onClick={onResume}>继续未完成部分</button>:null}</div>}
    {run?.plan&&run.phase!=='completed'&&<p>已生成 {Object.values(run.segmentDrafts||{}).filter(d=>d.validated).length}/{run.plan.segments.length} 条，通过逐条核对的结果会立即保存到右侧。</p>}
    {run?.retryMessage&&<p role="status">{run.retryMessage}</p>}
    {!!run?.auditWarnings?.length&&<details className="quick-run-warning"><summary>提示词已保存，仍有 {run.auditWarnings.length} 项衔接提醒</summary>{run.auditWarnings.map((item,i)=><p key={i}>{item.segmentIndex?`第 ${item.segmentIndex} 条：`:''}{item.message}</p>)}</details>}
    {(stale||run?.phase==='stale')&&<p className="quick-run-warning">原文或项目设定已变化，分段稿需要重新生成。</p>}
    {(error||run?.errors?.[0]?.message)&&<p role="alert" className="quick-run-warning">{error||run.errors[0].message}</p>}
    {run?.plan&&sourceView==='plan'&&<div className="quick-plan-timing">{run.plan.segments.map(s=><span key={s.id}>（{s.index}）建议 {s.recommendedDurationSeconds} 秒</span>)}</div>}
    {run&&run.phase!=='completed'&&Object.values(run.segmentDrafts||{}).some(d=>d.prompt?.content)&&<details className="quick-draft-preview"><summary>查看本轮草稿与核对内容</summary>{Object.entries(run.segmentDrafts).map(([id,d])=>d.prompt?.content&&<pre key={id}>{d.prompt.content}</pre>)}</details>}
    {!!run?.previousDrafts?.length&&<details className="quick-draft-preview"><summary>查看更新前保留的草稿</summary>{run.previousDrafts.map((d,i)=><pre key={i}>{d.prompt.content}</pre>)}</details>}
  </div>;
}
