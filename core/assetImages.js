import {assetSkipsReferenceImage} from './assetReferencePolicy.js';
import {adoptedAssetImage} from './adoptedAssetImage.js';

export function uniqueAssetImages(images = []) {
  const seen = new Set();
  return images.filter(image => {
    const key = image.id || image.objectKey || image.url;
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export const assetHasImages = asset => Boolean(asset.image_url || asset.images?.length);
export const ungeneratedAssets = assets => assets.filter(asset => !assetHasImages(asset) && !assetSkipsReferenceImage(asset));
export const visibleArtAssets = (assets,onlyMissing=false) => onlyMissing?ungeneratedAssets(assets):assets;

export function removeAssetImages(assets, {assetId, imageId, clear = false}) {
  return assets.map(asset => {
    if (assetId && asset.id !== assetId) return asset;
    if (clear) return {...asset, images: [], adoptedImageId: null, image_url: ''};
    if (!assetId || !asset.images?.some(image => image.id === imageId)) return asset;
    const images = asset.images.filter(image => image.id !== imageId);
    const hasStoredAdoption = 'adoptedImageId' in asset || 'image_url' in asset;
    const adopted = asset.images.find(image => image.id === asset.adoptedImageId)
      || adoptedAssetImage(asset, {exact: hasStoredAdoption});
    if (adopted?.id !== imageId && (images.length || asset.image_url)) return {...asset, images};
    const latest = images.at(-1);
    return {...asset, images, adoptedImageId: latest?.id ?? null, image_url: latest?.url ?? ''};
  });
}

// Preserve manual selection, excluding newly completed images and adding new unfinished assets.
export function reconcileAssetSelection(selected, previousAssets, assets) {
  const previous = new Map(previousAssets.map(asset => [asset.id, asset]));
  const wanted = new Set(selected);
  return assets.filter(asset => {
    if (assetSkipsReferenceImage(asset)) return false;
    const before=previous.get(asset.id);
    if (!before||assetSkipsReferenceImage(before)) return !assetHasImages(asset);
    if (!assetHasImages(before) && assetHasImages(asset)) return false;
    return wanted.has(asset.id);
  }).map(asset => asset.id);
}
