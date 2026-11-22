const withoutQuery = value => String(value || '').split('?')[0];

export function matchAdoptedAssetImage(images, value) {
  const pointer = withoutQuery(value);
  if (!pointer) return null;
  return images.find(image => [image.objectKey, image.objectPath, image.url].some(value =>
    withoutQuery(value) === pointer)) || null;
}
