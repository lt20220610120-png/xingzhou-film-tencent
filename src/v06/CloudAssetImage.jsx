import React, { useState, useEffect, useRef } from 'react';
import {imagePreviewIdentity} from '../../core/cloudTraffic.js';

// Load authorized previews only once visible; a renewed signature is not a new image.
export default function CloudAssetImage({ api, projectId, assetId, image, onResolved, onAssetSlotEmpty, retryable = false, ...props }) {
  const seat = Boolean(image.assetImageSlot && projectId && assetId);
  const cachedPreview = Boolean(api?.collabLoadAssetImage && (
    seat || /^https?:/i.test(image.url || '') && (assetId || image.projectId || image.objectKey)
    || !image.url && projectId && assetId && image.id
  ));
  const follows = image.followAdoptedImage === true || image.followAdoptedImage == null && image.autoAssetImage === true;
  const scope = `${projectId}:${assetId}:${image.id}:${seat}:${image.adoptedRevision||imagePreviewIdentity(image)}:${follows}`;
  const [loaded, setLoaded] = useState(null);
  const [retry, setRetry] = useState(0);
  const element = useRef(null);
  const callback = useRef(onResolved); callback.current = onResolved;
  const onEmpty = useRef(onAssetSlotEmpty); onEmpty.current = onAssetSlotEmpty;
  const latest = useRef(scope); latest.current = scope;
  useEffect(() => {
    let cancelled = false, started = false;
    const load = async () => {
      if (started) return;
      started = true;
      try {
        const resolve = cachedPreview ? api.collabLoadAssetImage : api.collabResolveAssetImage;
        const updated = await resolve(seat ? {projectId,assetId,assetImageSlot:true}
          : {projectId,assetId,imageId:image.id,...(follows ? {followAdoptedImage:true} : {})});
        if (cancelled || latest.current !== scope) return;
        if (!updated?.url) throw new Error('图片地址不可用');
        setLoaded({scope,url:updated.url});
        const {previewDataUrl,originalUrl,...metadata}=updated;
        callback.current?.({...metadata,url:originalUrl || updated.url});
      } catch (error) {
        if (!cancelled && latest.current === scope) {
          const removed = String(error.message).includes('这张参考图已移除');
          const empty = seat && String(error.message).includes('资产卡片暂无已采用图片');
          setLoaded({scope,failed:true,removed,empty});
          if(empty)onEmpty.current?.();
        }
      }
    };
    if (!cachedPreview && !(seat && api?.collabResolveAssetImage) && retry === 0) return;
    if (props.loading === 'eager' || typeof IntersectionObserver === 'undefined') load();
    else {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry=>entry.isIntersecting)) { observer.disconnect(); load(); }
      });
      if (element.current) observer.observe(element.current);
      return () => { cancelled = true; observer.disconnect(); };
    }
    return () => { cancelled = true; };
  }, [scope, retry, cachedPreview, api, props.loading, follows, seat]);
  useEffect(() => { setRetry(0); }, [scope]);
  const current = loaded?.scope === scope ? loaded : null;
  const renew = () => {
    if (retry >= 1 || (!cachedPreview && !api?.collabResolveAssetImage)) setLoaded({scope,failed:true});
    else { setLoaded(null); setRetry(value=>value+1); }
  };
  if (current?.empty) return <span hidden data-empty-asset-slot />;
  if (current?.failed) {
    return <span className="collab-image-load-error" role="status">
      {current.removed ? '参考图已失效，请重新选择' : retryable ? '图片暂未加载' : '图片暂时无法加载，请刷新图片重试'}
      {retryable && !current.removed && <button type="button" onClick={() => {setLoaded(null);setRetry(value=>value+1);}}>重试</button>}
    </span>;
  }
  return <img {...props} ref={element} loading={props.loading || 'lazy'} decoding="async" src={current?.url || (cachedPreview || seat ? undefined : image.url)} onError={renew} />;
}
