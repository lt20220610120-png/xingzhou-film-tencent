import React,{useState} from 'react';
import {Plus,Trash2} from 'lucide-react';
import {readRewriteMainline,outlineEventOptions} from '../../core/rewriteMainline.js';
import {FormattedText,FormattedEditor} from '../components/FormattedText.jsx';

export function RewriteMainlineCards({value,outline,readOnly=false,onChange,onReorganize}) {
 const [selected,setSelected]=useState('');
 let data,options=[];try{data=readRewriteMainline(value);options=outlineEventOptions(outline);}catch(e){return <p role="alert" className="creator-error">{e.message}</p>;}
 const write=next=>onChange?.(JSON.stringify(next));
 const update=(id,patch)=>write({...data,eventGroups:data.eventGroups.map(g=>g.id===id?{...g,...patch}:g)});
 const optionFor=g=>options.find(o=>o.eventId===g.eventId);
 const available=options.filter(o=>!data.eventGroups.some(g=>g.eventId===o.eventId));
 const current=data.eventGroups.find(g=>g.id===selected)||data.eventGroups[0];
 const add=o=>{const group={id:`line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,groupId:o.groupId,eventId:o.eventId,title:o.title,episodes:[]};write({...data,eventGroups:[...data.eventGroups,group]});setSelected(group.id);};
 return <div className="rewrite-mainline-cards">
  {data.legacyText&&<section className="rewrite-legacy-mainline"><div className="rewrite-mainline-note">原有主线完整保留；整理后将按 A1、A2 等小事件显示逐集提纲。{onReorganize&&<button className="secondary" onClick={onReorganize}>整理为事件集纲</button>}</div>{readOnly?<FormattedText text={data.legacyText}/>:<FormattedEditor aria-label="原有新作主线" value={data.legacyText} onChange={e=>write({...data,legacyText:e.target.value})}/>}</section>}
  {!!data.eventGroups.length&&<nav className="rewrite-group-tabs" aria-label="主线小事件切换">{data.eventGroups.map(g=>{const o=optionFor(g);return <button key={g.id} className={g.id===current?.id?'active':''} aria-pressed={g.id===current?.id} onClick={()=>setSelected(g.id)} title={o?.title||g.title}>{o?.code||'待关联'} · {o?.title||g.title}</button>;})}</nav>}
  {current&&<section className="rewrite-mainline-group"><header><strong>{optionFor(current)?.code||'待关联'} · {optionFor(current)?.title||current.title}</strong><small>{current.episodes.length} 集提纲</small>{!readOnly&&<button className="ghost danger" aria-label="删除主线小事件组" onClick={()=>{if(window.confirm('删除这个主线分组及集纲？历史保留在项目资料。'))write({...data,eventGroups:data.eventGroups.filter(g=>g.id!==current.id)});}}><Trash2 size={14}/></button>}</header>
   {!optionFor(current)&&<p className="creator-warning">对应的大纲小事件已变化或来自另一部对标，请重新关联。</p>}
   {!readOnly&&<label className="rewrite-event-transfer">对应大纲小事件<select aria-label="关联主线小事件" value={optionFor(current)?.eventId||''} onChange={e=>{const o=options.find(o=>o.eventId===e.target.value);if(o)update(current.id,{groupId:o.groupId,eventId:o.eventId,title:o.title});}}><option value="">请选择对应小事件</option>{options.filter(o=>o.eventId===current.eventId||!data.eventGroups.some(g=>g.eventId===o.eventId)).map(o=><option key={o.eventId} value={o.eventId}>{o.code} · {o.title}</option>)}</select></label>}
   {current.episodes.map((ep,i)=><article className="rewrite-mainline-episode" key={i}><header>{readOnly?<strong>{ep.title}</strong>:<><label>集号<input type="number" min="1" aria-label={`主线第${i+1}项集号`} value={ep.number} onChange={e=>update(current.id,{episodes:current.episodes.map((item,n)=>n===i?{...item,number:Number(e.target.value),title:`第${e.target.value}集`}:item)})}/></label><strong>{ep.title}</strong><button className="ghost danger" aria-label={`删除集纲${ep.title}`} onClick={()=>update(current.id,{episodes:current.episodes.filter((_,n)=>n!==i)})}><Trash2 size={14}/></button></>}</header>{readOnly?<FormattedText text={ep.outline}/>:<FormattedEditor aria-label={`集纲${ep.title}`} value={ep.outline} placeholder="本集的事件、人物行动、因果与转折" onChange={e=>update(current.id,{episodes:current.episodes.map((item,n)=>n===i?{...item,outline:e.target.value}:item)})}/>} {ep.source&&<small>来源：{ep.source}</small>}</article>)}
   {!readOnly&&<button className="secondary rewrite-outline-add" onClick={()=>{const number=Math.max(0,...data.eventGroups.flatMap(g=>g.episodes.map(e=>e.number||0)))+1;update(current.id,{episodes:[...current.episodes,{number,title:`第${number}集`,outline:'',source:''}]});}}><Plus size={14}/>添加本组集纲</button>}
  </section>}
  {!readOnly&&available.length>0&&<label className="rewrite-mainline-add">添加小事件集纲组<select aria-label="添加主线小事件组" value="" onChange={e=>{const o=available.find(o=>o.eventId===e.target.value);if(o)add(o);}}><option value="">选择 A1、A2 等大纲小事件…</option>{available.map(o=><option key={o.eventId} value={o.eventId}>{o.code} · {o.title}</option>)}</select></label>}
  {!data.eventGroups.length&&!data.legacyText&&<p className="creator-muted">{options.length?'按 A1、A2 等小事件组织逐集提纲，可与 Agent 协作生成，也可手动添加。':'先拆解或编辑大纲中的大事件与小事件，再组织它们对应的逐集提纲。'}</p>}
 </div>;
}
