const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function parseAssetReferencePreference(payload) {
  const {assetIds, noReferenceImage} = payload || {};
  if (typeof noReferenceImage !== 'boolean' || !Array.isArray(assetIds) || !assetIds.length || assetIds.length > 10000
    || !assetIds.every(id => typeof id === 'string' && uuid.test(id))) return null;
  return {assetIds: [...new Set(assetIds.map(id => id.toLowerCase()))], noReferenceImage};
}

module.exports = {parseAssetReferencePreference};
