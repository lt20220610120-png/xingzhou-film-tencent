const path=require('node:path');
const {createStoryboardBatchQueue,existingTask}=require('./storyboard-batch.cjs');
const locked=p=>!['producer','collaborator','artist_collaborator'].includes(p?.myRole)||p.locked||p.is_locked||String(p.genre||'').includes('[PROJECT_LOCKED]');
const durationModes=['recommended','uniform'];
const valueKeys=['storyboardDefaultsRevision','durationMode','durationAlignment','durationManuallyAdjusted','recommendedDurationSeconds','profileId','model','ratio','duration','resolution','libtvMode','libtvParams','libtvSubmissionMode','prompt','references','autoReferenceExclusions','autoReferenceOrder','autoReferenceSignature','bindingSourcePrompt','bindingCompiledPrompt','bindingExpectedReferences','bindingAssets','bindingAssetIds','bindingVersionId','bindingSourcePromptId','referenceBindingMode','storyboardPublicationId'];
const missingDurationMode=(saved,value)=>durationModes.includes(saved?.durationMode)&&!durationModes.includes(value.durationMode);
function createStoryboardBatchHost({directory,owner,license,getProject,listMedia,listJobs,getState,schema,patchShot,submit}){
 const check=async r=>{if(String(owner())!==r.accountId)throw Error('账号已变化');await license();const p=await getProject({projectId:r.projectId});if(locked(p))throw Error('项目已锁定或没有编辑权限');if(String(owner())!==r.accountId)throw Error('账号已变化');return p;};
 const queue=createStoryboardBatchQueue({directory,owner,loadJobs:listJobs,guard:async(run,input)=>{const project=await check(run);if(input?.shotId){const shot=project.episodes.flatMap(e=>e.storyboardPrompts||e.prompts||[]).find(s=>s.id===input.shotId);if(!shot||(shot.storyboardPublicationId||'')!==(input.storyboardPublicationId||''))throw Error('分镜发布版本已变化，未提交生成');}return project;},submit:async(item,run,signal)=>{
  const project=await check(run),ep=project.episodes.find(e=>e.id===item.episodeId),shot=(ep?.storyboardPrompts||ep?.prompts||[]).find(s=>s.id===item.shotId);
  if(!shot||(shot.storyboardPublicationId||'')!==item.publicationId||shot.content!==item.baseContent||JSON.stringify(shot.generationConfig||{})!==JSON.stringify(item.baseGenerationConfig||{}))throw Error('分镜已变更，请重新加入队列');
  if(missingDurationMode(shot.generationConfig,item.value))throw Error('分镜时长模式已变化，请重新加入队列');
  const {storyboardGenerationInput}=await import('../core/storyboardBatch.js'),{storyboardSaveUpdates}=await import('../core/promptAssetUsage.js');
  const {cleanStoryboardReferenceValue}=await import('../core/storyboardReferences.js');
  const {savedStoryboardTiming}=await import('../core/storyboardTiming.js');
  item.value=cleanStoryboardReferenceValue(item.value,run.projectId);
  const input=await storyboardGenerationInput({state:await getState(),value:item.value,shot:savedStoryboardTiming(ep,shot),getLibTVModel:model=>schema(run.accountId,model)});
  item.value={...item.value,prompt:input.originalPrompt,duration:input.duration};
  await queue.assertDispatch({storyboardBatchRunId:run.id});
  const savedProject=await patchShot({projectId:run.projectId,episodeId:item.episodeId,shotId:item.shotId,editPolicy:'direct',requireExactBase:true,storyboardPublicationId:item.publicationId,...(!ep.storyboardPrompts?{promptEditionId:ep.promptEditionId||'legacy'}:{}),base:{content:shot.content,generationConfig:shot.generationConfig},updates:storyboardSaveUpdates({...item.value,referenceBindingMode:'storyboard'})});
  const acknowledged=storyboardSaveUpdates({...item.value,referenceBindingMode:'storyboard'}),savedShot=(savedProject?.episodes||[]).flatMap(ep=>ep.storyboardPrompts||ep.prompts||[]).find(s=>s.id===item.shotId);item.baseContent=savedShot?.content??acknowledged.content;item.baseGenerationConfig=savedShot?.generationConfig??acknowledged.generationConfig;
  await check(run);await queue.assertDispatch({storyboardBatchRunId:run.id});
  signal.throwIfAborted();
  return submit({...input,storyboardEdit:true,storyboardPublicationId:item.publicationId,projectId:run.projectId,episode:item.episode,scene:item.scene,shotId:item.shotId,shotLabel:item.label,storyboardBatchRunId:run.id,storyboardBatchItemId:item.id},signal);
 }});
 return {...queue,async start(payload){
  const accountId=String(owner()||'');if(!accountId||payload.accountId!==accountId)throw Error('账号已变化');
  const project=await check({accountId,projectId:payload.projectId});if(!['scene','episode','project'].includes(payload.scope)||!Array.isArray(payload.items)||payload.items.length>20000)throw Error('批量范围无效');
  const {inferDirectorEpisodeNumber}=await import('../core/scriptImport.js');const allowed=new Map();
  for(const [index,ep] of project.episodes.entries()){if(ep.kind==='setting'||ep.title==='设定和小传'||payload.scope!=='project'&&ep.id!==payload.episodeId)continue;for(const shot of ep.storyboardPrompts||ep.prompts||[]){const scene=String(shot.label||'').split('-').slice(0,2).join('-');if(payload.scope==='scene'&&scene!==payload.sceneId)continue;allowed.set(shot.id,{shot,ep,episode:inferDirectorEpisodeNumber(ep,index+1),scene});}}
  const media=await listMedia({projectId:project.id}),jobs=listJobs();
  const {savedStoryboardTiming,storyboardDurationMode,storyboardDurationSelection,storyboardEstimateIssue,storyboardTimingForDraft}=await import('../core/storyboardTiming.js');
  const blockers=[];
  const items=payload.items.map(item=>{const row=allowed.get(item.shotId);if(!row)throw Error('分镜不在所选范围');const skip=existingTask(jobs,project.id,item.shotId)||media.some(m=>m.kind==='video'&&(m.note?.includes(`[shot:${item.shotId}]`)||m.note===row.shot.label));if(!skip&&(item.baseContent!==(row.shot.content||'')||JSON.stringify(item.baseGenerationConfig||{})!==JSON.stringify(row.shot.generationConfig||{})))throw Error('分镜已被修改，请刷新核对后再批量生成');const value=Object.fromEntries(valueKeys.filter(k=>item.value?.[k]!==undefined).map(k=>[k,structuredClone(item.value[k])]));if(!skip&&(typeof value.prompt!=='string'||!value.prompt.trim()||!Array.isArray(value.references)||value.references.length>256))throw Error('分镜正文或素材无效');if(!skip&&(row.shot.storyboardPublicationId||'')!==(item.publicationId||''))throw Error('分镜发布版本已变化');
   return {shotId:row.shot.id,episodeId:row.ep.id,publicationId:row.shot.storyboardPublicationId||'',baseContent:row.shot.content||'',baseGenerationConfig:structuredClone(row.shot.generationConfig||{}),episode:row.episode,scene:row.scene,label:row.shot.label,value:skip?{}:value,skip};});
  if(new Set(items.map(i=>i.shotId)).size!==allowed.size)throw Error('批量范围已变化，请重新选择');
  const needsModel=[];
  for(const {shotId,value,label,skip} of items){
   if(skip)continue;
   const {ep,shot}=allowed.get(shotId),mode=storyboardDurationMode(value);
   const timing=storyboardTimingForDraft(savedStoryboardTiming(ep,shot),value);
   const issue=missingDurationMode(shot.generationConfig,value)?'分镜时长模式已变化，请刷新核对':mode==='uniform'?'':storyboardEstimateIssue(timing);
   if(issue)blockers.push(`${label} ${issue}`);
   else if(mode!=='legacy')needsModel.push({label,value,timing});
  }
  if(!blockers.length&&needsModel.length){
   const {storyboardGenerationModel}=await import('../core/storyboardBatch.js');
   const state=await getState(),schemas=new Map(),getLibTVModel=model=>{
    if(!schemas.has(model))schemas.set(model,schema(accountId,model));
    return schemas.get(model);
   };
   for(const {label,value,timing} of needsModel){
    const {durationPolicy:policy,fallback}=await storyboardGenerationModel({state,value,getLibTVModel});
    const {issue}=storyboardDurationSelection({value,timing,policy,fallback});
    if(issue)blockers.push(`${label} ${issue}`);
   }
  }
  if(blockers.length)throw Error(`有 ${blockers.length} 条分镜需处理时长，批量生成未启动。${blockers.slice(0,3).join('；')}`);
  await check({accountId,projectId:project.id});return queue.start({accountId,projectId:project.id,scope:payload.scope,items});
 }};
}
module.exports={createStoryboardBatchHost};
