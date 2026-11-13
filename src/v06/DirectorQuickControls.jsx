import {FormattedText} from '../components/FormattedText.jsx';
import React, { useEffect, useMemo, useRef } from 'react';
import { isQuickRunActive } from '../../core/directorQuickGeneration.js';
import { DEFAULT_DIRECTOR_PACE, MIN_DIRECTOR_PACE, effectiveDirectorDurationLimit, normalizeDirectorPace, resolveDirectorPaceProfile } from '../../core/directorDurationPolicy.js';
import { buildSceneSourceTape } from '../../core/directorSegmentation.js';
import { buildEditorialSceneFacts, createSceneDurationBudget } from '../../core/directorSceneBudget.js';

export function DirectorPaceRail({ value = DEFAULT_DIRECTOR_PACE, onChange, disabled = false, ariaLabel = '短剧节奏梯度' }) {
  const wrapRef = useRef(null);
  const current = useRef({ value: normalizeDirectorPace(value), onChange, disabled });
  current.current = { value: normalizeDirectorPace(value), onChange, disabled };
  const profile = resolveDirectorPaceProfile(value);
  const position = (profile.pace - MIN_DIRECTOR_PACE) / (DEFAULT_DIRECTOR_PACE - MIN_DIRECTOR_PACE) * 100;

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const onWheel = event => {
      if (current.current.disabled) return;
      const rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY;
      if (!rawDelta) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 5;
      const next = normalizeDirectorPace(current.current.value + (rawDelta > 0 ? step : -step));
      if (next !== current.current.value) current.current.onChange?.(next);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div ref={wrapRef} className={`director-pace-rail${disabled ? ' is-disabled' : ''}`} data-tier={profile.tier} title={`短剧节奏：${profile.tierLabel}（鼠标滚轮或拖动微调）`}>
      <span className="director-pace-caption">节奏</span>
      <div className="director-pace-box">
        <span className={`director-pace-pole${profile.tier === 'extra-compact' ? ' active' : ''}`}>极紧凑</span>
        <div className="director-pace-track-wrap" style={{ '--pace-pct': `${position}%` }}>
          <input
            type="range"
            min={MIN_DIRECTOR_PACE}
            max={DEFAULT_DIRECTOR_PACE}
            step="1"
            aria-label={ariaLabel}
            aria-valuetext={`${profile.tierLabel}（滑轨 ${Math.round(position)}%）`}
            disabled={disabled}
            value={profile.pace}
            onChange={e => onChange?.(normalizeDirectorPace(e.target.value))}
          />
          <span className="director-pace-ticks" aria-hidden="true"><i /><i /><i /></span>
        </div>
        <span className={`director-pace-pole${profile.tier === 'normal' ? ' active' : ''}`}>正常</span>
      </div>
    </div>
  );
}

export function DirectorQuickControls({settings,onSettingsChange,disabled=false}) {
  const isAuto = settings.segmentationMode === 'auto';
  return <div className="quick-segmentation-settings">
    <label>分段方式<select aria-label="分段方式" disabled={disabled} value={settings.segmentationMode} onChange={e=>onSettingsChange({...settings,segmentationMode:e.target.value})}>
      <option value="manual">人工分段</option><option value="auto">自动分段</option>
    </select></label>
    <label>最高时长<select aria-label="最高视频时长" disabled={!isAuto||disabled} value={settings.maxDurationSeconds} onChange={e=>onSettingsChange({...settings,maxDurationSeconds:Number(e.target.value)})}>
      {Array.from({length:36},(_,i)=>i).map(n=><option key={n} value={n}>{n===0?'0 · 自动（≤35秒）':`${n} 秒`}</option>)}
    </select></label>
    {isAuto&&<DirectorPaceRail disabled={disabled} value={settings.pace ?? DEFAULT_DIRECTOR_PACE} onChange={pace=>onSettingsChange({...settings,pace})}/>}
  </div>;
}

export function DirectorQuickProgress({run,sceneText='',maxDurationSeconds=30,pace=DEFAULT_DIRECTOR_PACE,onStop,onResume,sourceView,onSourceViewChange,stale,error}) {
  const active=isQuickRunActive(run);
  const descriptions={planning:'分析整场与时长','validating-plan':'核对分段计划',generating:'整场导演预演与提示词生成',auditing:'核对衔接与完整性','ready-to-commit':'保存生成结果',completed:'本轮已完成',paused:'已暂停，可继续',failed:'生成中断，草稿已保留','needs-review':'内容需要核对，草稿已保留',stale:'原文或设置已变化，请重新生成'};
  const liveEstimate = useMemo(() => {
    const trimmed = String(sceneText || '').trim();
    if (!trimmed) return null;
    try {
      const tape = buildSceneSourceTape(trimmed);
      if (!tape.sourceText.trim()) return null;
      const facts = buildEditorialSceneFacts(tape, { pace });
      const budget = createSceneDurationBudget({ facts, maxDurationSeconds, pace });
      return { seconds: Math.max(1, Math.round(budget.totalEstimatedSeconds)), count: budget.targetCount, tierLabel: budget.paceLabel, limit: effectiveDirectorDurationLimit(maxDurationSeconds) };
    } catch { return null; }
  }, [sceneText, maxDurationSeconds, pace]);

  const planMatchesCurrentSettings = Boolean(run?.plan?.editorialBudget && !stale && (run.plan.pace ?? run.plan.editorialBudget.pace ?? DEFAULT_DIRECTOR_PACE) === normalizeDirectorPace(pace) && run.plan.maxDurationSeconds === maxDurationSeconds);
  const shownSeconds = planMatchesCurrentSettings ? Math.round(run.plan.editorialBudget.totalEstimatedSeconds) : liveEstimate?.seconds;
  const shownCount = planMatchesCurrentSettings ? run.plan.segments.length : liveEstimate?.count;
  const shownTier = planMatchesCurrentSettings ? resolveDirectorPaceProfile(run.plan.pace ?? run.plan.editorialBudget.pace ?? pace).tierLabel : liveEstimate?.tierLabel;

  return <div className="quick-auto-progress">
    <div className="quick-progress-bar">
      <div className="quick-source-tabs" aria-label="场景内容视图">
        <button className={sourceView==='source'?'active':''} onClick={()=>onSourceViewChange('source')}>原文</button>
        <button className={sourceView==='plan'?'active':''} disabled={!run?.plan} onClick={()=>onSourceViewChange('plan')}>自动分段稿{run?.plan?` · ${run.plan.segments.length} 段`:''}</button>
      </div>
      {shownSeconds!=null&&<div className="quick-budget-readout" aria-label="整场时长预估">
        <span>整场预计 <strong>{shownSeconds} 秒</strong></span>
        <span className="quick-budget-dot">·</span>
        <span>{planMatchesCurrentSettings ? `已划分 ${shownCount} 条` : `预计 ${shownCount} 条`}</span>
        <span className="quick-budget-dot">·</span>
        <span className="quick-budget-pace">{shownTier}节奏</span>
      </div>}
      {run&&<div className="quick-run-status" role="status"><span>{descriptions[run.phase]||run.phase}</span>{active?<button onClick={onStop}>停止</button>:['paused','failed','needs-review'].includes(run.phase)&&!stale?<button onClick={onResume}>继续未完成部分</button>:null}</div>}
    </div>
    {run?.plan&&run.phase!=='completed'&&<p className="quick-progress-note">已生成 {Object.values(run.segmentDrafts||{}).filter(d=>d.prompt?.content).length}/{run.plan.segments.length} 条。生成内容先保存并展示到右侧，再核对并标注提醒。</p>}
    {run?.retryMessage&&<p role="status" className="quick-progress-note">{run.retryMessage}</p>}
    {!!run?.auditWarnings?.length&&<details className="quick-run-warning"><summary>提示词已展示，有 {run.auditWarnings.length} 项核对提醒</summary>{run.auditWarnings.map((item,i)=><p key={i}>{item.segmentIndex?`第 ${item.segmentIndex} 条：`:''}{item.message}</p>)}</details>}
    {(stale||run?.phase==='stale')&&<p className="quick-run-warning">原文或节奏/上限设定已变化，点击“生成”按当前节奏重新划分（上方显示实时预计秒数）。</p>}
    {(error||run?.errors?.[0]?.message)&&<p role="alert" className="quick-run-warning">{error||run.errors[0].message}</p>}
    {run?.plan&&sourceView==='plan'&&<div className="quick-plan-timing">{run.plan.segments.map(s=><span key={s.id}>（{s.index}）建议 {s.recommendedDurationSeconds} 秒{s.durationCompression&&Number.isFinite(s.naturalEstimatedSeconds)&&` · 自然预计 ${Math.round(s.naturalEstimatedSeconds*10)/10} 秒，紧凑节奏`}</span>)}</div>}
    {run&&run.phase!=='completed'&&Object.values(run.segmentDrafts||{}).some(d=>d.prompt?.content)&&<details className="quick-draft-preview"><summary>查看本轮草稿与核对内容</summary>{Object.entries(run.segmentDrafts).map(([id,d])=>d.prompt?.content&&<FormattedText key={id} text={d.prompt.content}/>)}</details>}
    {!!run?.previousDrafts?.length&&<details className="quick-draft-preview"><summary>查看更新前保留的草稿</summary>{run.previousDrafts.map((d,i)=><FormattedText key={i} text={d.prompt.content}/>)}</details>}
  </div>;
}
