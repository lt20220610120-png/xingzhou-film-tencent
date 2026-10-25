import React from 'react';
import {ChevronDown} from 'lucide-react';
import {reviewName} from '../../core/artReview.js';

export default function ArtDeferredPanel({entries,onOpenEpisode}){
 if(!entries.length)return null;
 const waiting=entries.filter(e=>e.marker.status!=='resolved').length;
 return <details className="art-review-deferred">
  <summary><strong>待补与回填</strong><span>{waiting} 待确认 · {entries.length-waiting} 已回填</span><ChevronDown size={16}/></summary>
  <div className="art-review-deferred-list">{entries.map(({episodeNumber,item,marker})=><article key={`${episodeNumber}:${item.id}`}>
   <header><button type="button" onClick={()=>onOpenEpisode(episodeNumber)}>第 {episodeNumber} 集</button><b>{reviewName(item.name)}</b><span>{marker.status==='resolved'?'已依据后文回填':marker.status==='unresolved'?'全文无充分依据':'等待后文'} · 已尝试 {marker.attempts} 次</span></header>
   <p>{marker.reason}</p>
   {item.voiceDescription&&<p>声音：{item.voiceDescription}</p>}
   {!!marker.evidence?.length&&<ul>{marker.evidence.map((e,i)=><li key={i}><button type="button" onClick={()=>onOpenEpisode(Number(e.episodeNumber))}>依据：第 {e.episodeNumber} 集</button>「{e.quote}」</li>)}</ul>}
  </article>)}</div>
 </details>;
}
