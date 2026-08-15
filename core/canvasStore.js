// ============================================================
// canvasStore.js — 画布领域逻辑（纯函数）
// 画布节点 + 媒体生成 API 配置
// ============================================================
import { uid, now } from './projectStore.js';

export const CANVAS_NODE_SIZE = { image: { w: 360, h: 300 }, video: { w: 420, h: 300 } };
export const IMAGE_SIZES = ['1024x1024', '1280x720', '720x1280', '1024x1792', '1792x1024'];
export const VIDEO_RATIOS = ['16:9', '9:16', '1:1'];
export const VIDEO_DURATIONS = [5, 6, 10];
export const VIDEO_MODEL_CAPABILITIES = {
  'seedance-2.0': { label: 'Seedance 2.0', durations: [5, 10, 15], resolutions: ['480p', '720p', '1080p', '2K', '4K'], ratios: VIDEO_RATIOS, audio: true },
  'seedance-2.5': { label: 'Seedance 2.5', durations: [5, 10, 15, 20, 30], resolutions: ['480p', '720p', '1080p', '2K', '4K'], ratios: VIDEO_RATIOS, audio: true },
};
export const videoModelCapabilities = (model = '') => {
  const id = String(model).toLowerCase();
  if (id.includes('seedance') && id.includes('2.5')) return VIDEO_MODEL_CAPABILITIES['seedance-2.5'];
  if (id.includes('seedance') && id.includes('2.0')) return VIDEO_MODEL_CAPABILITIES['seedance-2.0'];
  return { label: model || '通用视频模型', durations: VIDEO_DURATIONS, resolutions: ['480p', '720p', '1080p'], ratios: VIDEO_RATIOS, audio: false };
};

export const createCanvas = (state, name = '未命名画布') => {
  const canvas = { id: uid(), name, nodes: [], createdAt: now(), updatedAt: now() };
  return { ...state, canvases: [...(state.canvases || []), canvas], activeCanvasId: canvas.id };
};

export const renameCanvas = (state, canvasId, name) => ({
  ...state,
  canvases: (state.canvases || []).map((c) => c.id === canvasId ? { ...c, name, updatedAt: now() } : c),
});

export const deleteCanvas = (state, canvasId) => {
  const canvases = (state.canvases || []).filter((c) => c.id !== canvasId);
  return { ...state, canvases, activeCanvasId: state.activeCanvasId === canvasId ? (canvases[0]?.id || null) : state.activeCanvasId };
};

export const addCanvasNode = (state, canvasId, type, position = {}) => {
  const size = CANVAS_NODE_SIZE[type] || CANVAS_NODE_SIZE.image;
  const node = {
    id: uid(), type,
    x: Math.round(position.x ?? 120), y: Math.round(position.y ?? 120), w: size.w, h: size.h,
    prompt: '', status: 'empty', mediaFile: '', error: '',
    params: type === 'video' ? { ratio: '16:9', duration: 5, firstFrameNodeId: '' } : { size: '1024x1024' },
    createdAt: now(),
  };
  return {
    ...state,
    canvases: (state.canvases || []).map((c) => c.id === canvasId ? { ...c, nodes: [...c.nodes, node], updatedAt: now() } : c),
  };
};

export const updateCanvasNode = (state, canvasId, nodeId, updates) => ({
  ...state,
  canvases: (state.canvases || []).map((c) => c.id === canvasId
    ? { ...c, nodes: c.nodes.map((n) => n.id === nodeId ? { ...n, ...updates } : n), updatedAt: now() }
    : c),
});

export const removeCanvasNode = (state, canvasId, nodeId) => ({
  ...state,
  canvases: (state.canvases || []).map((c) => c.id === canvasId
    ? { ...c, nodes: c.nodes.filter((n) => n.id !== nodeId), updatedAt: now() }
    : c),
});

// ---------- 媒体生成 API 配置（图片 / 视频） ----------
export const MEDIA_KINDS = { image: '图片生成', video: '视频生成' };

export const addMediaProfile = (state, profile) => {
  const item = {
    id: uid(),
    name: profile.name || '未命名接口',
    kind: profile.kind === 'video' ? 'video' : 'image',
    endpoint: profile.endpoint || '',
    apiKey: profile.apiKey || '',
    model: profile.model || '',
    createdAt: now(),
  };
  const next = { ...state, mediaProfiles: [...(state.mediaProfiles || []), item] };
  const activeKey = item.kind === 'video' ? 'activeVideoApiId' : 'activeImageApiId';
  if (!next[activeKey]) next[activeKey] = item.id;
  return next;
};

export const updateMediaProfile = (state, profileId, updates) => ({
  ...state,
  mediaProfiles: (state.mediaProfiles || []).map((p) => p.id === profileId ? { ...p, ...updates } : p),
});

export const removeMediaProfile = (state, profileId) => {
  const mediaProfiles = (state.mediaProfiles || []).filter((p) => p.id !== profileId);
  const fix = (activeId) => activeId === profileId ? null : activeId;
  return { ...state, mediaProfiles, activeImageApiId: fix(state.activeImageApiId), activeVideoApiId: fix(state.activeVideoApiId) };
};

export const setActiveMediaApi = (state, kind, profileId) => ({
  ...state,
  [kind === 'video' ? 'activeVideoApiId' : 'activeImageApiId']: profileId,
});

export const activeMediaProfile = (state, kind) => {
  const activeId = kind === 'video' ? state.activeVideoApiId : state.activeImageApiId;
  return (state.mediaProfiles || []).find((p) => p.id === activeId && p.kind === kind)
    || (state.mediaProfiles || []).find((p) => p.kind === kind)
    || null;
};
