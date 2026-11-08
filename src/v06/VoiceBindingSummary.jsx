import React from 'react';
import {entryVoiceCards} from '../../core/voiceBinding.js';
import {mediaSource} from '../../core/generationReferences.js';
export default function VoiceBindingSummary({snapshot,entry,decision}){
 const cards=entryVoiceCards(snapshot,entry);if(!cards.length)return null;
 const selected=cards.filter(c=>decision?.speakers?.some(s=>s.voiceUid===c.uid));
 return <section className="voice-binding-summary"><h3>对白音色 · {selected.length}</h3>{!Array.isArray(decision?.speakers)?<p>待核对本条讲话人物。</p>:!selected.length?<p>本条没有已关联的讲话音色。</p>:selected.map(c=><details key={c.uid}><summary>{c.name} · {c.pendingAudio?'已关联人物，待生成并采用音色':'已关联音色'}</summary><p>{decision.speakers.find(s=>s.voiceUid===c.uid).evidence}</p>{!c.pendingAudio&&<audio controls preload="none" src={mediaSource(c.reference)} style={{maxWidth:'100%'}}/>}</details>)}</section>;
}
