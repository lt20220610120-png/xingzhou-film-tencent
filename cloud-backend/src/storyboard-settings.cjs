const {recommendedStoryboardTiming,promptTimingMetadata}=require('./prompt-duration.cjs');
const keys=['profileId','model','ratio','duration','resolution','libtvMode','libtvParams'];
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const validSeconds=value=>Number.isFinite(value)&&value>0&&value<=3600;
function settingsFor(ep,label,shotId){
 const all=ep.storyboardDefaultSettings||{},scene=String(label||'').split('-').slice(0,2).join('-'),record=all.scenes?.[scene]||all.global;
 if(!record||shotId===undefined)return record;
 const settings={...record.settings,durationMode:record.durationMode==='recommended'?'recommended':'uniform'};
 if(settings.durationMode==='recommended'){
  delete settings.duration;
  settings.recommendedDurationSeconds=record.recommendedDurationSecondsByShot?.[shotId]??record.recommendedDurations?.[shotId]??null;
  if(validSeconds(record.recommendedDurations?.[shotId]))settings.duration=record.recommendedDurations[shotId];
 }
 return {...record,settings};
}
function timingForShot(ep,shot,proof){
 const own=recommendedStoryboardTiming({snapshot:{entries:(ep.prompts||[]).map(source=>({...source,prompt:source.content}))}},shot);
 if(proof!==undefined){
  const sourcePromptId=String(shot.sourcePromptId||shot.id||''),sourceContent=shot.sourceContent??shot.generationConfig?.bindingSourcePrompt??shot.content;
  if(!plain(proof)||!validSeconds(proof.recommendedDurationSeconds)||String(proof.sourcePromptId||'')!==sourcePromptId||typeof sourceContent!=='string'||!sourceContent.trim()||proof.sourceContent!==sourceContent)fail('建议时长来源已变更，请刷新核对',409);
  if(own&&proof.recommendedDurationSeconds!==own.recommendedDurationSeconds)fail('建议时长与已保存来源不一致，请刷新核对',409);
  return own||{...promptTimingMetadata(proof),sourcePromptId,sourceContent};
 }
 return own;
}
function applySettings(episodes,payload){
 const value=payload.settings,scope=payload.scope,mode=payload.durationMode||'uniform',recommended=mode==='recommended';
 if(!['project','episode','scene'].includes(scope)||!['uniform','recommended'].includes(mode)||typeof payload.revision!=='string'||!payload.revision||payload.revision.length>128||!plain(value)||!['profileId','model','ratio','resolution'].every(k=>typeof value[k]==='string'&&value[k].trim())||(value.libtvParams!==undefined&&!plain(value.libtvParams))||(value.libtvMode!==undefined&&typeof value.libtvMode!=='string')||(!recommended&&!validSeconds(value.duration)))fail('请补全生成参数和应用范围');
 const map=payload.recommendedDurations??{},sources=payload.recommendedDurationSources??{};
 if(recommended&&(!plain(map)||!plain(sources)||Object.keys(map).length>20000||Object.keys(sources).length>20000||Object.values(map).some(seconds=>!validSeconds(seconds))))fail('建议时长参数无效');
 if(scope==='scene'&&!/^\d+-\d+$/.test(payload.sceneId||''))fail('场景编号无效');
 const selected=episodes.filter(ep=>ep.kind!=='setting'&&ep.title!=='设定和小传'&&(scope==='project'||ep.id===payload.episodeId));
 const inScope=shot=>scope!=='scene'||String(shot.label||'').startsWith(payload.sceneId+'-');
 const ids=new Set(selected.flatMap(ep=>(ep.storyboardPrompts||ep.prompts||[]).filter(inScope).map(shot=>shot.id)));
 if(scope!=='project'&&!ids.size)fail('分集或场景已变更，请刷新',409);
 if(recommended&&[...Object.keys(map),...Object.keys(sources)].some(id=>!ids.has(id)))fail('建议时长包含范围外分镜');
 const settings=Object.fromEntries(keys.filter(k=>value[k]!==undefined&&(!recommended||k!=='duration')).map(k=>[k,structuredClone(value[k])]));
 for(const ep of selected){
  const shots=ep.storyboardPrompts||ep.prompts||[],approved={},known={},timings=new Map(),report={applied:[],missing:[],unsupported:[]};
  if(recommended)for(const shot of shots.filter(inScope)){
   const timing=timingForShot(ep,shot,sources[shot.id]),seconds=timing?.recommendedDurationSeconds;
   if(seconds===undefined){if(Object.hasOwn(map,shot.id))fail('建议时长缺少可核对来源',409);report.missing.push(shot.id);continue;}
   timings.set(shot.id,timing);known[shot.id]=seconds;
   if(Object.hasOwn(map,shot.id)){
    if(map[shot.id]!==seconds)fail('建议时长与已保存来源不一致，请刷新核对',409);
    approved[shot.id]=seconds;report.applied.push({shotId:shot.id,seconds});
   }else report.unsupported.push(shot.id);
  }
  const record={revision:payload.revision,settings,durationMode:mode,...(recommended?{recommendedDurations:approved,recommendedDurationSecondsByShot:known,recommendedDurationReport:report}:{})};
  const old=ep.storyboardDefaultSettings||{};
  ep.storyboardDefaultSettings=scope!=='scene'?{global:record,scenes:{}}:{...old,scenes:{...old.scenes,[payload.sceneId]:record}};
  ep.storyboardPrompts=structuredClone(shots).map(shot=>{
   if(!inScope(shot))return shot;
   const generationConfig={...shot.generationConfig,libtvMode:'auto',libtvParams:{},...settings,durationMode:mode,storyboardDefaultsRevision:record.revision};
   if(recommended){generationConfig.recommendedDurationSeconds=known[shot.id]??null;if(Object.hasOwn(approved,shot.id))generationConfig.duration=approved[shot.id];}
   else delete generationConfig.recommendedDurationSeconds;
   const timing=recommended?promptTimingMetadata(timings.get(shot.id)):{},edited=shot.sourceContent&&shot.content!==(shot.generationConfig?.bindingCompiledPrompt||shot.sourceContent);
   if(timing.recommendedDurationSeconds&&edited)timing.durationStatus='needs-review';
   return {...shot,...timing,generationConfig};
  });
  ep.storyboardWorkspacePolicy='published';
 }
 return episodes;
}
module.exports={applySettings,settingsFor,timingForShot};
