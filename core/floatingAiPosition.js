export const AI_LAUNCHER_SIZE = 52;
export const AI_LAUNCHER_STORAGE = 'xz-ai-launcher-position-v2';

// Keep the entire launcher inside the viewport, to the right of the main rail.
export function clampAiPosition(position, { width, height, sidebarRight = 0, size = AI_LAUNCHER_SIZE, margin = 12 }) {
  const maxLeft = Math.max(0, width - size - margin);
  const minLeft = Math.min(maxLeft, Math.max(margin, sidebarRight + margin));
  const maxTop = Math.max(0, height - size - margin);
  const minTop = Math.min(margin, maxTop);
  const left = Number.isFinite(position?.left) ? position.left : maxLeft;
  const top = Number.isFinite(position?.top) ? position.top : maxTop;
  return {
    left: Math.min(maxLeft, Math.max(minLeft, left)),
    top: Math.min(maxTop, Math.max(minTop, top)),
  };
}

export function readAiPosition(saved) {
  if (!saved || typeof saved !== 'object') return null;
  const left = saved.left ?? saved.x;
  const top = saved.top ?? saved.y;
  return Number.isFinite(left) && Number.isFinite(top) ? { left, top } : null;
}

export function isAiDrag(start, point, threshold = 5) {
  return Math.hypot(point.x - start.x, point.y - start.y) >= threshold;
}
