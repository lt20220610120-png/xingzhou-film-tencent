import {buildNumberedSceneTasks} from './directorCreative.js';
import {normalizeVideoDurationLimit,pendingDurationEstimate,validatedDurationEstimate} from './videoDurationMetadata.js';

const eligible = prompt => typeof prompt.label==='string' && /^\d+-\d+-\d+$/.test(prompt.label) && prompt.generationComplete!==false && Boolean(prompt.content?.trim());
export function directorDurationTargets(project,{episodeId,sceneLabel,promptId,onlyPending=false,maxDurationSeconds}){
 const result=[];
 for(const episode of project.episodes||[]){
  if(episodeId&&episode.id!==episodeId)continue;
  const groups=new Map();
  for(const prompt of episode.prompts||[]){
   if(!eligible(prompt)||promptId&&prompt.id!==promptId||onlyPending&&prompt.durationEstimate?.status!=='pending')continue;
   const scene=prompt.sceneLabel||prompt.label.split('-').slice(0,-1).join('-');
   if(sceneLabel&&scene!==sceneLabel)continue;
   const active=episode.activeSceneGenerationRuns?.[scene]?.runId;
   if(active&&prompt.generationRunId!==active)continue;
   const limit=normalizeVideoDurationLimit(maxDurationSeconds??prompt.durationEstimate?.maxDurationSeconds??prompt.maxDurationSeconds);
   const key=JSON.stringify([scene,limit]);
   if(!groups.has(key))groups.set(key,{episodeId:episode.id,sceneLabel:scene,limit,prompts:[]});
   const plan=episode.quickScenePlans?.find(row=>row.id===prompt.segmentationPlanId);
   const segment=plan?.segments?.find(row=>row.id===prompt.segmentId);
   const script=prompt.durationSourceScript||(segment?plan.sourceText.slice(segment.sourceStart,segment.sourceEnd):'');
   groups.get(key).prompts.push({id:prompt.id,content:prompt.content,label:prompt.label,script});
  }
  result.push(...groups.values());
 }
 return result;
}

export function applyDirectorDurationResult(project,target,estimates){
 const episode=project.episodes?.find(row=>row.id===target.episodeId);
 const edits=new Map();
 for(const old of target.prompts){
  const current=episode?.prompts?.find(row=>row.id===old.id);
  const estimate=estimates.get(old.label);
  if(estimate&&current?.content===old.content){
   const {recommendedDurationSeconds,durationStatus,...body}=current;
   edits.set(old.id,{...body,...cardDuration(estimate,old.script),durationEstimatedAt:new Date().toISOString()});
  }
 }
 if(!edits.size)return project;
 const update=prompt=>edits.has(prompt.id)&&prompt.content===edits.get(prompt.id).content?edits.get(prompt.id):prompt;
 return {...project,updatedAt:new Date().toISOString(),
  episodes:project.episodes.map(row=>row===episode?{...row,prompts:row.prompts.map(update)}:row),
  promptHistory:project.promptHistory?.map(update),
 };
}

export const directorDurationPending=(maxDurationSeconds,code='AWAITING_ESTIMATE',message='提示词已保存，待精准估时。')=>
 pendingDurationEstimate(normalizeVideoDurationLimit(maxDurationSeconds),code,message);

function cardDuration(durationEstimate,durationSourceScript){
 const executable=durationEstimate.status==='estimated'&&!durationEstimate.needsResegment;
 return {durationEstimate,durationSourceScript,durationStatus:durationEstimate.status,
  ...(executable?{recommendedDurationSeconds:durationEstimate.recommendedSeconds}:{})};
}

export function directorRunDurationScript(run,label,segment){
 if(segment)return run.plan.sourceText.slice(segment.sourceStart,segment.sourceEnd);
 return buildNumberedSceneTasks(run.snapshot.sourceSnapshot,run.snapshot.sceneLabel,{includeShared:false}).find(row=>row.label===label)?.input||'';
}

export function directorDurationForCard(run,label,source){
 if(!run.durationEstimateEnabled)return {};
 return cardDuration(run.durationEstimates?.[label]||directorDurationPending(run.snapshot.maxDurationSeconds),source);
}

export function directorDurationSegments(run){
 if(run.kind==='manual-scene')return run.prompts.map(prompt=>({id:prompt.label,prompt:prompt.content,script:directorRunDurationScript(run,prompt.label)}));
 return run.plan.segments.map(segment=>{
  const {label,content}=run.segmentDrafts[segment.id].prompt;
  return {id:label,prompt:content,script:directorRunDurationScript(run,label,segment)};
 });
}

export async function estimateDirectorRun({run,estimateScene,persist,assertCurrent}){
 if(!estimateScene||run.durationEstimates)return;
 const segments=directorDurationSegments(run),limit=normalizeVideoDurationLimit(run.snapshot.maxDurationSeconds);
 if(run.durationEstimateDispatched){
  // A crash or stop may have happened after forwarding a paid estimate. Do
  // not automatically send it twice. The prompt body is already recoverable.
  run.durationEstimates=Object.fromEntries(segments.map(({id})=>[id,directorDurationPending(limit,'INTERRUPTED','上次估时未确认，点击补估继续。')]));
  await persist(run);return;
 }
 await assertCurrent();
 const taskId=`director-duration-${run.id}-${crypto.randomUUID()}`;
 run.phase='estimating';run.pendingRequestId=taskId;run.durationEstimateDispatched=true;
 await persist(run);await assertCurrent();
 let estimates;
 try{estimates=await estimateScene({segments,maxDurationSeconds:limit,snapshot:run.snapshot,taskId});}
 catch{estimates=new Map();}
 await assertCurrent();
 run.pendingRequestId=null;
 run.durationEstimates=Object.fromEntries(segments.map(({id})=>[id,validatedDurationEstimate(estimates?.get(id))||directorDurationPending(limit,'ESTIMATE_UNAVAILABLE','估时未完成，点击补估继续。')]));
 run.durationEstimatedAt=new Date().toISOString();
 await persist(run);
}
