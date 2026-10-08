import React,{useState,useRef} from 'react';
import {Sparkles,Square,Save,Check,Trash2} from 'lucide-react';
import {CreatorDialog} from './CreatorDialogs.jsx';
import {RewriteOutlineCards} from './RewriteOutlineCards.jsx';
import {FormattedText} from '../components/FormattedText.jsx';
import {rewriteSources} from '../../core/rewriteWorkflow.js';
import {rewriteWorldInput} from '../../core/rewriteWorld.js';
import {rewriteOutlineVersions,addWorldSimulationVersion,saveCurrentOutlineVersion,updateOutlineVersion,adoptOutlineVersion,deleteOutlineVersion} from '../../core/rewriteWorldVersions.js';
import {creatorInputFingerprint,updateCreatorProject} from '../../core/creatorWorkspace.js';
import {creatorModelOptions} from '../../core/creatorAi.js';

export function RewriteWorldSimulation({project,state,setState,getState,agent,profile:defaultProfile,onClose,onError,onOpenWorld}) {
 const latest=useRef(state);latest.current=state;
 const versions=rewriteOutlineVersions(project),books=rewriteSources(project),config=project.creator.rewrite?.worldConfig||{};
 const [selectedId,setSelectedId]=useState(versions.at(-1)?.id||''),[reviewed,setReviewed]=useState(false),[error,setError]=useState('');
 const selected=versions.find(v=>v.id===selectedId),sourceIds=config.sourceIds||books.filter(b=>b.analysis?.macroOutline).map(b=>b.id);
 const modelOptions=creatorModelOptions(state.apiProfiles,state.activeApiId),profile=modelOptions.find(o=>o.selectionId===(config.modelSelection||defaultProfile?.selectionId))||modelOptions[0];
 const baseVersionId=config.baseVersionId||'current',prompt=config.prompt||'';
 const target={section:'macroOutline',side:'output',task:'rewriteWorldSim',sourceIds,baseVersionId};
 const input=rewriteWorldInput(project,target),activity=agent.getActivity?.('script',project.id,{section:'macroOutline',task:'rewriteWorldSim'})||{};
 const running=!!activity.running,stale=selected&&selected.inputFingerprint!==creatorInputFingerprint(project,selected.target);
 const configure=patch=>setState(s=>{const p=s.scriptProjects.find(p=>p.id===project.id);return updateCreatorProject(s,'script',project.id,{rewrite:{...p.creator.rewrite,worldConfig:{...p.creator.rewrite?.worldConfig,...patch}}});});
 const attempt=fn=>{try{fn();setError('');}catch(e){setError(e.message);}};
 const choose=id=>{setSelectedId(id);setReviewed(false);setError('');};
 const run=async()=>{
  setError('');try{
   rewriteWorldInput(project,target,{strict:true});
   const recordId=await agent.run({kind:'script',projectId:project.id,target,profile,scope:'project',instruction:prompt.trim()||'请自行选择合理的大事件排列与小事件组合，设计一个因果连贯的新故事；保留有价值的核心作用，避免只改名字。'});
   await new Promise(resolve=>setTimeout(resolve,0));
   const before=getState?.()||latest.current,next=addWorldSimulationVersion(before,project.id,recordId);
   const version=rewriteOutlineVersions(next.scriptProjects.find(p=>p.id===project.id)).find(v=>v.recordId===recordId);
   setState(s=>s.scriptProjects.some(p=>p.id===project.id)?addWorldSimulationVersion(s,project.id,recordId):s);choose(version.id);
  }catch(e){setError(e.message);onError?.(e.message);}
 };
 return <CreatorDialog title="大世界模拟 · 大纲版本" onClose={onClose} className="rewrite-world-dialog">
  <p className="creator-muted">这里继续重组素材与审阅大纲版本。需要人物持续行动、选择路线与蝴蝶效应时，可打开同项目世界推演。</p>{onOpenWorld&&<button className="secondary" onClick={onOpenWorld}>打开持续世界推演</button>}<div className="rewrite-world-runbar"><label>接口与模型<select aria-label="大世界模拟模型" value={profile?.selectionId||''} onChange={e=>configure({modelSelection:e.target.value})}>{!profile&&<option value="">请先配置接口</option>}{modelOptions.map(o=><option key={o.selectionId} value={o.selectionId}>{o.name} · {o.model}</option>)}</select></label>{running?<button className="secondary" onClick={()=>agent.cancel('script',project.id,{section:'macroOutline',task:'rewriteWorldSim'})}><Square size={14}/>停止模拟</button>:<button className="primary" disabled={!profile||!sourceIds.length} onClick={run}><Sparkles size={15}/>开始模拟新版本</button>}</div>
  <div className="rewrite-world-layout">
   <aside className="rewrite-world-controls">
    <h3>推演设置</h3><p className="creator-muted">每次生成一个独立版本，编辑满意后再采用。</p>
    <fieldset><legend>事件素材库</legend>{books.map(book=><label className="rewrite-world-source" key={book.id}><input type="checkbox" disabled={!book.analysis?.macroOutline} checked={sourceIds.includes(book.id)} onChange={e=>configure({sourceIds:e.target.checked?[...sourceIds,book.id]:sourceIds.filter(id=>id!==book.id)})}/><span>{book.name}{!book.analysis?.macroOutline&&<small>先拆解本书大纲</small>}</span></label>)}</fieldset>
    <label>推演起点<select aria-label="模拟起点" value={baseVersionId} onChange={e=>configure({baseVersionId:e.target.value})}><option value="sources">从对标素材重新组合</option><option value="current">继续修改当前新作大纲</option>{versions.map(v=><option key={v.id} value={v.id}>第{v.number}版 · {v.name}</option>)}</select></label>
    <label>你的要求<textarea aria-label="大世界模拟要求" placeholder="例如：先网恋相爱，再现实相遇；保留女主独立的性格，改写相遇过程。可留空让 Agent 推演。" value={prompt} onChange={e=>configure({prompt:e.target.value})}/></label>
    <details className="rewrite-world-constraints"><summary>本次读取的新作约束</summary>{['settings','characters'].map(key=><div key={key}><strong>{key==='settings'?'设定':'人物'} · {input.constraints[key]?'已确认':'尚未确认或待复核'}</strong>{input.constraints[key]&&<FormattedText text={input.constraints[key].output}/>}</div>)}</details>
    {running&&<p className="creator-muted" role="status">{activity.label||'正在模拟'} · 关闭窗口后继续运行</p>}
    {error&&<p className="creator-error" role="alert">{error}</p>}
    <div className="rewrite-world-version-heading"><h3>大纲版本库</h3><button className="ghost" disabled={!project.creator.sections.macroOutline?.output?.trim()} onClick={()=>attempt(()=>{const next=saveCurrentOutlineVersion(getState?.()||latest.current,project.id),v=rewriteOutlineVersions(next.scriptProjects.find(p=>p.id===project.id)).at(-1);setState(s=>saveCurrentOutlineVersion(s,project.id,{versionId:v.id}));choose(v.id);})}><Save size={14}/>保存当前</button></div>
    <nav aria-label="大纲版本列表">{versions.slice().reverse().map(v=><button key={v.id} className={selectedId===v.id?'active':''} onClick={()=>choose(v.id)}><strong>第{v.number}版 · {v.name}</strong><small>{project.creator.rewrite?.activeOutlineVersionId===v.id?'当前采用':v.adoptedAt?'曾采用':'未采用'} · {new Date(v.createdAt).toLocaleString('zh-CN')}</small></button>)}</nav>
   </aside>
   <section className="rewrite-world-version">
    {selected?<><header><label>版本名称<input aria-label="模拟版本名称" value={selected.name} onChange={e=>attempt(()=>setState(s=>updateOutlineVersion(s,project.id,selected.id,{name:e.target.value})))}/></label><div className="creator-inline-actions"><button className="primary" disabled={project.creator.sections.macroOutline?.locked||!!stale&&!reviewed} onClick={()=>attempt(()=>{adoptOutlineVersion(getState?.()||latest.current,project.id,selected.id,{allowStale:reviewed});setState(s=>adoptOutlineVersion(s,project.id,selected.id,{allowStale:reviewed}));onClose();})}><Check size={14}/>采用此版本</button><button className="ghost danger" aria-label="删除大纲版本" disabled={project.creator.rewrite?.activeOutlineVersionId===selected.id||baseVersionId===selected.id&&running} onClick={()=>{if(window.confirm('删除这个大纲版本？当前新作内容保留。'))attempt(()=>{setState(s=>deleteOutlineVersion(s,project.id,selected.id));choose('');});}}><Trash2 size={14}/></button></div></header>
     {project.creator.sections.macroOutline?.locked&&<p className="creator-warning">新作大纲已锁定；候选可以编辑，采用前请先解锁新作大纲。</p>}
     {stale&&<label className="rewrite-world-review"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>设定、人物、起点或素材已变化。我已对照当前资料复核此版本，允许采用。</label>}
     <details className="rewrite-world-notes"><summary>改动、约束核对与生成时的资料</summary><strong>改动说明</strong><FormattedText text={selected.changeSummary||''}/><strong>约束核对</strong><FormattedText text={selected.constraintsCheck||'人工保存版本，请按当前设定核对。'}/><strong>生成时要求</strong><FormattedText text={selected.instruction||'人工保存当前大纲'}/>{selected.inputSnapshot&&<><strong>当时的设定</strong><FormattedText text={selected.inputSnapshot.constraints?.settings?.output||'尚未确认'}/><strong>当时的人物</strong><FormattedText text={selected.inputSnapshot.constraints?.characters?.output||'尚未确认'}/><small>素材：{selected.inputSnapshot.sources?.map(s=>s.name).join('；')||'人工大纲'}</small></>}</details>
     <p className="creator-muted">可修改名称、顺序、阶段目标及小事件。修改只保存在此版本，点击采用后才写入新作大纲。</p>
     <RewriteOutlineCards key={selected.id} value={selected.output} onChange={output=>attempt(()=>setState(s=>updateOutlineVersion(s,project.id,selected.id,{output})))}/>
    </>:<div className="rewrite-world-empty"><h3>先确定排列，再完善事件</h3><p>选取事件素材并填写要求，生成的新故事会保留在左侧版本库。</p><p>先看 A → B → C 大事件链，再展开各组的小事件链。你可以编辑、重排，满意后再采用。</p><p>当前新作大纲、主线和正文会保留。</p></div>}
   </section>
  </div>
 </CreatorDialog>;
}
