import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, RefreshCw, X } from 'lucide-react';
import { mediaSource } from '../../core/generationReferences.js';

// Shared by 图视生成 and collaboration storyboard results; never submit a generation here.
export function MediaPreview({ item, onClose, onDownload }) {
  const [source, setSource] = useState(() => mediaSource(item));
  const [state, setState] = useState('loading'), [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState(''), [downloading, setDownloading] = useState(false);
  const dialog = useRef(null), closeButton = useRef(null), media = useRef(null);
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; closeButton.current?.focus();
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const controls = [...dialog.current.querySelectorAll('button:not(:disabled), video[controls]')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown, true);
    const player = media.current;
    return () => {
      document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown, true);
      if (player?.tagName === 'VIDEO') { player.pause(); player.removeAttribute('src'); player.load(); }
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose]);
  useEffect(() => {
    if (state !== 'loading') return;
    const timer = setTimeout(() => setState('slow'), 15000);
    return () => clearTimeout(timer);
  }, [state, source, attempt]);
  const failed = () => {
    if (item.filePath && source !== item.url && /^https?:\/\//i.test(item.url || '')) {
      setSource(item.url); setState('loading');
    } else setState('error');
  };
  const download = async () => {
    setDownloading(true); setMessage('');
    try { if (await onDownload(item)) setMessage('文件已保存'); }
    catch (error) { setMessage(error.message || '下载失败，请重试'); }
    finally { setDownloading(false); }
  };
  return createPortal(<div className="generation-preview-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="generation-preview-dialog" role="dialog" aria-modal="true" aria-label="作品预览">
      <header className="generation-preview-toolbar"><strong>{item.kind === 'image' ? '图片预览' : '视频预览'}</strong><div>
        <button type="button" disabled={downloading} onClick={download}><Download size={17}/>{downloading ? '保存中…' : '下载'}</button>
        <button type="button" ref={closeButton} className="generation-preview-close" aria-label="关闭预览" onClick={onClose}><X size={20}/>关闭</button>
      </div></header>
      <div className="generation-preview-stage">
        {item.kind === 'image' ? <img key={`${source}:${attempt}`} ref={media} src={source} alt="生成结果大图" onLoad={() => setState('ready')} onError={failed}/> :
          <video key={`${source}:${attempt}`} ref={media} src={source} controls autoPlay playsInline preload="auto" onLoadedData={() => setState('ready')} onError={failed}/>}
        {state === 'loading' && <p className="generation-preview-loading" role="status">正在加载{item.kind === 'image' ? '图片' : '视频'}…</p>}
        {['error', 'slow'].includes(state) && <div className="generation-preview-feedback" role="alert">
          <p>{state === 'error' ? '暂时无法播放或预览此文件。文件可能已移动、链接已失效，或当前播放器不支持其编码。' : '加载时间较长，请检查网络；也可下载后使用本机播放器查看。'}</p>
          <button type="button" onClick={() => { setSource(mediaSource(item)); setAttempt(value => value + 1); setState('loading'); }}><RefreshCw size={16}/>重新加载</button>
        </div>}
      </div>
      <footer className="generation-preview-footer"><span role="status">{message || '按 Esc、点击关闭或点击空白处退出预览'}</span></footer>
    </section>
  </div>, document.body);
}
