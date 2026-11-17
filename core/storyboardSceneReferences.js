import {projectReferenceCandidates,generationReferenceKey} from './automaticReferences.js';
import {isProjectGenerationReference,numberedReferences} from './generationReferences.js';

// Scene inventory deliberately ignores per-prompt decisions and exclusions.
// Use adopted images/voices only; an episode-wide upload is not a scene link.
export function storyboardSceneReferences({assets=[],media=[],binding,projectId,episode,scene}){
 if(!/^\d+-\d+$/.test(String(scene))||Number(String(scene).split('-')[0])!==Number(episode))return [];
 const snapshot=binding?.currentSnapshot||binding?.snapshot;
 const cards=(snapshot?.cards||[]).filter(c=>c.sceneIds?.includes(scene));
 const scoped=assets.filter(a=>(!a.projectId||a.projectId===projectId)&&(!a.project_id||a.project_id===projectId)&&(a.sceneIds?.includes(scene)||cards.some(c=>c.assetId===a.id)));
 const linkedAssets=scoped.map(a=>({...a,sceneIds:[scene]}));
 const sceneMedia=media.filter(m=>m.scene&&(String(m.scene)===scene||String(m.scene)===scene.split('-')[1]));
 const candidates=projectReferenceCandidates(linkedAssets,sceneMedia,projectId,episode,scene).filter(r=>r.assetAdopted!==false).map(r=>r.assetId?{...r,autoAssetImage:true}:r);
 const voices=(snapshot?.voiceCards||[]).filter(c=>c.sceneIds?.includes(scene)&&!c.pendingAudio).map(c=>({...c.reference,kind:'audio',name:c.reference?.name||c.name}));
 return [...new Map([...candidates,...voices].filter(r=>isProjectGenerationReference(r,projectId)&&(r.url||r.filePath)).map(r=>[generationReferenceKey(r),r])).values()];
}

export function importStoryboardSceneReferences(value,references,scene){
 const present=new Set((value.references||[]).map(generationReferenceKey));
 const additions=references.filter(r=>!present.has(generationReferenceKey(r))&&present.add(generationReferenceKey(r)));
 const imported=new Set(references.map(generationReferenceKey)),combined=[...(value.references||[]),...additions];
 // Appending preserves existing aliases and hand edits. Pin the resulting list
 // so loading per-prompt bindings cannot shrink this explicit scene selection.
 return {...value,references:combined,referenceBindingMode:'storyboard',bindingIssue:'',storyboardSceneImport:scene,
  autoReferenceOrder:numberedReferences(combined).map(r=>({key:generationReferenceKey(r),alias:r.alias})),autoReferenceSignature:null,
  autoReferenceExclusions:(value.autoReferenceExclusions||[]).filter(k=>!imported.has(k))};
}
