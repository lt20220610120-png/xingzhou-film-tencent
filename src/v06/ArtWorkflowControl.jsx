import React,{useState} from 'react';
import '../art-workbench.css';
export default function ArtWorkflowControl({workflow,onChange,disabled,onOpenReview,onNext}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const change=async mode=>{setBusy(true);setError('');try{await onChange(mode);}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <div className="art-workflow-control"><label>分析方式<select aria-label="美术分析方式" value={workflow.mode} disabled={disabled||busy} onChange={e=>change(e.target.value)}><option value="automatic">自动连续分析</option><option value="guided">逐集协同核实</option></select></label><small>{workflow.mode==='guided'?'生成一集 → 人工核实整集及关联 → 再生成下一集。':'从前往后逐集生成；本集未完成会暂停，不跳到后续集。'}</small><p role="status">{workflow.message}</p>{workflow.mode==='guided'&&workflow.phase==='review'&&onOpenReview&&<button className="secondary" onClick={()=>onOpenReview(workflow.episodeNumber)}>去核实第 {workflow.episodeNumber} 集</button>}{workflow.mode==='guided'&&onNext&&workflow.phase!=='complete'&&<button className="primary" disabled={disabled||busy||workflow.phase!=='generate'} onClick={onNext}>{workflow.phase==='review'?`等待核实第 ${workflow.episodeNumber} 集`:`继续分析第 ${workflow.episodeNumber} 集`}</button>}{error&&<p className="collab-error" role="alert">分析方式保存失败：{error}</p>}</div>;
}
