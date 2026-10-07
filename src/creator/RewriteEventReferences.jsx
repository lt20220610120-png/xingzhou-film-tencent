import React from 'react';
import {referenceKey,referenceIdentity,storySourceOptions,resolveStoryReferences} from '../../core/rewriteStory.js';

export function RewriteEventReferences({project,event,onChange,readOnly=false}){
 const {references,unresolved}=resolveStoryReferences(project,event),options=storySourceOptions(project);
 return <details className="rewrite-event-references"><summary>事件参考 · {references.length} 项{unresolved?' · 需核对旧来源':''}</summary>
  {event.source&&<p>大纲来源说明：{event.source}</p>}
  {unresolved&&<p className="creator-warning">旧来源未能准确对应，或引用已移除。请核对后选择具体事件，也可明确设为无参考。</p>}
  {references.map(r=>{const o=options.find(o=>referenceKey(o)===referenceKey(r));return <div className="rewrite-reference-item" key={referenceKey(r)}><div><strong>{o?`${o.bookName} · ${o.code} ${o.title}`:'已失效的参考事件'}</strong>{o&&<><p>{o.summary}</p><small>所属大事件：{o.groupTitle} · {o.goal}<br/>作用：{o.purpose}</small></>}</div>{!readOnly&&<button className="ghost" onClick={()=>onChange(references.filter(x=>referenceKey(x)!==referenceKey(r)))}>移除</button>}</div>;})}
  {!readOnly&&<div className="rewrite-reference-actions"><select aria-label="添加事件参考" value="" onChange={e=>{const o=options.find(o=>referenceKey(o)===e.target.value);if(o)onChange([...references,referenceIdentity(o)]);}}><option value="">选择对标书中的小事件…</option>{options.filter(o=>!references.some(r=>referenceKey(r)===referenceKey(o))).map(o=><option key={referenceKey(o)} value={referenceKey(o)}>{o.bookName} · {o.code} · {o.title}</option>)}</select><button className="ghost" onClick={()=>onChange([])}>设为无参考</button></div>}
  {!references.length&&!unresolved&&<p className="creator-muted">无参考，按新作设定与全剧事件链原创展开。</p>}
 </details>;
}
