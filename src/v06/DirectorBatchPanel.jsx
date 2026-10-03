import React,{useState} from 'react';
import {isDirectorBatchActive} from '../../core/directorBatchGeneration.js';
import {useRememberedState} from '../useRememberedState.js';
import {normalizeDirectorDurationSelection} from '../../core/directorDurationPolicy.js';

export function DirectorBatchPanel({project,accountId,skill,profile,maxDurationSeconds,quickGeneration,onJump,disabled}){
 const [preview,setPreview]=useState(null),[policy,setPolicy]=useState('missing-only'),[error,setError]=useState('');
 const [settingsJson,setSettingsJson]=useRememberedState(`xz-director-batch-settings:${accountId||'local'}:${project.id}`,JSON.stringify({maxDurationSeconds:normalizeDirectorDurationSelection(maxDurationSeconds),concurrency:'all'}));
 let settings;try{settings=JSON.parse(settingsJson);}catch{settings={};}
 const batchDuration=normalizeDirectorDurationSelection(settings.maxDurationSeconds);
 const durationLabel=value=>value===0?'自动估算（单条最高35秒）':`最高 ${value} 秒`;
 const concurrency=settings.concurrency==='all'||Number.isInteger(settings.concurrency)&&settings.concurrency>0?settings.concurrency:'all';
 const concurrencyLabel=value=>value==='all'?'全部场景并发':`${value} 场并发`;
 const batch=quickGeneration?.getProjectBatch(project.id),active=isDirectorBatchActive(batch);
 const invoke=async operation=>{setError('');try{await operation();}catch(e){setError(e.message);}};
 const makePreview=(updates={})=>quickGeneration.previewBatch({project,skill,profile,maxDurationSeconds:batchDuration,concurrency,existingPolicy:policy,...updates});
 const changeSettings=updates=>{setSettingsJson(JSON.stringify({maxDurationSeconds:batchDuration,concurrency,...updates}));setPreview(null);};
 const open=()=>invoke(async()=>setPreview(await makePreview()));
 const start=()=>invoke(async()=>{const plan=preview;setPreview(null);await quickGeneration.startBatch(plan);});
 const status={preview:'待开始',running:'正在生成',pausing:'正在保存并发请求，完成后暂停',paused:'已暂停，可以继续',completed:'整本任务已完成','completed-with-errors':'本轮已结束，部分场景需处理',cancelled:'任务已结束'};
 const rowStatus={pending:'待处理',running:'处理中',completed:'已保存',skipped:'跳过',stale:'需重新建立任务',failed:'失败，可继续',paused:'已暂停'};
 return <section className="director-batch-panel" aria-label="整本剧本生成">
  <div className="director-batch-heading"><div className="director-batch-purpose"><strong>整本提示词</strong><small>按场景并发生成，进度自动保存，中断后可继续。</small></div>
   <div className="director-batch-settings">
    <label><span>最高视频时长</span><select aria-label="整本最高视频时长" value={batchDuration} disabled={active||disabled} onChange={e=>changeSettings({maxDurationSeconds:Number(e.target.value)})}>{Array.from({length:36},(_,i)=>i).map(n=><option key={n} value={n}>{n===0?'0 · 自动估算（最高35秒）':`${n} 秒`}</option>)}</select></label>
    <label><span>场景并发</span><select aria-label="整本场景并发" value={concurrency} disabled={active||disabled} onChange={e=>changeSettings({concurrency:e.target.value==='all'?'all':Number(e.target.value)})}><option value="all">全部场景</option>{[2,4,8,16,32].map(n=><option key={n} value={n}>{n} 场</option>)}</select></label>
   <button className="secondary" disabled={disabled||active||!skill||!profile} onClick={open}>一键生成整本提示词</button>
   </div>
  </div>
  {preview&&<div className="director-batch-preview">
   <p>{preview.episodeCount} 集 · {preview.targets.length} 场 · 将生成 {preview.targets.filter(t=>t.status==='pending').length} 场 · 跳过 {preview.targets.filter(t=>t.status==='skipped').length} 场</p>
   <p>模型：{preview.modelName} · Skill：{preview.skillName} · {durationLabel(preview.snapshot.maxDurationSeconds)} · {concurrencyLabel(preview.concurrency??'all')}。各场的提示词条数会在分析后确定。</p>
   <label>已有提示词<select aria-label="整本已有结果处理" value={policy} onChange={e=>{const next=e.target.value;setPolicy(next);invoke(async()=>setPreview(await makePreview({existingPolicy:next})));}}><option value="missing-only">跳过已有结果的场景</option><option value="append-all">全部重新生成，保留旧结果</option></select></label>
   <p>开始后各场会并发调用所选模型，按接口规则计费。暂停会先保存所有正在处理的请求；关闭软件后，下次打开点击继续。</p>
   <div className="director-batch-actions"><button className="ghost" onClick={()=>setPreview(null)}>收起</button><button className="primary" disabled={!preview.targets.some(t=>t.status==='pending')} onClick={start}>开始整本生成</button></div>
  </div>}
  {batch&&<div className="director-batch-progress" role="status">
   <div className="director-batch-heading"><span>{status[batch.phase]} · 已保存 {batch.targets.filter(t=>t.status==='completed').length}/{batch.targets.filter(t=>t.status!=='skipped').length} 场{batch.activeSceneCount?` · 同时生成 ${batch.activeSceneCount} 场`:''}</span><div className="director-batch-actions">
    {batch.phase==='running'&&<button className="secondary" onClick={()=>invoke(()=>quickGeneration.pauseBatch(batch.id))}>暂停整本任务</button>}
    {['paused','completed-with-errors'].includes(batch.phase)&&batch.targets.some(t=>['pending','running','paused','failed'].includes(t.status))&&<button className="primary" disabled={disabled} onClick={()=>invoke(()=>quickGeneration.resumeBatch(batch.id))}>继续整本任务</button>}
    {['running','pausing','paused'].includes(batch.phase)&&<button className="ghost" onClick={()=>invoke(()=>quickGeneration.cancelBatch(batch.id))}>结束任务</button>}
   </div></div>
   <small>本批：{batch.modelName} · {batch.skillName} · {durationLabel(batch.snapshot.maxDurationSeconds)} · {concurrencyLabel(batch.concurrency??1)} · 跳过 {batch.targets.filter(t=>t.status==='skipped').length} 场</small>
   <details><summary>查看各场进度和中断记录</summary><div className="director-batch-scenes">{batch.targets.map((target,i)=><div key={i}><button className="ghost" onClick={()=>onJump?.(target.episodeId,target.sceneLabel)}>场景 {target.sceneLabel}</button><span>{rowStatus[target.status]}</span><small>{target.reason}</small></div>)}</div></details>
   {batch.errors?.map((item,i)=><p className="quick-run-warning" key={i}>{item.sceneLabel?`场景 ${item.sceneLabel}：`:''}{item.message}</p>)}
    {batch.errorHistory?.length>0&&<details><summary>查看此前中断记录（{batch.errorHistory.length} 条）</summary>{batch.errorHistory.map((item,i)=><p key={i}><small>{item.sceneLabel?`场景 ${item.sceneLabel}：`:''}{item.message}</small></p>)}</details>}
  </div>}
  {(error||quickGeneration?.restoreError)&&<p role="alert" className="quick-run-warning">{error||quickGeneration.restoreError}</p>}
 </section>;
}
