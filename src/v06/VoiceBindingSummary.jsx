import React from 'react';
import {entryVoiceCards} from '../../core/voiceBinding.js';
import {mediaSource} from '../../core/generationReferences.js';
export default function VoiceBindingSummary({snapshot,entry,decision}){
 const cards=entryVoiceCards(snapshot,entry);if(!cards.length)return null;
 const selected=cards.filter(c=>decision?.speakers?.some(s=>s.voiceUid===c.uid));
 return <section className="voice-binding-summary"><h3>正常对白音色 · {selected.length}</h3>{!Array.isArray(decision?.speakers)?<p>待 AI 判断本条讲话人物，重新分发时会一起核对。</p>:!selected.length?<p>本条没有需要发送的人物音色。</p>:selected.map(c=><details key={c.uid}><summary>{c.name} · 已关联音色</summary><p>{decision.speakers.find(s=>s.voiceUid===c.uid).evidence}</p><audio controls preload="none" src={mediaSource(c.reference)} style={{maxWidth:'100%'}}/></details>)}<small>其余 {cards.length-selected.length} 条音频本条不发送。视频模型容量不足时仅发送支持的数量。</small></section>;
}
