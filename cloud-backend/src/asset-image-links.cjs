// Refresh only our own COS links. External legacy URLs stay external.
function assetImageLink(value, signer) {
  if (!value) return { url: '' };
  let objectKey = String(value);
  if (/^https?:/i.test(objectKey)) {
    const url = new URL(objectKey);
    if (!signer?.host || url.hostname !== signer.host) return { url: objectKey };
    objectKey = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  }
  if (!signer) return { url: '' };
  const signed = signer.signDownload({ objectKey });
  return { objectKey, url: signed.url, expiresAt: signed.expiresAt };
}
module.exports = { assetImageLink };
