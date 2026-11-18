import {numberedReferences,isProjectGenerationReference} from './generationReferences.js';
import {generationReferenceKey,remapGenerationAliases} from './automaticReferences.js';
import {adoptedAssetImage,bindingFollowsAdoptedImage} from './adoptedAssetImage.js';
import {promptReviewMatches} from './promptReviewBatch.js';

export function storyboardImageFollowsAsset(ref, shot, binding) {
 if(typeof ref.followAdoptedImage==='boolean')return ref.followAdoptedImage;
 if(ref.autoAssetImage===true)return true;
 const config=shot?.generationConfig;
 if(!shot?.storyboardPublicationId||!config?.bindingExpectedReferences?.includes(ref.id))return undefined;
 const version=binding?.saved?.versions?.[config.bindingVersionId];
 const snapshot=version?.decisionSnapshot||version?.snapshot;
 const decision=version?.decisions?.[shot.sourcePromptId];
 const needList=decision?.needs||[];
 const cards=snapshot?.cards||[];
 const matching=needList.filter(need=>need.visibility==='visible' && need.imageId===ref.imageId
   && cards.some(card=>card.uid===need.cardUid && card.assetId===ref.assetId));
 if(!matching.length)return undefined;
 if(!matching.every(bindingFollowsAdoptedImage))return false;
 const entry=snapshot.entries?.find(row=>row.id===shot.sourcePromptId && row.prompt===shot.sourceContent);
 const review=version.reviews?.[shot.sourcePromptId];
 return entry && review?.published && promptReviewMatches(snapshot,entry,decision,review) ? true : undefined;
}

// Repair the image under its existing reference ID so edited @imageN slots stay in place.
export function repairStoryboardAssetReferences(value,{shot,binding,assets,projectId}){
 let changed=false;
 const references=(value.references||[]).map(ref=>{
  if(ref.kind!=='image'||!ref.assetId||!ref.imageId||!isProjectGenerationReference(ref,projectId))return ref;
  if(storyboardImageFollowsAsset(ref,shot,binding)!==true)return ref;
  const asset=assets.find(asset=>asset.id===ref.assetId && (!asset.project_id||asset.project_id===projectId)
    && (!asset.projectId||asset.projectId===projectId));
  const exists=asset?.images?.some(image=>image.id===ref.imageId);
  const next=exists?null:adoptedAssetImage(asset,{exact:true});
  if(!next?.id||!(next.url||next.filePath)){
   if(ref.followAdoptedImage===true)return ref;
   changed=true;
   return {...ref,followAdoptedImage:true};
  }
  changed=true;
  const {filePath,objectKey,expiresAt,url,...metadata}=ref;
  return {...metadata,projectId,followAdoptedImage:true,imageId:next.id,
    ...Object.fromEntries(['url','filePath','objectKey','expiresAt'].filter(key=>next[key]!==undefined).map(key=>[key,next[key]]))};
 });
 return changed?{...value,references}:value;
}

// collab_media also stores internal asset-image rows. Those belong to the art
// library, not the separately uploaded image/audio/video reference collection.
export function cleanStoryboardReferenceValue(value,projectId) {
 const refs=value.references||[],references=refs.filter(ref=>isProjectGenerationReference(ref,projectId));
 if(references.length===refs.length)return value;
 const order=items=>numberedReferences(items).map(ref=>({key:generationReferenceKey(ref),alias:ref.alias}));
 const after=order(references);
 return {...value,references,prompt:remapGenerationAliases(value.prompt,value.autoReferenceOrder||order(refs),after),autoReferenceOrder:after,autoReferenceSignature:null};
}
