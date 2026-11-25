const {isDeepStrictEqual}=require('node:util');
const {recommendedStoryboardTiming,promptTimingMetadata,validatedDurationEstimate,markStoryboardTimingStale}=require('./prompt-duration.cjs');
const {storyboardTimingIdentity,usingDirectorStoryboardTiming}=require('../shared/storyboard-timing.cjs');
const keys=['profileId','model','ratio','duration','resolution','libtvMode','libtvParams','libtvSubmissionMode'];
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const validSeconds=value=>Number.isFinite(value)&&value>0&&value<=3600;
const validModelSeconds=value=>validSeconds(value)&&Number.isInteger(value);
const maxRecommendedSeconds=timing=>timing?.durationEstimate?.maxDurationSeconds??(timing?.maxDurationSeconds>0&&timing.maxDurationSeconds<=15?15:30);
const commonSettings=({duration,durationAlignment,...settings})=>settings;
const generationDefaults=(config,settings)=>({libtvMode:'auto',libtvParams:{},...(config?.libtvSubmissionMode?{libtvSubmissionMode:'auto'}:{}),...settings});
function settingsFor(ep,label,shotId){
 const all=ep.storyboardDefaultSettings||{},scene=String(label||'').split('-').slice(0,2).join('-'),record=all.scenes?.[scene]||all.global;
 if(!record||shotId===undefined)return record;
 const skipped=record.recommendedDurationReport?.skipped;
 if(Array.isArray(skipped)&&skipped.includes(shotId))return undefined;
 if(record.recommendedDurationReport?.manual?.includes(shotId))return {...record,settings:record.manualDurationProtection==='duration-only'?commonSettings(record.settings):{}};
 const settings={...record.settings,durationMode:record.durationMode==='recommended'?'recommended':'uniform'};
 if(settings.durationMode==='recommended'){
  delete settings.duration;
  settings.recommendedDurationSeconds=record.recommendedDurationSecondsByShot?.[shotId]??record.recommendedDurations?.[shotId]??null;
  if(validSeconds(record.recommendedDurations?.[shotId]))settings.duration=record.recommendedDurations[shotId];
 }
 return {...record,settings};
}
function timingForShot(ep,shot,proof){
 const own=recommendedStoryboardTiming(null,shot,ep.prompts);
 if(proof!==undefined){
  const {sourcePromptId,sourceContent}=storyboardTimingIdentity(shot);
  const provided=plain(proof)&&validatedDurationEstimate(proof.durationEstimate);
  if(!plain(proof)||(!provided&&!validSeconds(proof.recommendedDurationSeconds))||String(proof.sourcePromptId||'')!==sourcePromptId||typeof sourceContent!=='string'||!sourceContent.trim()||proof.sourceContent!==sourceContent)fail('建议时长来源已变更，请刷新核对',409);
  if(provided&&own?.durationEstimate&&!isDeepStrictEqual(provided,own.durationEstimate))fail('建议时长与已保存来源不一致，请刷新核对',409);
  if(!provided&&own&&proof.recommendedDurationSeconds!==own.recommendedDurationSeconds)fail('建议时长与已保存来源不一致，请刷新核对',409);
  if((!provided&&own)||own?.durationEstimate)return own;
  const timing={...promptTimingMetadata(proof),sourcePromptId,sourceContent};
  return usingDirectorStoryboardTiming(shot,sourceContent)?timing:markStoryboardTimingStale(timing);
 }
 return own;
}

function alignedSeconds(recommended,options,range,limit){
 const floor=Math.max(1,range?.min??1),ceiling=Math.min(limit??3600,range?.max??3600);
 const actual=options?Math.min(...options.filter(seconds=>seconds>=Math.max(recommended,floor)&&seconds<=ceiling)):Math.max(Math.ceil(recommended),floor);
 return actual<=ceiling?actual:null;
}

function blockedTiming(timing,shot,modern){
 if(timing?.durationEstimate?.status==='pending')return 'pending';
 if(timing?.durationEstimate?.status==='needs-review'||modern&&(timing?.durationStatus??shot.durationStatus)==='needs-review')return 'needs-review';
 if(timing?.durationEstimate?.needsResegment)return 'overload';
 return null;
}

function applySettings(episodes,payload){
 const value=payload.settings,scope=payload.scope,mode=payload.durationMode||'uniform',recommended=mode==='recommended';
 if(!['project','episode','scene'].includes(scope)||!['uniform','recommended'].includes(mode)||typeof payload.revision!=='string'||!payload.revision||payload.revision.length>128||!plain(value)||!['profileId','model','ratio','resolution'].every(k=>typeof value[k]==='string'&&value[k].trim())||(value.libtvParams!==undefined&&!plain(value.libtvParams))||(value.libtvMode!==undefined&&typeof value.libtvMode!=='string')||(!recommended&&!validSeconds(value.duration)))fail('请补全生成参数和应用范围');
 if(value.libtvSubmissionMode!==undefined&&!['auto','canvas'].includes(value.libtvSubmissionMode))fail('LibTV 提交方式无效');
 const map=payload.recommendedDurations??{},sources=payload.recommendedDurationSources??{};
 if(recommended&&(!plain(map)||!plain(sources)||Object.keys(map).length>20000||Object.keys(sources).length>20000||Object.values(map).some(seconds=>!validSeconds(seconds))))fail('建议时长参数无效');
 if(scope==='scene'&&!/^\d+-\d+$/.test(payload.sceneId||''))fail('场景编号无效');
 const modern=recommended&&(Object.hasOwn(payload,'supportedDurations')||Object.hasOwn(payload,'durationRange'));
 const options=payload.supportedDurations??null,range=payload.durationRange;
 if(modern&&((options!==null&&(!Array.isArray(options)||options.length===0||options.length>3600||!options.every(validModelSeconds)))
  ||(range!==undefined&&(!plain(range)||!validModelSeconds(range.min)||!validModelSeconds(range.max)||range.min>range.max))))fail('模型支持的时长档位无效');
 if(recommended&&payload.includeManualDuration!==undefined&&typeof payload.includeManualDuration!=='boolean')fail('手调时长重置选项无效');
 const selected=episodes.filter(ep=>ep.kind!=='setting'&&ep.title!=='设定和小传'&&(scope==='project'||ep.id===payload.episodeId));
 const inScope=shot=>scope!=='scene'||String(shot.label||'').startsWith(payload.sceneId+'-');
 const ids=new Set(selected.flatMap(ep=>(ep.storyboardPrompts||ep.prompts||[]).filter(inScope).map(shot=>shot.id)));
 if(scope!=='project'&&!ids.size)fail('分集或场景已变更，请刷新',409);
 const excludedIds=payload.excludedShotIds??[];
 if(!Array.isArray(excludedIds)||excludedIds.length>20000||excludedIds.some(id=>!recommended||typeof id!=='string'||!ids.has(id)||Object.hasOwn(map,id)||Object.hasOwn(sources,id)))fail('跳过的分镜不在所选范围或包含时长参数');
 const excluded=new Set(excludedIds);
 if(recommended&&[...Object.keys(map),...Object.keys(sources)].some(id=>!ids.has(id)))fail('建议时长包含范围外分镜');
 const settings={...Object.fromEntries(keys.filter(k=>value[k]!==undefined&&(!recommended||k!=='duration')).map(k=>[k,structuredClone(value[k])])),...(modern?{durationAlignment:'ceil'}:{})};
 const manualSettings=commonSettings(settings);
 for(const ep of selected){
  const shots=ep.storyboardPrompts||ep.prompts||[],approved={},known={},timings=new Map(),report={applied:[],missing:[],unsupported:[],aligned:[],manual:[],blocked:[],skipped:[]},reset=[];
  if(recommended)for(const shot of shots.filter(inScope)){
   if(excluded.has(shot.id)){report.skipped.push(shot.id);continue;}
   const manual=shot.generationConfig?.durationManuallyAdjusted===true;
   if(manual&&!payload.includeManualDuration){report.manual.push(shot.id);continue;}
   const timing=timingForShot(ep,shot,sources[shot.id]),seconds=timing?.recommendedDurationSeconds;
   const blocked=blockedTiming(timing,shot,modern);
   if(blocked){
    if(Object.hasOwn(map,shot.id))fail('估时状态已变化，请刷新后重新应用',409);
    if(timing)timings.set(shot.id,blocked==='needs-review'?markStoryboardTimingStale(timing):timing);
    if(manual)report.manual.push(shot.id);
    report.blocked.push({shotId:shot.id,code:blocked});continue;
   }
   if(timing)timings.set(shot.id,timing);
   if(seconds===undefined){if(Object.hasOwn(map,shot.id))fail('建议时长缺少可核对来源',409);if(manual)report.manual.push(shot.id);report.missing.push(shot.id);continue;}
   known[shot.id]=seconds;
   const actual=modern?alignedSeconds(seconds,options,range,maxRecommendedSeconds(timing)):Object.hasOwn(map,shot.id)?seconds:null;
   if(Object.hasOwn(map,shot.id)&&map[shot.id]!==actual)fail('建议时长与已保存来源或模型档位不一致，请刷新核对',409);
   if(actual===null){if(manual)report.manual.push(shot.id);report.unsupported.push(shot.id);continue;}
   approved[shot.id]=actual;report.applied.push({shotId:shot.id,seconds:actual});
   if(actual!==seconds)report.aligned.push({shotId:shot.id,recommendedSeconds:seconds,seconds:actual});
   if(manual)reset.push(shot.id);
  }
  const record={revision:payload.revision,settings,durationMode:mode,...(recommended?{manualDurationProtection:'duration-only',recommendedDurations:approved,recommendedDurationSecondsByShot:known,recommendedDurationReport:report,...(reset.length?{durationManualResetShotIds:reset}:{})}:{})};
  const old=ep.storyboardDefaultSettings||{};
  ep.storyboardDefaultSettings=scope!=='scene'?{global:record,scenes:{}}:{...old,scenes:{...old.scenes,[payload.sceneId]:record}};
  ep.storyboardPrompts=structuredClone(shots).map(shot=>{
   if(!inScope(shot)||excluded.has(shot.id))return shot;
   const keepManual=report.manual.includes(shot.id);
   const generationConfig={...shot.generationConfig,...generationDefaults(shot.generationConfig,keepManual?manualSettings:settings),...(keepManual?{}:{durationMode:mode}),storyboardDefaultsRevision:record.revision};
   if(keepManual)return {...shot,generationConfig};
   if(recommended){generationConfig.recommendedDurationSeconds=known[shot.id]??null;if(Object.hasOwn(approved,shot.id))generationConfig.duration=approved[shot.id];}
   else delete generationConfig.recommendedDurationSeconds;
   if(!modern)delete generationConfig.durationAlignment;
   if(!recommended||reset.includes(shot.id))delete generationConfig.durationManuallyAdjusted;
   const source=timings.get(shot.id),timing=recommended?promptTimingMetadata(source):{};
   const next={...shot,...timing,...(source?.durationEstimateSource?{durationEstimateSource:source.durationEstimateSource}:{}),generationConfig};
   if(timing.durationEstimate&&timing.recommendedDurationSeconds===undefined)delete next.recommendedDurationSeconds;
   return next;
  });
  ep.storyboardWorkspacePolicy='published';
 }
 return episodes;
}
module.exports={applySettings,settingsFor,timingForShot,alignedSeconds,generationDefaults};
