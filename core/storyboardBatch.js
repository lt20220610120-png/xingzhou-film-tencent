import {storyboardShots} from './storyboardPublication.js';
import {inferDirectorEpisodeNumber} from './scriptImport.js';
import {storyboardPromptValue,canRefreshStoryboardBinding} from './promptAssetUsage.js';
import {cleanStoryboardReferenceValue,projectStoryboardImageAliases} from './storyboardReferences.js';
import {applyStoryboardDefaults,storyboardSettingKeys,rebaseStoryboardDefaultsDraft,rebaseLocalStoryboardDraft,storyboardDraftKey,hasUnsavedStoryboardTimingEdit} from './storyboardDefaults.js';
import {projectReferenceCandidates,matchBasicReferences} from './automaticReferences.js';
import {generationMediaProfiles,activeMediaProfile,videoModelCapabilities,isFeituoEndpoint} from './canvasStore.js';
import {profileModels} from './videoCatalog.js';
import {effectiveVideoProtocol} from './videoProviderConfig.js';
import {referencePolicy} from './promptBook.js';
import {normalizeCapabilities} from './modelCapabilities.js';
import {validateCompiledBinding} from './promptArtBinding.js';
import {bindReferencePrompt} from './generationReferences.js';
import {assertMinimumReferenceImages,selectAudioReferences} from './audioReferenceSelection.js';
import {libtvGenerationParams} from './libtv.js';
import {savedStoryboardTiming,storyboardDurationMode,storyboardDurationPolicy,storyboardDurationSelection,storyboardTimingForDraft} from './storyboardTiming.js';
export function storyboardBatchItems({project,scope,episodeId,sceneId,settings={},assets=[],media=[],binding,accountId,readDraft=()=>null,skipUnavailable=false}){
 if(!['scene','episode','project'].includes(scope))throw Error('请选择生成范围');
 const top=Object.fromEntries(storyboardSettingKeys.filter(k=>settings[k]!==undefined).map(k=>[k,settings[k]]));
 return (project.episodes||[]).flatMap((ep,index)=>{
  if(ep.kind==='setting'||ep.title==='设定和小传'||scope!=='project'&&ep.id!==episodeId)return [];
  const episode=inferDirectorEpisodeNumber(ep,index+1);
  return storyboardShots(ep).flatMap(shot=>{
   const scene=String(shot.label||'').split('-').slice(0,2).join('-');if(scope==='scene'&&scene!==sceneId)return [];
   const stored=readDraft(storyboardDraftKey(project.id,shot)),defaults=ep.storyboardDefaultSettings?.scenes?.[scene]||ep.storyboardDefaultSettings?.global,draft=rebaseLocalStoryboardDraft(rebaseStoryboardDefaultsDraft(stored,shot,defaults),shot,project);
   if(skipUnavailable&&hasUnsavedStoryboardTimingEdit(shot,draft))return [{shotId:shot.id,label:shot.label,skipUnsavedDraft:true}];
   const refs=projectReferenceCandidates(assets,media,project.id,episode,scene,{assetImageSlots:true,includeEmptyAssetSlots:true});
   let value=cleanStoryboardReferenceValue(draft?.value||{...shot.generationConfig,prompt:shot.content||'',references:shot.generationConfig?.references||refs},project.id);
   value=applyStoryboardDefaults(value,ep.storyboardDefaultSettings?.scenes?.[scene]||ep.storyboardDefaultSettings?.global,shot.id);
   if(!draft||canRefreshStoryboardBinding(draft,shot)){const linked=storyboardPromptValue(binding,shot,value,accountId);if(linked&&!(linked.referenceBindingMode==='pending'&&!linked.references?.length&&value.references?.length))value=linked;}
   value=cleanStoryboardReferenceValue(value,project.id);
   const selectedSettings={...top};if(storyboardDurationMode(value)!=='legacy')delete selectedSettings.duration;
   value={...value,...selectedSettings,referenceBindingMode:'storyboard',bindingIssue:'',storyboardPublicationId:shot.storyboardPublicationId||''};
   if(value.durationMode==='recommended'&&value.recommendedDurationSeconds==null){const timing=savedStoryboardTiming(ep,shot,binding);if(timing.recommendedDurationSeconds!=null)value={...value,recommendedDurationSeconds:timing.recommendedDurationSeconds};}
   return [{shotId:shot.id,episodeId:ep.id,episode,scene,label:shot.label,publicationId:shot.storyboardPublicationId||'',baseContent:draft?.base?.content??shot.content??'',baseGenerationConfig:structuredClone(draft?.base?.generationConfig??shot.generationConfig??{}),value}];
  });
 });
}
export async function storyboardGenerationModel({state,value,getLibTVModel}){
 const profiles=generationMediaProfiles(state,'video'),profile=value.profileId?profiles.find(p=>p.id===value.profileId):activeMediaProfile(state,'video');if(!profile)throw Error('请配置生成接口');
 const available=profileModels(profile,'video');let model=available.find(m=>m.id===value.model)||available.find(m=>m.id===profile.model)||available[0];if(!model?.id)throw Error('请选择生成模型');
 const libtv=profile.provider==='libtv';if(libtv){if(!getLibTVModel)throw Error('请重新载入LibTV模型');model=await getLibTVModel(model.id);}
 const caps={...videoModelCapabilities(model.id,{}),...model},resolutions=caps.resolutions?.length?caps.resolutions:['固定'];
 const resolution=model.resolutions?.length?(resolutions.includes(value.resolution)?value.resolution:resolutions[0]):value.resolution||'720p';
 const durationPolicy=storyboardDurationPolicy(model,caps,resolution);
 const durations=durationPolicy.supportedDurations,fallback=durations?(durations.includes(value.duration)?value.duration:effectiveVideoProtocol(profile)==='autodl'&&durations.includes(5)?5:durations[0]):Number(value.duration)||(effectiveVideoProtocol(profile).startsWith('videos-')?4:5);
 return {profile,model,libtv,caps,resolution,durationPolicy,fallback};
}

export async function storyboardGenerationInput({state,value,getLibTVModel,shot}){
 const {profile,model,libtv,caps,resolution,durationPolicy,fallback}=await storyboardGenerationModel({state,value,getLibTVModel});
 if(!libtv&&profile.provider!=='likeai'&&!profile.apiKey&&!(profile.videoProtocol==='custom'&&profile.videoAdapter?.authMode==='none'))throw Error('请填写接口密钥');
 const timing=shot?storyboardTimingForDraft(shot,value):value;
 const {duration,issue}=storyboardDurationSelection({value,timing,policy:durationPolicy,fallback});
 if(issue)throw Error(issue);
 const ratios=caps.ratios?.length?caps.ratios:['16:9'],ratio=ratios.includes(value.ratio)?value.ratio:ratios[0];
 const limits=referencePolicy(isFeituoEndpoint(profile.endpoint),caps),key=k=>k==='image'?'maxImages':k==='audio'?'maxAudios':'maxVideos';
 const allowed=libtv?['image','audio','video']:['image','audio','video'].filter(k=>limits?.[key(k)]!==0);
 const input=matchBasicReferences(value);validateCompiledBinding(input,[...new Set([...allowed,'audio'])]);
 const modelCapabilities=normalizeCapabilities({...caps,...model.capabilities,durations:model.durations,durationByResolution:model.durationByResolution,durationRange:durationPolicy.durationRange});
 const candidateRefs=(input.references||[]).filter(r=>r.kind==='audio'||allowed.includes(r.kind));
 const hasAssetSlots=candidateRefs.some(r=>r.assetImageSlot);
 const prompt=projectStoryboardImageAliases(input.prompt,input.references||[],candidateRefs).prompt;
 const prepared={...input,prompt:bindReferencePrompt(prompt,candidateRefs),references:candidateRefs};
 // Main-process resolution determines which seats become images. Only then
 // can image-dependent audio limits be evaluated with the real reference count.
 const selected=hasAssetSlots?prepared:selectAudioReferences(prepared,modelCapabilities);
 const refs=hasAssetSlots?candidateRefs:selected.references.filter(r=>allowed.includes(r.kind));
 if(!hasAssetSlots)assertMinimumReferenceImages(refs,modelCapabilities);
 if(!hasAssetSlots&&limits)for(const k of allowed)if(limits[key(k)]!=null&&refs.filter(r=>r.kind===k).length>limits[key(k)])throw Error(`当前模型的${{image:'图片',audio:'音频',video:'视频'}[k]}参考超出上限`);
 if(model.protocol==='metadata-content'&&refs.some(r=>r.filePath&&!r.url))throw Error('当前官转模型要求公网素材链接');
 if(libtv&&!hasAssetSlots)libtvGenerationParams(model,{...selected,kind:'video',ratio,duration,resolution,references:refs});
 return {...selected,provider:profile.provider,libtvOwnerKey:profile.libtvOwnerKey,likeBindingId:profile.likeBindingId,likeOwnerKey:profile.likeOwnerKey,originalPrompt:input.prompt,profileId:profile.id,kind:'video',model:model.id,endpoint:profile.endpoint,apiKey:profile.apiKey,videoProtocol:profile.videoProtocol||'auto',videoAdapter:profile.videoAdapter,modelCapabilities,ratio,duration,resolution:resolution==='固定'?undefined:resolution,references:refs};
}
