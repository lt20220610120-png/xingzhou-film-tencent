import React,{useState} from 'react';
import {Plus,ArrowUp,ArrowDown,Trash2,ChevronDown,ChevronRight} from 'lucide-react';
import {readRewriteOutline,newOutlineGroup,newOutlineEvent,moveOutlineGroup,moveOutlineEvent} from '../../core/rewriteOutline.js';
import {FormattedText} from '../components/FormattedText.jsx';
import {outlineGroupCode} from '../../core/rewriteMainline.js';
import {RewriteEventReferences} from './RewriteEventReferences.jsx';

export function RewriteOutlineCards({value,onChange,readOnly=false,onReferenceGroup,onReferenceEvent,project}) {
 const [openGroups,setOpenGroups]=useState(new Set()),[openEvents,setOpenEvents]=useState(new Set());
 let data,error;try{data=readRewriteOutline(value);}catch(e){error=e;data={groups:[]};}
 if(error)return <p className="creator-error">{error.message}</p>;
 const toggle=(setter,id)=>setter(before=>{const next=new Set(before);next.has(id)?next.delete(id):next.add(id);return next;});
 const write=next=>onChange?.(JSON.stringify(next));
 const groupPatch=(id,patch)=>write({...data,groups:data.groups.map(g=>g.id===id?{...g,...patch}:g)});
 const eventPatch=(gid,id,patch)=>groupPatch(gid,{events:data.groups.find(g=>g.id===gid).events.map(e=>e.id===id?{...e,...patch}:e)});
 return <div className={`rewrite-outline-cards rewrite-chain-cards ${readOnly?'readonly':''}`}>
  {!!data.groups.length&&<div className="rewrite-chain-heading"><strong>全剧大事件链</strong><small>{data.groups.length} 个大事件 · {data.groups.reduce((n,g)=>n+g.events.length,0)} 个小事件</small><button className="ghost" onClick={()=>{setOpenGroups(new Set());setOpenEvents(new Set());}}>收起全部</button></div>}
  {data.groups.map((group,i)=><React.Fragment key={group.id}>
   {i>0&&<div className="rewrite-chain-link" aria-hidden="true"><ArrowDown size={17}/><span>进入 {outlineGroupCode(i)} 组</span></div>}
   <article className={`rewrite-outline-group ${openGroups.has(group.id)?'expanded':''}`}>
    <header><button className="rewrite-chain-node" aria-expanded={openGroups.has(group.id)} onClick={()=>toggle(setOpenGroups,group.id)}><span className="rewrite-group-index">{outlineGroupCode(i)}组</span><strong>{group.title||'未命名大事件'}</strong><small>{group.events.length} 个小事件</small>{openGroups.has(group.id)?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button>
     <div className="rewrite-outline-tools">{onReferenceGroup&&<button className="ghost" onClick={()=>onReferenceGroup(group)}>引用本组</button>}{!readOnly&&<><button className="ghost" aria-label={`上移大事件${i+1}`} disabled={!i} onClick={()=>write(moveOutlineGroup(data,group.id,-1))}><ArrowUp size={13}/></button><button className="ghost" aria-label={`下移大事件${i+1}`} disabled={i===data.groups.length-1} onClick={()=>write(moveOutlineGroup(data,group.id,1))}><ArrowDown size={13}/></button><button className="ghost danger" aria-label={`删除大事件${i+1}`} onClick={()=>{if(window.confirm('删除这个大事件及其小事件？'))write({...data,groups:data.groups.filter(g=>g.id!==group.id)});}}><Trash2 size={13}/></button></>}</div>
    </header>
    {openGroups.has(group.id)&&<div className="rewrite-chain-group-content">
     {!readOnly&&<label>大事件名称<input aria-label={`大事件${i+1}名称`} value={group.title} placeholder="大事件／阶段名称" onChange={e=>groupPatch(group.id,{title:e.target.value})}/></label>}
     {readOnly?<details className="rewrite-outline-goal"><summary>阶段目标与转折</summary><FormattedText text={group.goal}/>{group.source&&<small>来源：{group.source}</small>}</details>:<label>阶段目标与转折<textarea aria-label={`大事件${i+1}目标`} value={group.goal} onChange={e=>groupPatch(group.id,{goal:e.target.value})}/></label>}
     {!readOnly&&<label>素材来源及改动<input aria-label={`大事件${i+1}来源`} value={group.source||''} onChange={e=>groupPatch(group.id,{source:e.target.value})}/></label>}
     <p className="rewrite-small-chain-label">{outlineGroupCode(i)} 组小事件链 · 按故事顺序展开</p>
     <div className="rewrite-outline-events">{group.events.map((event,j)=><React.Fragment key={event.id}>
      {j>0&&<div className="rewrite-chain-link small" aria-hidden="true"><ArrowDown size={14}/></div>}
      <section className="rewrite-outline-event">
       <header><button className="rewrite-chain-node" aria-expanded={openEvents.has(event.id)} onClick={()=>toggle(setOpenEvents,event.id)}><span>{outlineGroupCode(i)}{j+1}</span><strong>{event.title||'未命名小事件'}</strong>{openEvents.has(event.id)?<ChevronDown size={15}/>:<ChevronRight size={15}/>}</button>
        <div className="rewrite-outline-tools">{onReferenceEvent&&<button className="ghost" onClick={()=>onReferenceEvent(group,event)}>引用此事件</button>}{!readOnly&&<><button className="ghost" aria-label={`上移大事件${i+1}小事件${j+1}`} disabled={!j} onClick={()=>write(moveOutlineEvent(data,group.id,event.id,group.id,-1))}><ArrowUp size={12}/></button><button className="ghost" aria-label={`下移大事件${i+1}小事件${j+1}`} disabled={j===group.events.length-1} onClick={()=>write(moveOutlineEvent(data,group.id,event.id,group.id,1))}><ArrowDown size={12}/></button><button className="ghost danger" aria-label={`删除大事件${i+1}小事件${j+1}`} onClick={()=>groupPatch(group.id,{events:group.events.filter(e=>e.id!==event.id)})}><Trash2 size={12}/></button></>}</div>
       </header>
       {openEvents.has(event.id)&&<div className="rewrite-chain-event-content">{readOnly?<><FormattedText text={event.summary}/><div className="rewrite-outline-purpose"><b>作用与因果</b><FormattedText text={event.purpose}/></div>{event.source&&<small>来源：{event.source}</small>}</>:<><label>小事件名称<input aria-label={`大事件${i+1}小事件${j+1}名称`} value={event.title} onChange={e=>eventPatch(group.id,event.id,{title:e.target.value})}/></label><label>简短提纲<textarea aria-label={`大事件${i+1}小事件${j+1}提纲`} value={event.summary} onChange={e=>eventPatch(group.id,event.id,{summary:e.target.value})}/></label><label>作用与因果<textarea aria-label={`大事件${i+1}小事件${j+1}作用`} value={event.purpose} onChange={e=>eventPatch(group.id,event.id,{purpose:e.target.value})}/></label><label>素材来源及改动<input aria-label={`大事件${i+1}小事件${j+1}来源`} value={event.source||''} onChange={e=>eventPatch(group.id,event.id,{source:e.target.value})}/></label>{data.groups.length>1&&<label>移入大事件<select aria-label={`移动大事件${i+1}小事件${j+1}到其他组`} value={group.id} onChange={e=>write(moveOutlineEvent(data,group.id,event.id,e.target.value))}>{data.groups.map((g,n)=><option key={g.id} value={g.id}>{outlineGroupCode(n)} · {g.title||'未命名大事件'}</option>)}</select></label>}</>}</div>}
       {project&&openEvents.has(event.id)&&<RewriteEventReferences project={project} event={event} readOnly={readOnly} onChange={references=>eventPatch(group.id,event.id,{references})}/>}
      </section>
     </React.Fragment>)}</div>
     {!!group.events.length&&data.groups[i+1]?.events.length>0&&<p className="rewrite-chain-transition">{outlineGroupCode(i)}{group.events.length} · {group.events.at(-1).title} → {outlineGroupCode(i+1)}1 · {data.groups[i+1].events[0].title}</p>}
     {!readOnly&&<button className="ghost rewrite-outline-add" onClick={()=>{const event=newOutlineEvent();groupPatch(group.id,{events:[...group.events,event]});setOpenEvents(ids=>new Set([...ids,event.id]));}}><Plus size={13}/>添加小事件</button>}
     <div className="rewrite-group-end">{outlineGroupCode(i)} 组结束 · {group.title}</div>
    </div>}
   </article>
  </React.Fragment>)}
  {!data.groups.length&&<p className="creator-muted">{readOnly?'尚未拆解阶段大纲。':'引用对标的大事件或小事件，或从空白开始搭建骨架。这里不划分集数。'}</p>}
  {!readOnly&&<button className="secondary rewrite-outline-add" onClick={()=>{const group=newOutlineGroup();write({...data,groups:[...data.groups,group]});setOpenGroups(ids=>new Set([...ids,group.id]));}}><Plus size={14}/>添加大事件</button>}
 </div>;
}
