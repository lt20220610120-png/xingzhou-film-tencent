// ============================================================
// canvasStore.js — 画布领域逻辑（纯函数）
// 画布节点 + 媒体生成 API 配置
// ============================================================
import { uid, now } from './projectStore.js';

export const CANVAS_NODE_SIZE = { image: { w: 360, h: 300 }, video: { w: 420, h: 300 } };
export const IMAGE_FORMATS = [
  { value: '16:9', label: '16:9 · 横屏', size: '1280x720' },
  { value: '1:1', label: '1:1 · 方形', size: '1024x1024' },
  { value: '9:16', label: '9:16 · 竖屏', size: '720x1280' },
  { value: '4:3', label: '4:3 · 横屏', size: '1024x768' },
  { value: '3:4', label: '3:4 · 竖屏', size: '768x1024' },
  { value: '3:2', label: '3:2 · 横屏', size: '1152x768' },
  { value: '2:3', label: '2:3 · 竖屏', size: '768x1152' },
];
export const IMAGE_SIZES = IMAGE_FORMATS.map((item) => item.size);
export const VIDEO_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
export const VIDEO_DURATIONS = [5, 6, 10];
const FEITUO_4_30 = [4, 5, 10, 15, 20, 25, 30];
const FEITUO_4_15 = [4, 5, 10, 15];
export const FEITUO_VIDEO_MODELS = [
  ['特价渠道 MiniMax H3-768p', 'ft-video-v1-77e8ee7a636f15dac27b2ce6d6fcd746', Array.from({ length: 15 }, (_, i) => i + 1)],
  ['特价渠道 MiniMax H3-2k', 'ft-video-v1-8bd9134722affef343961958eae0f4ec', [15]],
  ['特价渠道 Seedance 2.0 mini 720p', 'ft-video-v1-dd97afc97a7c3cba8e78a6e429933597', [5, 10, 15]],
  ['特价渠道 Seedance 2.0 mini 720p（带音频参考）', 'ft-video-v1-6310889dcaf8407cf7108bc45ef84325', FEITUO_4_15],
  ['特价渠道 Seedance 2.0 fast 720p', 'ft-video-v1-3a5225a877a926e80b73e0264688e366', [10, 15]],
  ['特价渠道 Seedance 2.0 满血 720p（带音频参考）', 'ft-video-v1-31ea2a2a058bc3698dea4eaeb98ba7ed', [10, 15]],
  ['特价渠道 Seedance 2.5 满血 720p（可过真人）', 'ft-video-v1-1ba2f4c5b992260d2fdd48168ded9ade', [30]],
  ['长期特惠 Seedance 2.0 满血 720p', 'ft-video-v1-a4e45199f67ed84790ec03dfc2768a01', [5, 10, 15]],
  ['长期特惠 Seedance 2.5 满血 720p', 'ft-video-v1-bdf45387433ac0a9042ebab3fae0299d', [30]],
  ['XZ-Seedance 2.0 720p（10秒）', 'ft-video-v1-5d6b990f8ef1d6159d4c94454ed6db5f', [5, 10]],
  ['XZ-Seedance 2.0 720p（15秒）', 'ft-video-v1-81ceb24e127dcb0ccba4737c58170a3e', FEITUO_4_15],
  ['XZ-Seedance 2.0 720p（933全参）', 'ft-video-v1-b92bdf13b031fea6d7e80431def22584', FEITUO_4_15],
  ['XZ-Seedance 2.5 720p（9图参考）', 'ft-video-v1-69ef4c70291248a25c8198cd1c7c9c1f', FEITUO_4_30],
  ['XZ-Seedance 2.5 720p（10图全参）', 'ft-video-v1-3dd9e73a8bd0d4e06ba6ebcbddafd811', FEITUO_4_30],
  ['MiniMax H3-2k', 'ft-video-v1-76bf59a238f35f4f0da6616443ea6789', FEITUO_4_15],
  ['Wan 3.0 1080p（速度优化线路）', 'ft-video-v1-5c39062ebd696fff7c93dca19dc3b570', FEITUO_4_30],
  ['Wan 3.0 1080p（备用线路）', 'ft-video-v1-494f0d2c578fe3598b74122295b4fc57', FEITUO_4_30],
  ['ld-pro-Seedance 2.0 满血 720p（超分）', 'ft-video-v1-147de4bb09f8f058b934ea1ea4b1fefd', FEITUO_4_15],
  ['ld-Seedance 2.0 满血 720p', 'ft-video-v1-3c519942e1f2c46e9000fefd4da3a3d1', [5, 10, 15]],
  ['Seedance 2.0 fast 720p（优）', 'ft-video-v1-55508bd5edd0bd74e40fafda5c8f997b', FEITUO_4_15],
  ['Seedance 2.0 满血 720p（优）', 'ft-video-v1-eee6fc015866324b356a5ec183ea908b', FEITUO_4_15],
  ['Seedance 2.5 满血 480-720p', 'ft-video-v1-b287ad5773e68728a6f094a96791bed6', FEITUO_4_30],
  ['Seedance 2.5 满血 480p-1080p', 'ft-video-v1-d6c1fa8f03d81be4f5af1bf420b6fa9f', FEITUO_4_30],
].map(([name, id, durations]) => ({ name, id, durations, ratios: VIDEO_RATIOS }));
export const VIDEO_MODEL_CAPABILITIES = {
  'seedance-2.0': { label: 'Seedance 2.0', durations: Array.from({ length: 15 }, (_, i) => i + 1), resolutions: ['480p', '720p', '1080p', '4K'], ratios: VIDEO_RATIOS, audio: true },
  'seedance-2.5': { label: 'Seedance 2.5', durations: [5, 10, 15, 20, 30], resolutions: ['480p', '720p', '1080p', '2K', '4K'], ratios: VIDEO_RATIOS, audio: true },
};
export const videoModelCapabilities = (model = '') => {
  const id = String(model).toLowerCase();
  const feituo = FEITUO_VIDEO_MODELS.find((item) => item.id.toLowerCase() === id);
  if (feituo) return { label: feituo.name, durations: feituo.durations, resolutions: ['480p', '720p', '1080p'], ratios: feituo.ratios, audio: false };
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
    params: type === 'video' ? { ratio: '16:9', duration: 5, resolution: '720p', firstFrameNodeId: '' } : { size: IMAGE_FORMATS[0].size },
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
