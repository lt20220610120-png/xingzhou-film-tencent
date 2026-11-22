import {numberedReferences,isProjectGenerationReference,normalizeGenerationReferences} from './generationReferences.js';
import {generationReferenceKey,remapGenerationAliases} from './automaticReferences.js';
import {assetImageSlot} from './assetImageSlot.js';
import {findStoryboardAudioMedia} from './storyboardAudioReferences.js';

export const storyboardAssetSlots = (references,projectId) => {
 const slots=(references||[]).map(ref=>assetImageSlot(ref,projectId));
 return references && slots.every((ref,index)=>ref===references[index])?references:slots;
};

// Canonicalize existing slots and recovery history without changing alias order.
export function cleanStoryboardReferenceValue(value,projectId) {
 const refs=value.references||[],mapped=storyboardAssetSlots(refs,projectId);
 const regularImages=new Set(refs.filter(ref=>ref.kind==='image'&&isProjectGenerationReference(ref,projectId)).map(ref=>ref.id));
 const references=mapped.filter((ref,index)=>isProjectGenerationReference(ref,projectId)
  && !(refs[index].kind==='asset-image'&&regularImages.has(ref.id)));
 const removed=value.storyboardRemovedReferences,baseline=value.storyboardReferenceBaseline;
 const removedSlots=removed&&storyboardAssetSlots(removed,projectId);
 const baselineSlots=baseline?.references&&storyboardAssetSlots(baseline.references,projectId);
 const recovery={...(removed!==removedSlots?{storyboardRemovedReferences:removedSlots}:{}),
  ...(baseline?.references!==baselineSlots?{storyboardReferenceBaseline:{...baseline,references:baselineSlots}}:{})};
 const orderChanged=references.length!==refs.length||refs.some((ref,index)=>ref.kind!==mapped[index].kind);
 if(!orderChanged)return mapped===refs&&removed===removedSlots&&baseline?.references===baselineSlots?value:{...value,references:mapped,...recovery};
 const order=items=>numberedReferences(items).map(ref=>({key:generationReferenceKey(ref),alias:ref.alias}));
 const after=order(references);
 return {...value,...recovery,references,prompt:remapGenerationAliases(value.prompt,value.autoReferenceOrder||order(refs),after),autoReferenceOrder:after,autoReferenceSignature:null};
}

export function storyboardReferencePreviews(references,assets,media,projectId) {
 const assetById=new Map((assets||[]).filter(asset=>(!asset.projectId||asset.projectId===projectId)&&(!asset.project_id||asset.project_id===projectId)).map(asset=>[asset.id,asset]));
 return normalizeGenerationReferences(storyboardAssetSlots(references,projectId)).map(ref=>{
  if(ref.assetImageSlot){
   const asset=assetById.get(ref.assetId);
   const adoptedImageReady=Boolean(asset?.image_url||asset?.adoptedImageId);
   return {...ref,displayName:asset?.displayName||ref.displayName,nameAliases:asset?.nameAliases||ref.nameAliases,adoptedImageReady,
    adoptedRevision:`${asset?.adoptedImageId||''}:${String(asset?.image_url||'').split('?')[0]}:${asset?.updated_at||''}`};
  }
  if(ref.kind==='audio'){
   const file=findStoryboardAudioMedia(ref,media||[],projectId);
   return file?{...ref,mediaId:file.id,objectKey:file.objectKey,url:file.url,filePath:file.filePath}:ref;
  }
  const file=media?.find(m=>m.id===ref.id);
  return file?{...ref,url:file.url}:ref;
 });
}

export const visibleStoryboardReference = ref => ref.assetImageSlot!==true || ref.adoptedImageReady!==false;
