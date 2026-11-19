// Keep legacy reference IDs so saved aliases and draft exclusions stay valid.
const photoFields = ['imageId','mediaId','url','originalUrl','imageUrl','image_url','filePath','localPath','objectKey',
 'objectPath','object_path','expiresAt','previewDataUrl','filename','mime','autoAssetImage','followAdoptedImage',
 'assetAdopted','localUnavailable','adoptedRevision'];

export const assetImageSlot = (reference, projectId) => {
 const assetId = reference?.assetId || reference?.asset_id;
 if (!assetId || !['image','asset-image'].includes(reference.kind)
   || reference.projectId && reference.projectId!==projectId || reference.project_id && reference.project_id!==projectId) return reference;
 if (reference.assetImageSlot===true && reference.id && reference.kind==='image' && reference.assetId===assetId && reference.projectId===projectId
   && !photoFields.some(field=>Object.hasOwn(reference,field))) return reference;
 const next={...reference,id:reference.id||assetId,kind:'image',projectId,assetId,assetImageSlot:true};
 for(const field of photoFields)delete next[field];
 return next;
};

export const referenceForAssetCard = (asset, projectId) => assetImageSlot({kind:'image',assetId:asset.assetId||asset.id,
 projectId:asset.projectId||asset.project_id||projectId,project_id:asset.project_id,name:asset.name,
 displayName:asset.displayName,nameAliases:asset.nameAliases,category:asset.category},projectId);

export const sameAssetImageSlot = (left,right) => Boolean(left.assetImageSlot&&right.assetImageSlot&&left.projectId===right.projectId&&left.assetId===right.assetId);
