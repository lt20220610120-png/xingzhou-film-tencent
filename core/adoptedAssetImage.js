export function adoptedAssetImage(asset,{exact=false}={}){
 const images=asset?.images||[];
 const named=images.find(i=>i.id===asset?.adoptedImageId);if(named&&!exact)return named;
 const pointer=String(asset?.image_url||'').split('?')[0];
 const matched=pointer&&images.find(i=>[i.objectKey,i.objectPath,i.url].some(v=>v&&String(v).split('?')[0]===pointer));
 return matched||(!exact&&images.at(-1))||null;
}
export const bindingFollowsAdoptedImage = (need={}) =>
 need.imageSelection!=='explicit' && !(need.locked && need.imageSelection!=='asset' && need.imageId);
export function bindingImageId(card,need={}){
 const images=card?.images||[];
 if(!bindingFollowsAdoptedImage(need))return images.some(i=>i.id===need.imageId)?need.imageId:null;
 return adoptedAssetImage(card)?.id||null;
}
