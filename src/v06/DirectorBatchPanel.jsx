import React,{useState} from 'react';
import {isDirectorBatchActive} from '../../core/directorBatchGeneration.js';

export function DirectorBatchPanel({project,skill,profile,maxDurationSeconds,quickGeneration,onJump,disabled}){
 const [preview,setPreview]=useState(null),[policy,setPolicy]=useState('missing-only'),[error,setError]=useState('');
 const batch=quickGeneration?.getProjectBatch(project.id),active=isDirectorBatchActive(batch);
 const invoke=async operation=>{setError('');try{await operation();}catch(e){setError(e.message);}};
 const open=()=>invoke(async()=>setPreview(await quickGeneration.previewBatch({project,skill,profile,maxDurationSeconds,existingPolicy:policy})));
 const start=()=>invoke(async()=>{const plan=preview;setPreview(null);await quickGeneration.startBatch(plan);});
 const status={preview:'待开始',running:'正在生成',pausing:'当前请求保存后暂停',paused:'已暂停，可以继续',completed:'整本任务已完成','completed-with-errors':'本轮已结束，部分场景需处理',cancelled:'任务已结束'};
 const rowStatus={pending:'待处理',running:'处理中',completed:'已保存',skipped:'跳过',stale:'需重新建立任务',failed:'失败，可继续',paused:'已暂停'};
 return <section className="director-batch-panel" aria-label="整本剧本生成">
  <div className="director-batch-heading"><div><strong>整本提示词</strong><small>依次处理每一集、每一场；进度自动保存。</small></div>
   <button className="secondary" disabled={disabled||active||!skill||!profile} onClick={open}>一键生成整本提示词</button>
  </div>
  {preview&&<div className="director-batch-preview">
   <p>{preview.episodeCount} 集 · {preview.targets.length} 场 · 将生成 {preview.targets.filter(t=>t.status==='pending').length} 场 · 跳过 {preview.targets.filter(t=>t.status==='skipped').length} 场</p>
   <p>模型：{preview.modelName} · Skill：{preview.skillName} · 最高 {preview.snapshot.maxDurationSeconds} 秒。各场的提示词条数会在分析后确定。</p>
   <label>已有提示词<select aria-label="整本已有结果处理" value={policy} onChange={e=>{const next=e.target.value;setPolicy(next);invoke(async()=>setPreview(await quickGeneration.previewBatch({project,skill,profile,maxDurationSeconds,existingPolicy:next})));}}><option value="missing-only">跳过已有结果的场景</option><option value="append-all">全部重新生成，保留旧结果</option></select></label>
   <p>开始后会调用所选模型，按接口规则计费。暂停会先保存当前请求；关闭软件后，下次打开点击继续。</p>
   <div className="director-batch-actions"><button className="ghost" onClick={()=>setPreview(null)}>收起</button><button className="primary" disabled={!preview.targets.some(t=>t.status==='pending')} onClick={start}>开始整本生成</button></div>
  </div>}
  {batch&&<div className="director-batch-progress" role="status">
   <div className="director-batch-heading"><span>{status[batch.phase]} · 已保存 {batch.targets.filter(t=>t.status==='completed').length}/{batch.targets.filter(t=>t.status!=='skipped').length} 场{batch.currentSceneLabel?` · 当前场景 ${batch.currentSceneLabel}`:''}</span><div className="director-batch-actions">
    {batch.phase==='running'&&<button className="secondary" onClick={()=>invoke(()=>quickGeneration.pauseBatch(batch.id))}>暂停整本任务</button>}
    {['paused','completed-with-errors'].includes(batch.phase)&&batch.targets.some(t=>['pending','running','paused','failed'].includes(t.status))&&<button className="primary" disabled={disabled} onClick={()=>invoke(()=>quickGeneration.resumeBatch(batch.id))}>继续整本任务</button>}
    {['running','pausing','paused'].includes(batch.phase)&&<button className="ghost" onClick={()=>invoke(()=>quickGeneration.cancelBatch(batch.id))}>结束任务</button>}
   </div></div>
   <small>本批：{batch.modelName} · {batch.skillName} · 最高 {batch.snapshot.maxDurationSeconds} 秒 · 跳过 {batch.targets.filter(t=>t.status==='skipped').length} 场</small>
   <details><summary>查看各场进度和中断记录</summary><div className="director-batch-scenes">{batch.targets.map((target,i)=><div key={i}><button className="ghost" onClick={()=>onJump?.(target.episodeId,target.sceneLabel)}>场景 {target.sceneLabel}</button><span>{rowStatus[target.status]}</span><small>{target.reason}</small></div>)}</div></details>
   {batch.errors?.map((item,i)=><p className="quick-run-warning" key={i}>{item.sceneLabel?`场景 ${item.sceneLabel}：`:''}{item.message}</p>)}
  </div>}
  {(error||quickGeneration?.restoreError)&&<p role="alert" className="quick-run-warning">{error||quickGeneration.restoreError}</p>}
 </section>;
}
