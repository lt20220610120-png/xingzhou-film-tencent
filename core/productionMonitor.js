import {listCollabEpisodes} from './collabEpisodes.js';
import {isReviewCurrent,reviewSceneSignature,reviewRoster,needsArtReviewDetails,sourceReviewScenes} from './artReview.js';
import {bindingHash,entryBindingSignature} from './promptArtBinding.js';
import {hasProductionAssociation} from './productionBindingState.js';
import {assetHasImages} from './assetImages.js';

/** One bulk snapshot, no model calls or per-scene I/O. Publication is an
 * acknowledged scene signature, not a workflow step label or card count. */
export function productionArtMonitor(project,ledger,binding,assets=[],previous){
 const entries=binding?.snapshot?.entries||[],decisions=binding?.decisions||{},rows=[];
 for(const ep of listCollabEpisodes(project.episodes)){
  const record=ledger?.episodes?.[ep.episodeNumber],current=isReviewCurrent(record,ep);
  const inventory=Boolean(record?.scenes?.length&&reviewRoster(record).length);
  // Old work is retained when the source changes. Never regenerate it implicitly.
  const changed=Boolean(inventory&&!current);
  const expected=sourceReviewScenes(ep);
  const scenes=expected.map(source=>{
   const savedScene=record?.scenes?.find(s=>s.id===source.id),scene=savedScene||source;
   const prompts=entries.filter(e=>e.sceneId===scene.id),bound=prompts.filter(e=>hasProductionAssociation(binding.snapshot,e,decisions[e.id]));
   const stale=bound.filter(e=>decisions[e.id].signature!==entryBindingSignature(binding.snapshot,e));
   const published=Boolean(savedScene&&current&&record.published?.[scene.id]?.signature===reviewSceneSignature(scene));
   const mapped=Boolean(scene.mappingReady||scene.items?.length),associated=bound.length>0;
   const signature=bindingHash([scene.source,reviewSceneSignature(scene),prompts.map(e=>[e.id,e.prompt,decisions[e.id]]),published]);
   const prior=previous?.episodes?.find(e=>e.number===ep.episodeNumber)?.scenes?.find(s=>s.id===scene.id);
   const details=(scene.items||[]).filter(needsArtReviewDetails).length;
   const reasons=[...(!prompts.length?['缺提示词']:[]),...(!mapped?['缺场景关联']:[]),...(!associated?['尚无提示词关联']:[]),...(!published?['未发布或清单已变更']:[]),...(stale.length?[`${stale.length} 条关联来源已变化，保留原选择`]:[]),...(details?[`${details} 项描述待完善`]:[])];
   return {id:scene.id,missingRecord:!savedScene,signature,unchanged:prior?.signature===signature,prompts:prompts.length,bound:bound.length,stale:stale.length,details,mapped,associated,published,complete:published&&associated,needsMapping:!mapped||!associated,reasons};
  });
  rows.push({number:ep.episodeNumber,inventory,changed,scenes,complete:!changed&&scenes.length>0&&scenes.every(s=>s.complete)});
 }
 const scenes=rows.flatMap(e=>e.scenes),pending=rows.filter(e=>!e.complete);
 return {schema:1,projectId:project.id,checkedAt:Date.now(),episodes:rows,summary:{episodes:rows.length,completedEpisodes:rows.filter(e=>e.complete).length,scenes:scenes.length,published:scenes.filter(s=>s.published).length,associated:scenes.filter(s=>s.associated).length,complete:scenes.filter(s=>s.complete).length,unchanged:scenes.filter(s=>s.unchanged).length,prompts:entries.length,bound:scenes.reduce((n,s)=>n+s.bound,0),assets:assets.length,images:assets.filter(assetHasImages).length},
  inventory:pending.filter(e=>!e.inventory).map(e=>e.number),
  mapping:pending.filter(e=>!e.changed&&e.inventory&&e.scenes.some(s=>s.needsMapping)).map(e=>e.number),
  pendingScenes:pending.filter(e=>!e.changed).flatMap(e=>e.scenes.filter(s=>!s.complete).map(s=>s.id)),
  warnings:rows.filter(e=>e.changed).map(e=>`第 ${e.number} 集正文与原清单不同，已保留成果；需明确确认如何处理。`)};
}
