import {normalizeCapabilities} from './modelCapabilities.js';
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
import feituoModels from './feituo-models.json' with { type: 'json' };
export const FEITUO_VIDEO_MODELS = feituoModels.filter(m => m.kind === 'video');
export const VIDEO_MODEL_CAPABILITIES = {
  'seedance-2.0': { label: 'Seedance 2.0', durations: Array.from({ length: 15 }, (_, i) => i + 1), resolutions: ['480p', '720p', '1080p', '4K'], ratios: VIDEO_RATIOS, audio: true },
  'seedance-2.5': { label: 'Seedance 2.5', durations: [5, 10, 15, 20, 30], resolutions: ['480p', '720p', '1080p', '2K', '4K'], ratios: VIDEO_RATIOS, audio: true },
};
const builtinVideoCapabilities = (model = '') => {
  const id = String(model).toLowerCase();
  const feituo = FEITUO_VIDEO_MODELS.find((item) => item.id.toLowerCase() === id);
  if (feituo) return { label: feituo.name, durations: feituo.durations, ...feituo, resolutions: feituo.resolutions.length ? feituo.resolutions : ['固定'] };
  if (id.includes('seedance') && id.includes('2.5')) return VIDEO_MODEL_CAPABILITIES['seedance-2.5'];
  if (id.includes('seedance') && id.includes('2.0')) return VIDEO_MODEL_CAPABILITIES['seedance-2.0'];
  return { label: model || '通用视频模型', durations: VIDEO_DURATIONS, resolutions: ['480p', '720p', '1080p'], ratios: VIDEO_RATIOS, audio: false };
};

export const videoModelCapabilities = (model = '', profile = {}) => ({...builtinVideoCapabilities(model), ...normalizeCapabilities(profile?.capabilities)});
export function imageModelFormats(profile) {
  const caps = normalizeCapabilities(profile?.capabilities);
  if (caps.imageSizes?.length) return caps.imageSizes.map(size => ({value:size,label:size,size}));
  if (caps.ratios?.length) return caps.ratios.map(value => IMAGE_FORMATS.find(f=>f.value===value) || {value,label:value,size:value});
  return IMAGE_FORMATS;
}

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

export const FEITUO_ENDPOINT = 'https://feituokuajing.com';
export const isFeituoEndpoint = (endpoint) => {
  try {
    const url = new URL(String(endpoint || '').trim());
    return url.protocol === 'https:' && url.hostname === 'feituokuajing.com' && !url.username && !url.password;
  } catch { return false; }
};

// Older versions stored a separate profile for each model, sometimes only for
// video. Keep those IDs so pending jobs can still locate their credentials.
export const feituoCredentialProfile = (state) => {
  const profiles = (state.mediaProfiles || []).filter((profile) => isFeituoEndpoint(profile.endpoint) && String(profile.apiKey || '').trim());
  return profiles.find((profile) => profile.id === state.activeVideoApiId)
    || profiles.find((profile) => profile.id === state.activeImageApiId)
    || profiles[0] || null;
};

export const generationMediaProfiles = (state, kind) => {
  const credential = feituoCredentialProfile(state);
  const profiles = (state.mediaProfiles || []).filter((profile) => profile.kind === kind).map((profile) =>
    isFeituoEndpoint(profile.endpoint) && credential
      ? { ...profile, endpoint: FEITUO_ENDPOINT, apiKey: credential.apiKey }
      : profile);
  if (credential && !profiles.some((profile) => isFeituoEndpoint(profile.endpoint))) {
    profiles.push({ ...credential, kind, endpoint: FEITUO_ENDPOINT, name: `飞拓${MEDIA_KINDS[kind]}`, model: feituoModels.find((model) => model.kind === kind).id });
  }
  return profiles;
};

export const saveFeituoApiKey = (state, apiKey) => {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('请填写飞拓 API Key');
  let next = {
    ...state,
    mediaProfiles: (state.mediaProfiles || []).map((profile) => isFeituoEndpoint(profile.endpoint)
      ? { ...profile, endpoint: FEITUO_ENDPOINT, apiKey: key, updatedAt: now() }
      : profile),
  };
  for (const kind of ['video', 'image']) {
    const activeKey = kind === 'video' ? 'activeVideoApiId' : 'activeImageApiId';
    let profile = next.mediaProfiles.find((item) => item.id === next[activeKey] && item.kind === kind && isFeituoEndpoint(item.endpoint))
      || next.mediaProfiles.find((item) => item.kind === kind && isFeituoEndpoint(item.endpoint));
    if (!profile) {
      next = addMediaProfile(next, { kind, name: `飞拓${MEDIA_KINDS[kind]}`, endpoint: FEITUO_ENDPOINT, apiKey: key, model: feituoModels.find((model) => model.kind === kind).id });
      profile = next.mediaProfiles.at(-1);
    }
    next = setActiveMediaApi(next, kind, profile.id);
  }
  return next;
};

export const addMediaProfile = (state, profile) => {
  const item = {
    id: uid(),
    name: profile.name || '未命名接口',
    kind: ['video','audio'].includes(profile.kind) ? profile.kind : 'image',
    capabilities: normalizeCapabilities(profile.capabilities),
    endpoint: profile.endpoint || '',
    apiKey: profile.apiKey || '',
    model: profile.model || '',
    createdAt: now(),
  };
  const next = { ...state, mediaProfiles: [...(state.mediaProfiles || []), item] };
  const activeKey = item.kind === 'audio' ? 'activeAudioApiId' : item.kind === 'video' ? 'activeVideoApiId' : 'activeImageApiId';
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
  return { ...state, mediaProfiles, activeImageApiId: fix(state.activeImageApiId), activeVideoApiId: fix(state.activeVideoApiId), activeAudioApiId: fix(state.activeAudioApiId) };
};

export const setActiveMediaApi = (state, kind, profileId) => ({
  ...state,
  [kind === 'audio' ? 'activeAudioApiId' : kind === 'video' ? 'activeVideoApiId' : 'activeImageApiId']: profileId,
});

export const activeMediaProfile = (state, kind) => {
  const activeId = kind === 'video' ? state.activeVideoApiId : state.activeImageApiId;
  const profiles = generationMediaProfiles(state, kind);
  return profiles.find((p) => p.id === activeId)
    || profiles[0]
    || null;
};
