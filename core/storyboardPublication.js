import {compileEntryBinding} from './promptArtBinding.js';
import {promptTimingMetadata} from './promptDisplay.js';
import {savedStoryboardTiming,storyboardDurationMode,storyboardDurationPolicy,storyboardDurationSelection,storyboardEstimateIssue,storyboardRecommendationLimit} from './storyboardTiming.js';
import {savedDurationEstimate} from './videoDurationMetadata.js';

export const storyboardShots=episode=>episode.storyboardPrompts||episode.prompts||[];
export function storyboardPublicationPayload(snapshot,decisions,entries){
 return {operation:'publish',episodeNumber:entries[0].episode,sceneIds:[...new Set(entries.map(e=>e.sceneId))],publicationId:crypto.randomUUID(),versionId:snapshot.versionId,
  prompts:entries.map(entry=>{const compiled=compileEntryBinding(snapshot,entry,decisions[entry.id],{preview:true,storyboardSlots:true});return {id:entry.id,label:entry.label,content:entry.prompt,...promptTimingMetadata(entry),generationConfig:{...compiled,prompt:undefined,referenceBindingMode:'storyboard',bindingIssue:'',bindingSourcePrompt:entry.prompt,bindingCompiledPrompt:compiled.prompt,bindingExpectedReferences:compiled.references.map(r=>r.id),bindingAssetIds:[...new Set((decisions[entry.id]?.needs||[]).filter(n=>n.visibility==='visible').map(n=>snapshot.cards.find(c=>c.uid===n.cardUid)?.assetId).filter(Boolean))],bindingAssets:snapshot.cards.filter(c=>(decisions[entry.id]?.needs||[]).some(n=>n.visibility==='visible'&&n.cardUid===c.uid)).map(c=>({assetId:c.assetId||null,name:c.name,category:c.category})),bindingSourcePromptId:entry.id,bindingVersionId:snapshot.versionId}};})};
}
// This route authorizes the saved storyboard, never the changing director draft.
// Cloud membership/lock checks and the normal generation license still apply.
export async function validateStoryboardSubmission({getProject,value,accountId,resolveDurationPolicy}){
 if(!accountId)throw Error('请先登录');
 const project=await getProject({projectId:value.projectId});
 if(!['producer','collaborator','artist_collaborator'].includes(project?.myRole)||project.locked||project.is_locked||String(project.genre||'').includes('[PROJECT_LOCKED]'))throw Error('项目已锁定或没有编辑权限');
 const episode=(project.episodes||[]).find(ep=>storyboardShots(ep).some(s=>s.id===value.shotId));
 const shot=episode&&storyboardShots(episode).find(s=>s.id===value.shotId);
 if(!shot)throw Error('分镜不存在，请刷新项目');
 if((shot.storyboardPublicationId||'')!==(value.storyboardPublicationId||''))throw Error('清单已发布新版本，请刷新项目');
 const timing=savedStoryboardTiming(episode,shot),estimate=savedDurationEstimate(timing),configuration=shot.generationConfig||{};
 const mode=storyboardDurationMode(configuration);
 if(estimate||mode!=='legacy'){
  const issue=mode==='uniform'?'':storyboardEstimateIssue(timing);
  if(issue)throw Error(issue);
  // Authorization alone does not establish that a queued or old renderer is
  // still submitting the words covered by the latest estimate.
  if(value.originalPrompt!==shot.content)throw Error('分镜正文已变化，请刷新并核对时长');
  const seconds=Number(value.duration);
  if(mode==='legacy'||mode==='recommended'&&(estimate||configuration.durationAlignment==='ceil')){
   const maximum=mode==='recommended'?storyboardRecommendationLimit(timing):estimate.maxDurationSeconds;
   if(!Number.isInteger(seconds)||seconds<1||seconds>maximum)throw Error(`执行时长超出 ${maximum} 秒档限制`);
  }
  if(mode==='legacy')return {references:value.references||[]};
  if(['profileId','model','resolution'].some(key=>configuration[key]&&(key!=='resolution'||configuration[key]!=='固定')&&configuration[key]!==value[key]))throw Error('已保存的模型或分辨率已变化，请刷新核对时长');
  if(mode==='uniform'&&seconds!==Number(configuration.duration))throw Error('执行时长与已保存的时长不符，请刷新分镜');
  const caps=value.modelCapabilities||{};
  const policy=resolveDurationPolicy?await resolveDurationPolicy(value,configuration):storyboardDurationPolicy(caps,caps,value.resolution);
  const selection=storyboardDurationSelection({value:configuration,timing,policy,fallback:seconds});
  if(mode==='uniform'&&selection.issue)throw Error(selection.issue);
  if(mode==='recommended'&&(selection.issue||seconds!==selection.duration))throw Error('执行时长与已保存的建议和当前模型档位不符，请重新按建议时长设置');
 }
 return {references:value.references||[]};
}
