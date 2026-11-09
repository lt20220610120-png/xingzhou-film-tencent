export function adoptedAssetImage(asset){
 const images=asset?.images||[];
 const named=images.find(i=>i.id===asset?.adoptedImageId);if(named)return named;
 const pointer=String(asset?.image_url||'').split('?')[0];
 const matched=pointer&&images.find(i=>[i.objectKey,i.objectPath,i.url].some(v=>v&&String(v).split('?')[0]===pointer));
 return matched||images.at(-1)||null;
}
export function bindingImageId(card,need={}){
 const images=card?.images||[];
 if(need.imageSelection==='explicit'||need.locked&&need.imageSelection!=='asset'&&need.imageId)return images.some(i=>i.id===need.imageId)?need.imageId:null;
 return adoptedAssetImage(card)?.id||null;
}
