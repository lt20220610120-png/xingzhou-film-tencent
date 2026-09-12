import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';
import { AI_LAUNCHER_STORAGE, clampAiPosition, readAiPosition, isAiDrag } from '../../core/floatingAiPosition.js';

function restorePosition() {
  // Previous desktop builds used x/y or left/top and different storage keys.
  for (const key of [AI_LAUNCHER_STORAGE, 'xz-ai-launcher-position', 'xz-ai-button-position', 'xz-ai-position', 'xingzhou-ai-position']) {
    try {
      const position = readAiPosition(JSON.parse(localStorage.getItem(key)));
      if (position) return position;
    } catch { /* A corrupt or unavailable preference must not block the workspace. */ }
  }
  return null;
}

export function FloatingAIButton({ onOpen }) {
  const [position, setPosition] = useState(restorePosition);
  const [dragging, setDragging] = useState(false);
  const buttonRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClick = useRef(false);
  const positionRef = useRef(position);

  const keepInBounds = (next) => clampAiPosition(next, {
    width: window.innerWidth,
    height: window.innerHeight,
    sidebarRight: document.getElementById('app-sidebar')?.getBoundingClientRect().right || 0,
    size: buttonRef.current?.getBoundingClientRect().width || 52,
  });

  const moveTo = (next, persist = false) => {
    const bounded = keepInBounds(next);
    positionRef.current = bounded;
    setPosition(bounded);
    if (persist) {
      try { localStorage.setItem(AI_LAUNCHER_STORAGE, JSON.stringify(bounded)); } catch { /* Optional preference. */ }
    }
  };

  useLayoutEffect(() => { moveTo(positionRef.current); }, []);
  useEffect(() => {
    const reflow = () => moveTo(positionRef.current, true);
    window.addEventListener('resize', reflow);
    const sidebar = document.getElementById('app-sidebar');
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reflow);
    if (sidebar) observer?.observe(sidebar);
    return () => { window.removeEventListener('resize', reflow); observer?.disconnect(); };
  }, []);

  const startDrag = (event) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    const rect = event.currentTarget.getBoundingClientRect();
    suppressClick.current = false;
    dragRef.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && !isAiDrag({ x: drag.startX, y: drag.startY }, { x: event.clientX, y: event.clientY })) return;
    drag.moved = true;
    setDragging(true);
    moveTo({ left: event.clientX - drag.offsetX, top: event.clientY - drag.offsetY });
  };

  const endDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClick.current = drag.moved || event.type === 'pointercancel';
    dragRef.current = null;
    setDragging(false);
    if (drag.moved) moveTo(positionRef.current, true);
    if (buttonRef.current?.hasPointerCapture?.(event.pointerId)) buttonRef.current.releasePointerCapture(event.pointerId);
  };

  return <button
    ref={buttonRef} type="button"
    className={`global-ai-launch studio-ai-launcher${dragging ? ' is-dragging' : ''}`}
    style={{ left: position?.left, top: position?.top, right: position ? 'auto' : 20, bottom: position ? 'auto' : 20, transform: 'none' }}
    aria-label="打开行舟 AI" title="行舟 AI · 点击打开，按住可拖动"
    onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}
    onPointerCancel={endDrag} onLostPointerCapture={endDrag}
    onClick={(event) => {
      if (event.detail !== 0 && suppressClick.current) { suppressClick.current = false; return; }
      suppressClick.current = false;
      onOpen();
    }}
  ><Bot size={23} strokeWidth={1.7} /><span className="studio-ai-caption" aria-hidden="true">行舟 AI</span></button>;
}
