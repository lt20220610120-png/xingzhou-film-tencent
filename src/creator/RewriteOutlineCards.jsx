import React,{useState,useEffect} from 'react';
import {Plus,ArrowUp,ArrowDown,Trash2} from 'lucide-react';
import {readRewriteOutline,newOutlineGroup,newOutlineEvent,moveOutlineGroup,moveOutlineEvent} from '../../core/rewriteOutline.js';
import {FormattedText} from '../components/FormattedText.jsx';
import {outlineGroupCode} from '../../core/rewriteMainline.js';

export function RewriteOutlineCards({value,onChange,readOnly=false,onReferenceGroup,onReferenceEvent,navigate=false}) {
 const [selectedId,setSelectedId]=useState('');
 let data,error;try{data=readRewriteOutline(value);}catch(e){error=e;data={groups:[]};}
 const currentId=data.groups.some(g=>g.id===selectedId)?selectedId:data.groups[0]?.id;
 useEffect(()=>{if(currentId!==selectedId)setSelectedId(currentId||'');},[currentId,selectedId]);
 if(error)return <p className="creator-error">{error.message}</p>;
 const write=next=>onChange?.(JSON.stringify(next));
 const groupPatch=(id,patch)=>write({...data,groups:data.groups.map(g=>g.id===id?{...g,...patch}:g)});
 const eventPatch=(gid,id,patch)=>groupPatch(gid,{events:data.groups.find(g=>g.id===gid).events.map(e=>e.id===id?{...e,...patch}:e)});
 return <div className={`rewrite-outline-cards ${readOnly?'readonly':''}`}>
  {navigate&&data.groups.length>0&&<nav className="rewrite-group-tabs" aria-label="大事件组切换">{data.groups.map((g,i)=><button key={g.id} className={g.id===currentId?'active':''} aria-pressed={g.id===currentId} title={g.title} onClick={()=>setSelectedId(g.id)}>{outlineGroupCode(i)}组</button>)}</nav>}
  {data.groups.map((group,i)=>navigate&&group.id!==currentId?null:<article className="rewrite-outline-group" key={group.id}>
   <header><span className="rewrite-group-index">{outlineGroupCode(i)}组</span>{readOnly?<strong>{group.title||'未命名大事件'}</strong>:<input aria-label={`大事件${i+1}名称`} placeholder="大事件／阶段名称" value={group.title} onChange={e=>groupPatch(group.id,{title:e.target.value})}/>}
    <div className="rewrite-outline-tools">{onReferenceGroup&&<button className="ghost" onClick={()=>onReferenceGroup(group)}>引用本组</button>}{!readOnly&&<><button className="ghost" aria-label={`上移大事件${i+1}`} disabled={!i} onClick={()=>write(moveOutlineGroup(data,group.id,-1))}><ArrowUp size={13}/></button><button className="ghost" aria-label={`下移大事件${i+1}`} disabled={i===data.groups.length-1} onClick={()=>write(moveOutlineGroup(data,group.id,1))}><ArrowDown size={13}/></button><button className="ghost danger" aria-label={`删除大事件${i+1}`} onClick={()=>{if(window.confirm('删除这个大事件及其小事件？'))write({...data,groups:data.groups.filter(g=>g.id!==group.id)});}}><Trash2 size={13}/></button></>}</div>
   </header>
   {readOnly?<><div className="rewrite-outline-goal"><b>阶段目标</b><FormattedText text={group.goal}/></div>{group.source&&<small>来源：{group.source}</small>}</>:<label>阶段目标与转折<textarea aria-label={`大事件${i+1}目标`} placeholder="这一阶段为了什么，从什么状态走向什么状态？" value={group.goal} onChange={e=>groupPatch(group.id,{goal:e.target.value})}/></label>}
   <div className="rewrite-outline-events">{group.events.map((event,j)=><section className="rewrite-outline-event" key={event.id}>
    <header><span>{outlineGroupCode(i)}{j+1}</span>{readOnly?<strong>{event.title||'未命名小事件'}</strong>:<input aria-label={`大事件${i+1}小事件${j+1}名称`} placeholder="小事件名称" value={event.title} onChange={e=>eventPatch(group.id,event.id,{title:e.target.value})}/>}
    <div className="rewrite-outline-tools">{onReferenceEvent&&<button className="ghost" onClick={()=>onReferenceEvent(group,event)}>引用此事件</button>}{!readOnly&&<><button className="ghost" aria-label={`上移大事件${i+1}小事件${j+1}`} disabled={!j} onClick={()=>write(moveOutlineEvent(data,group.id,event.id,group.id,-1))}><ArrowUp size={12}/></button><button className="ghost" aria-label={`下移大事件${i+1}小事件${j+1}`} disabled={j===group.events.length-1} onClick={()=>write(moveOutlineEvent(data,group.id,event.id,group.id,1))}><ArrowDown size={12}/></button><button className="ghost danger" aria-label={`删除大事件${i+1}小事件${j+1}`} onClick={()=>groupPatch(group.id,{events:group.events.filter(e=>e.id!==event.id)})}><Trash2 size={12}/></button></>}</div></header>
    {readOnly?<><FormattedText text={event.summary}/><div className="rewrite-outline-purpose"><b>作用与因果</b><FormattedText text={event.purpose}/></div>{event.source&&<small>来源：{event.source}</small>}</>:<><label>简短提纲<textarea aria-label={`大事件${i+1}小事件${j+1}提纲`} placeholder="只写核心行动，不必展开逐集场景对白" value={event.summary} onChange={e=>eventPatch(group.id,event.id,{summary:e.target.value})}/></label><label>作用与因果<textarea aria-label={`大事件${i+1}小事件${j+1}作用`} placeholder="为什么需要此事件，如何推动本组目标并连接其他事件？" value={event.purpose} onChange={e=>eventPatch(group.id,event.id,{purpose:e.target.value})}/></label>{data.groups.length>1&&<label className="rewrite-event-transfer">移入大事件<select aria-label={`移动大事件${i+1}小事件${j+1}到其他组`} value={group.id} onChange={e=>write(moveOutlineEvent(data,group.id,event.id,e.target.value))}>{data.groups.map((g,n)=><option key={g.id} value={g.id}>{n+1} · {g.title||'未命名大事件'}</option>)}</select></label>}</>}
   </section>)}</div>
   {!readOnly&&<button className="ghost rewrite-outline-add" onClick={()=>groupPatch(group.id,{events:[...group.events,newOutlineEvent()]})}><Plus size={13}/>添加小事件</button>}
  </article>)}
  {!data.groups.length&&<p className="creator-muted">{readOnly?'尚未拆解阶段大纲。':'引用对标的大事件或小事件，或从空白开始搭建骨架。这里不划分集数。'}</p>}
  {!readOnly&&<button className="secondary rewrite-outline-add" onClick={()=>{const group=newOutlineGroup();write({...data,groups:[...data.groups,group]});setSelectedId(group.id);}}><Plus size={14}/>添加大事件</button>}
 </div>;
}
