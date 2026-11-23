const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const hasImageSource = image => !image?.localUnavailable &&
  [image?.url, image?.filePath, image?.localPath, image?.objectKey, image?.objectPath].some(nonempty);

export function assetHasAdoptedImage(asset) {
  if (!asset) return false;
  if (nonempty(asset.image_url)) return true;
  const images = Array.isArray(asset.images) ? asset.images : [];
  if (asset.adoptedImageId) return images.some(image => image?.id === asset.adoptedImageId && hasImageSource(image));
  return !Object.hasOwn(asset, 'adoptedImageId') && !Object.hasOwn(asset, 'image_url') && images.some(hasImageSource);
}

export function assetSkipsReferenceImage(asset) {
  return asset?.noReferenceImage === true && !assetHasAdoptedImage(asset);
}
