const {assetImageObject,objectFromLink}=require('./project-media-policy.cjs');

function assetImageLink(value, signer, projectId) {
  if (typeof value !== 'string' || !value) return {url:''};
  if (/^https?:/i.test(value)) {
    try {
      const url = new URL(value);
      if (url.username || url.password || !/^https?:$/.test(url.protocol)) return {url:''};
      if (!signer?.host || url.hostname !== signer.host) return {url:value};
    } catch {
      return {url:''};
    }
  }
  const objectKey = objectFromLink(value,signer);
  const scope = projectId || objectKey.split('/')[1];
  if (!signer || !assetImageObject(objectKey,scope)) return {url:''};
  const signed = signer.signDownload({ objectKey });
  return { objectKey, url: signed.url, expiresAt: signed.expiresAt };
}
module.exports = { assetImageLink };
