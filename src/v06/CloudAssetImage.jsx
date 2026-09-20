import React, { useState, useEffect, useRef } from 'react';

// Desktop previews reuse authorized originals on disk, only once visible.
export default function CloudAssetImage({ api, projectId, assetId, image, onResolved, ...props }) {
  const cachedPreview = Boolean(api?.collabLoadAssetImage && /^https?:/i.test(image.url || '') && (assetId || image.projectId || image.objectKey));
  const scope = `${projectId}:${assetId}:${image.id}:${image.url}`;
  const [loaded, setLoaded] = useState(null);
  const [retry, setRetry] = useState(0);
  const element = useRef(null);
  const callback = useRef(onResolved); callback.current = onResolved;
  const latest = useRef(scope); latest.current = scope;
  useEffect(() => {
    let cancelled = false, started = false;
    const load = async () => {
      if (started) return;
      started = true;
      try {
        const resolve = cachedPreview ? api.collabLoadAssetImage : api.collabResolveAssetImage;
        const updated = await resolve({projectId, assetId, imageId:image.id});
        if (cancelled || latest.current !== scope) return;
        if (!updated?.url) throw new Error('图片地址不可用');
        setLoaded({scope,url:updated.url}); callback.current?.(updated);
      } catch { if (!cancelled && latest.current === scope) setLoaded({scope,failed:true}); }
    };
    if (!cachedPreview && retry === 0) return;
    if (props.loading === 'eager' || typeof IntersectionObserver === 'undefined') load();
    else {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry=>entry.isIntersecting)) { observer.disconnect(); load(); }
      });
      if (element.current) observer.observe(element.current);
      return () => { cancelled = true; observer.disconnect(); };
    }
    return () => { cancelled = true; };
  }, [scope, retry, cachedPreview, api, props.loading]);
  useEffect(() => { setRetry(0); }, [scope]);
  const current = loaded?.scope === scope ? loaded : null;
  const renew = () => {
    if (retry >= 1 || (!cachedPreview && !api.collabResolveAssetImage)) setLoaded({scope,failed:true});
    else { setLoaded(null); setRetry(value=>value+1); }
  };
  return current?.failed
    ? <span className="collab-image-load-error" role="status">图片暂时无法加载，请刷新图片重试</span>
    : <img {...props} ref={element} loading={props.loading || 'lazy'} decoding="async" src={current?.url || (cachedPreview ? undefined : image.url)} onError={renew} />;
}
