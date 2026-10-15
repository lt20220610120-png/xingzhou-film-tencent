import React, {useRef, useState} from 'react';
import {inspectCollabEpisodes} from '../../core/collabEpisodes.js';
import './episode-identity.css';

export async function resolveEpisodeIdentity({project,api,index,operation,episodeNumber,title,content,onProjectChange,refresh}){
 if(project.myRole!=='producer')throw Error('仅制片可以处理分集编号，当前为只读。');
 if(project.locked)throw Error('项目已锁定，请由制片解锁后处理分集。');
 const payload={projectId:project.id,baseEpisodes:project.episodes,operation,index};
 if(operation==='edit')Object.assign(payload,{episodeNumber,title,content});
 const saved=await api.collabResolveEpisodeIdentity(payload);
 onProjectChange?.(saved);
 await refresh?.({manual:true});
 return saved;
}

function EpisodeText({episode,label,onCopy}){
 const content=typeof episode?.content==='string'?episode.content:'';
 return <div className="episode-identity-text"><header><b>{episode?.title||'未命名分集'}</b><button type="button" onClick={()=>onCopy(content)}>复制{label}正文</button></header><pre tabIndex={0} aria-label={`${label}完整正文`}>{content||'（正文为空）'}</pre></div>;
}

export default function EpisodeIdentityPanel({project,api,onProjectChange,refresh}){
 const inspection=inspectCollabEpisodes(project.episodes),issues=inspection.issues||[];
 const [editor,setEditor]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const running=useRef(false),canManage=project.myRole==='producer'&&!project.locked;
 const rows=Array.isArray(project.episodes)?project.episodes:[];
 const histories=rows.flatMap((episode,index)=>(Array.isArray(episode?.episodeIdentityHistory)?episode.episodeIdentityHistory:[]).map((history,position)=>({history,index,position})));
 const historyReason=reason=>({'select-primary':'选择主稿',edit:'修改分集',remove:'移出当前分集'}[reason]||'分集处理');
 const warning=project.director_sync_warning;
 const warningText=typeof warning==='string'?warning:warning?.message;
 const copy=async text=>{try{await navigator.clipboard.writeText(text);setNotice('完整正文已复制。');setError('');}catch{setError('复制未完成，可在正文区域选择文字后复制。');}};
 const act=async(operation,index,changes={})=>{
  if(running.current||!canManage)return;
  running.current=true;setBusy(true);setError('');setNotice('');
  try{
   const source=operation==='edit'&&editor?{...project,episodes:editor.baseEpisodes}:project;
   await resolveEpisodeIdentity({project:source,api,operation,index,...changes,onProjectChange,refresh});
   setEditor(null);setNotice('已保存分集处理结果。原始版本与原完整剧本已保留在历史中。');
  }catch(e){setError(e.message||'保存失败，原始内容仍保留。');}finally{running.current=false;setBusy(false);}
 };
 const renderRow=({episode,index},issue)=>{
  const view=`${issue?.type||'all'}:${index}`,editing=editor?.index===index&&editor?.view===view;
  return <details className="episode-identity-version" key={index}>
   <summary>版本 {index+1} · {episode?.title||'未命名分集'}{issue?.type==='duplicate'?` · 第 ${issue.number} 集候选`:''}</summary>
   <EpisodeText episode={episode} label={`版本${index+1}`} onCopy={copy}/>
   {canManage&&<div className="episode-identity-actions">
    {issue?.type==='duplicate'&&<button type="button" disabled={busy} onClick={()=>act('select-primary',index)}>选为第 {issue.number} 集主稿</button>}
    <button type="button" disabled={busy} onClick={()=>setEditor({index,view,baseEpisodes:project.episodes,episodeNumber:issue?.number||episode?.episodeNumber||episode?.number||episode?.episode||episode?.episode_number||'',title:episode?.title||'',content:episode?.content||''})}>编辑集号、标题与正文</button>
    <button type="button" disabled={busy} onClick={()=>act('remove',index)}>移出当前分集并保留历史</button>
   </div>}
   {editing&&<form className="episode-identity-editor" onSubmit={event=>{event.preventDefault();const number=Number(editor.episodeNumber);if(!Number.isInteger(number)||number<1){setError('请填写有效的正整数集号。');return;}act('edit',index,{episodeNumber:number,title:editor.title,content:editor.content});}}>
    <p>请同时核对集号、标题及正文内的集数 / 场次号。保存前不会自动改号或改写原文，旧版本会保留历史。</p>
    <label>集号<input aria-label={`版本${index+1}集号`} type="number" min="1" step="1" required value={editor.episodeNumber} onChange={e=>setEditor({...editor,episodeNumber:e.target.value})}/></label>
    <label>标题<input aria-label={`版本${index+1}标题`} value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/></label>
    <label>完整正文<textarea aria-label={`版本${index+1}正文`} value={editor.content} onChange={e=>setEditor({...editor,content:e.target.value})}/></label>
    <div className="episode-identity-actions"><button type="submit" disabled={busy}>{busy?'正在保存…':'保存分集修改'}</button><button type="button" disabled={busy} onClick={()=>setEditor(null)}>取消编辑</button></div>
   </form>}
  </details>;
 };
 return <section className={`episode-identity-panel${inspection.error?' has-issues':''}`} aria-label="分集检查与历史">
  {warningText&&<p className="episode-identity-warning" role="status">导演源同步待核对：{warningText}。当前协作项目与已有资产继续保留，可继续使用其他功能。</p>}
  {inspection.error&&<div className="episode-identity-warning" role="status"><b>分集编号待核对，项目已正常打开</b><p>{inspection.error}</p><p>下方可查看所有冲突版本。编号明确的分集和已有资产仍可浏览；分析与发布会先检查编号。选择主稿后，其他版本移入历史，原文保留。</p></div>}
  <details open={inspection.error?true:undefined} className="episode-identity-checks"><summary>{inspection.error?`处理分集编号（${issues.length} 项待核对）`:`分集检查与编辑（${rows.length} 条）`}</summary>
   {!canManage&&<p>{project.locked?'项目已锁定，仅可查看与复制原文。请由制片解锁后处理。':'当前角色只读。请由项目制片选择主稿、修改集号或移入历史。'}</p>}
   {issues.map((issue,position)=><section className="episode-identity-issue" key={`${issue.type}:${position}`}><h3>{issue.type==='duplicate'?`第 ${issue.number} 集有多个版本`:'无法确认集号'}</h3><p>{issue.message}</p>{issue.rows.map(row=>renderRow(row,issue))}</section>)}
   <details className="episode-identity-all"><summary>查看全部当前分集（{rows.length} 条）</summary><p>以下为当前项目中的原始分集，可主动核对和编辑。移出当前分集后仍保留历史。</p>{rows.map((episode,index)=>renderRow({episode,index}))}</details>
  </details>
  {!!histories.length&&<details className="episode-identity-history"><summary>分集历史版本（{histories.length} 条，供查阅，不参与当前分集分析）</summary>{histories.map(({history,index,position})=><details key={`${index}:${position}`}><summary>{history.at?new Date(history.at).toLocaleString('zh-CN'):'历史记录'} · {historyReason(history.reason)} · {history.episode?.title||'未命名版本'}</summary><EpisodeText episode={history.episode} label="历史版本" onCopy={copy}/>{typeof history.previousProjectScript==='string'&&<details><summary>处理前的完整项目剧本</summary><button type="button" onClick={()=>copy(history.previousProjectScript)}>复制历史完整剧本</button><pre tabIndex={0}>{history.previousProjectScript}</pre></details>}</details>)}</details>}
  {(busy||notice)&&<p role="status">{busy?'正在保存分集处理结果…':notice}</p>}
  {error&&<p className="episode-identity-error" role="alert">{error}</p>}
 </section>;
}
