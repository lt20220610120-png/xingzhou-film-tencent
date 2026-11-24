import React from 'react';
import {createRoot} from 'react-dom/client';
import DurationEstimateBadge from '../../src/v06/DurationEstimateBadge.jsx';
import {durationCapacity,pendingDurationEstimate} from '../../core/videoDurationMetadata.js';

function estimated(naturalSeconds,maxDurationSeconds){
 const capacity=durationCapacity(naturalSeconds,maxDurationSeconds);
 return {version:'2.0.0',status:'estimated',maxDurationSeconds,naturalSeconds,...capacity,
  breakdown:{speechSeconds:naturalSeconds-2,nonparallelActionSeconds:1,pauseBufferSeconds:0.8},
  reason:capacity.needsResegment?'先做动作再说对白；需重新划分片段并重新生成提示词。':'对白与看屏并行，保留收尾气口。'};
}
const normal=estimated(11,30),tight=estimated(34,30),short=estimated(17,15),over=estimated(36,30);
const pending=pendingDurationEstimate(30,'SOURCE_CONFLICT','剧本与提示词都未确定是否朗读。');
const cards=[normal,tight,short,over,pending,{...normal,status:'needs-review'}];
window.reestimated=[];
createRoot(document.getElementById('root')).render(<main style={{display:'grid',justifyContent:'end',gap:20,padding:12}}>
 {cards.map((durationEstimate,index)=><section style={{maxWidth:270}} key={index} data-estimate={index}>
  <DurationEstimateBadge value={{durationEstimate,recommendedDurationSeconds:99}} onReestimate={()=>window.reestimated.push(index)}/>
 </section>)}
 <section data-estimate="historical"><DurationEstimateBadge value={{recommendedDurationSeconds:35,maxDurationSeconds:35}}/></section>
</main>);
