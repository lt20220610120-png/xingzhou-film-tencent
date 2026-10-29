import {productionImageLimit} from './productionReferenceSelection.js';
import {entryValue} from './promptBook.js';
import {importedEntryValue} from './importedArtBinding.js';
import {profileModels} from './videoCatalog.js';
import {normalizeCapabilities} from './modelCapabilities.js';
import {bindReferencePrompt} from './generationReferences.js';
import {libtvGenerationParams} from './libtv.js';
export function workflowInput(book,entry,settings,profile){
 if(!profile||profile.id!==settings.profileId)throw Error('生成接口不存在，请恢复原接口配置');
 const model=profileModels(profile,'video').find(m=>m.id===settings.model);if(!model)throw Error('请选择接口已配置的模型');
 const value=book.importedBinding&&book.importedBinding.stage!=='manual'?importedEntryValue(book,entry):entryValue(book,entry);
 if(value.bindingIssue||value.referenceBindingMode==='pending')throw Error(value.bindingIssue||'关联尚未确认');
 if(/[（(]参考\s*@\s*[）)]/.test(value.prompt))throw Error('提示词仍有未关联的参考@，请先核对');
 const caps=normalizeCapabilities(model),references=value.references||[];
 if(!references.length&&!(caps.minImages===0&&value.referenceBindingMode==='confirmed'))throw Error('当前条没有参考图片，请先核对素材');
 const packLimit=productionImageLimit(caps,references),pack=Boolean(settings.allowReferenceSelection&&book.linkedProjectId&&value.referenceBindingMode==='confirmed'&&packLimit>0&&references.filter(r=>r.kind==='image').length>packLimit);
 for(const [kind,key] of [['image','maxImages'],['audio','maxAudios'],['video','maxVideos']])if(!(kind==='image'&&pack)&&references.filter(r=>r.kind===kind).length>(caps[key]??(kind==='image'?1:0)))throw Error(`${entry.label} 的${kind}参考超过模型上限，请在原编辑模式核对`);
 const duration=Number(value.duration||entry.recommendedDurationSeconds||settings.duration),ratio=settings.ratio,resolution=settings.resolution;
 if(!(duration>0&&duration<=3600)||caps.durations?.length&&!caps.durations.includes(duration))throw Error(`${entry.label} 的时长不在模型可用范围`);
 if(caps.durationByResolution?.[resolution]?.length&&!caps.durationByResolution[resolution].includes(duration))throw Error('当前分辨率不支持该时长');
 if(caps.maxTotalRefs!=null&&references.length>caps.maxTotalRefs&&!pack)throw Error('参考总数超过模型上限');
 if(caps.ratios?.length&&!caps.ratios.includes(ratio)||caps.resolutions?.length&&!caps.resolutions.includes(resolution))throw Error('画面比例或分辨率不在模型可用范围');
 const input={...value,workflowReferenceSelectionRequired:pack,kind:'video',profileId:profile.id,provider:profile.provider,endpoint:profile.endpoint,apiKey:profile.apiKey,model:model.id,videoProtocol:profile.videoProtocol||'auto',videoAdapter:profile.videoAdapter,likeBindingId:profile.likeBindingId,likeOwnerKey:profile.likeOwnerKey,libtvOwnerKey:profile.libtvOwnerKey,modelCapabilities:caps,ratio,duration,resolution,originalPrompt:value.prompt,prompt:bindReferencePrompt(value.prompt,references),references,promptBookId:book.id,promptEntryId:entry.id,promptLabel:entry.label};
 if(profile.provider==='libtv'&&!pack)libtvGenerationParams(model,input);
 return input;
}
