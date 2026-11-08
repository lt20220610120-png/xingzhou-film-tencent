import {parseDirectorScenes,inferDirectorEpisodeNumber} from './scriptImport.js';
import {buildNumberedSceneTasks} from './directorCreative.js';
import {directorSettingsHash,sha256Text} from './directorQuickStore.js';
const hasContent=prompt=>Boolean(prompt.id&&String(prompt.content||'').replace(/^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\d+-\d+-\d+(?:\*\*|__)?\s*(?:\r?\n|$)/,'').trim()&&prompt.generationComplete!==false);

// Count the persisted, active scene edition that can actually be displayed.
// Episode.status is a historical activity label and cannot prove completeness.
export function directorPromptCoverage(project){
 const episodes=(project?.episodes||[]).filter(e=>e.kind!=='setting'&&e.title!=='设定和小传');
 return episodes.map((ep,i)=>{
  const number=inferDirectorEpisodeNumber(ep,i+1),scenes=parseDirectorScenes(ep.content||'',number).map(scene=>{
   const all=(ep.prompts||[]).filter(p=>String(p.label||'').startsWith(scene.label+'-'));
   const plan=(ep.quickScenePlans||[]).find(p=>p.id===ep.activeQuickScenePlanIds?.[scene.label]);
   const latest=all.filter(p=>p.generationRunId).at(-1)?.generationRunId;
   const current=plan?all.filter(p=>p.segmentationPlanId===plan.id):latest?all.filter(p=>p.generationRunId===latest):all;
   const source=Object.hasOwn(ep.quickSceneEdits||{},scene.label)?ep.quickSceneEdits[scene.label]:scene.content;
   const manual=buildNumberedSceneTasks(source,scene.label).map(p=>p.label);
   const labels=plan?.segments?.length?plan.segments.map((p,i)=>scene.label+'-'+(p.index||i+1)):
    /^\s*[（(]\d+[）)]\s*$/mu.test(source)?manual:Array.from({length:Math.max(1,...current.map(p=>Number(p.label.split('-').at(-1))||0))},(_,i)=>scene.label+'-'+(i+1));
   const missingLabels=labels.filter(label=>current.filter(p=>p.label===label&&hasContent(p)).length!==1);
   const count=labels.length-missingLabels.length;
   const stale=Boolean(ep.activeQuickScenePlanIds?.[scene.label]&&!plan||plan&&(plan.sourceSnapshot!==undefined&&plan.sourceSnapshot!==source||plan.settingsHash&&plan.settingsHash!==directorSettingsHash({project,episode:ep,maxDurationSeconds:plan.maxDurationSeconds}))||current.some(p=>p.sourceHash&&p.sourceHash!==sha256Text(source)));
   return {label:scene.label,count,expected:labels.length,missingLabels,stale,complete:!stale&&labels.length>0&&!missingLabels.length&&current.length===labels.length};
  });
  return {id:ep.id,number,scenes,prompts:(ep.prompts||[]).filter(p=>p.content?.trim()).length,count:scenes.reduce((n,s)=>n+s.count,0),expected:scenes.reduce((n,s)=>n+s.expected,0),complete:scenes.length>0&&scenes.every(s=>s.complete)};
 });
}
