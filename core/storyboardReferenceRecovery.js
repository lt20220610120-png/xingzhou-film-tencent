import {generationReferenceKey,removeGenerationReference,matchBasicReferences} from './automaticReferences.js';
export function missingStoryboardReferences(value,baseline){const kept=new Set((value.references||[]).map(generationReferenceKey));return (baseline?.references||[]).filter(r=>!kept.has(generationReferenceKey(r)));}
export function restoreStoryboardReferences(value,baseline,keys){
 if(!baseline)return value;
 const missing=missingStoryboardReferences(value,baseline),requested=new Set(keys||missing.map(generationReferenceKey));
 const remaining=missing.filter(r=>!requested.has(generationReferenceKey(r)));
 const removed=missing.reduce((v,r)=>removeGenerationReference(v,generationReferenceKey(r)),baseline);
 if(value.prompt===removed.prompt||value.prompt===baseline.prompt){
  const recovered=remaining.reduce((v,r)=>removeGenerationReference(v,generationReferenceKey(r)),baseline);
  const extras=(value.references||[]).filter(r=>!(baseline.references||[]).some(b=>generationReferenceKey(b)===generationReferenceKey(r)));
  return {...value,prompt:recovered.prompt,references:[...recovered.references,...extras],autoReferenceOrder:recovered.autoReferenceOrder,autoReferenceExclusions:recovered.autoReferenceExclusions||[],autoReferenceSignature:null};
 }
 // Keep manually edited text; restore only the requested reference identities.
 const additions=missing.filter(r=>requested.has(generationReferenceKey(r)));
 const next=matchBasicReferences({...value,references:[...(value.references||[]),...additions],referenceBindingMode:undefined,autoReferenceSignature:null,autoReferenceExclusions:(value.autoReferenceExclusions||[]).filter(k=>!requested.has(k))},additions);
 return {...next,referenceBindingMode:value.referenceBindingMode};
}

export function rememberStoryboardRemoval(previous,next){
 const present=new Set((next.references||[]).map(generationReferenceKey));
 const removed=[...new Map([...(previous.storyboardRemovedReferences||[]),...(previous.references||[]).filter(r=>!present.has(generationReferenceKey(r))&&!(r.autoAssetImage&&next.references?.some(n=>n.autoAssetImage&&n.assetId===r.assetId)))].map(r=>[generationReferenceKey(r),r])).values()].filter(r=>!present.has(generationReferenceKey(r)));
 return {...next,storyboardRemovedReferences:removed,storyboardReferenceBaseline:removed.length?(previous.storyboardReferenceBaseline||{prompt:previous.prompt,references:previous.references||[]}):undefined};
}
export function storyboardRecoveryBaseline(shot,value,sceneReferences,linked){
 if(linked&&linked.referenceBindingMode!=='storyboard')return linked;
 const source=value.storyboardReferenceBaseline||shot.generationConfig?.storyboardReferenceBaseline;
 const baseline=source||linked||{prompt:shot.content||'',references:shot.generationConfig?.references??sceneReferences};
 const refs=[...new Map([...(baseline.references||[]),...(value.storyboardRemovedReferences||[])].map(r=>[generationReferenceKey(r),r])).values()];
 return {...value,prompt:baseline.prompt,references:refs};
}
