import React, { useState, useEffect, useRef } from 'react';

// URLs can expire while the project remains open. Renew the authorized object link once.
export default function CloudAssetImage({ api, projectId, assetId, image, onResolved, ...props }) {
  const [source, setSource] = useState(image.url);
  const [failed, setFailed] = useState(false);
  const attempts = useRef(0);
  const scope = `${projectId}:${assetId}:${image.id}:${image.url}`;
  const current = useRef(scope); current.current = scope;
  useEffect(() => { setSource(image.url); setFailed(false); attempts.current = 0; }, [scope]);
  const renew = async () => {
    if (attempts.current++ >= 1 || !api.collabResolveAssetImage) { setFailed(true); return; }
    try {
      const updated = await api.collabResolveAssetImage({ projectId, assetId, imageId: image.id });
      if (current.current !== scope) return;
      if (!updated?.url) throw new Error('图片地址不可用');
      setSource(updated.url); onResolved?.(updated);
    } catch { if (current.current === scope) setFailed(true); }
  };
  return failed ? <span className="collab-image-load-error" role="status">图片暂时无法加载，请刷新图片重试</span>
    : <img {...props} src={source} onError={renew} />;
}
