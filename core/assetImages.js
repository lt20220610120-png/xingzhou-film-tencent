export function uniqueAssetImages(images = []) {
  const seen = new Set();
  return images.filter(image => {
    const key = image.id || image.objectKey || image.url;
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export const assetHasImages = asset => Boolean(asset.image_url || asset.images?.length);
export const ungeneratedAssets = assets => assets.filter(asset => !assetHasImages(asset));

// Preserve manual selection, excluding newly completed images and adding new unfinished assets.
export function reconcileAssetSelection(selected, previousAssets, assets) {
  const previous = new Map(previousAssets.map(asset => [asset.id, assetHasImages(asset)]));
  const wanted = new Set(selected);
  return assets.filter(asset => {
    if (!previous.has(asset.id)) return !assetHasImages(asset);
    if (!previous.get(asset.id) && assetHasImages(asset)) return false;
    return wanted.has(asset.id);
  }).map(asset => asset.id);
}
