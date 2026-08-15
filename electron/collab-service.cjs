const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EDGE_FUNCTION_URL, SUPABASE_URL } = require('./cloud-config.public.cjs');
const NETWORK_ERROR = '无法连接云端服务，请检查网络后重试';
const mimeFor = (ext) => ({ '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4' }[ext] || 'application/octet-stream');
async function gateway(action, payload = {}, token = '') {
  let response;
  try { response = await fetch(EDGE_FUNCTION_URL, { method:'POST', headers:{'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {})}, body:JSON.stringify({action,...payload}) }); }
  catch { throw new Error(NETWORK_ERROR); }
  const text = await response.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(data?.error || `云端请求失败（${response.status}）`); return data;
}
async function uploadToBucket(projectId, filePath, kindHint, token) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('素材文件不存在');
  const ext = (path.extname(filePath) || '.bin').toLowerCase(); const key = `${kindHint || 'media'}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const uploaded=await gateway('upload-media', { projectId, key, mime: mimeFor(ext), content: fs.readFileSync(filePath).toString('base64') }, token);return {url:uploaded.url,objectPath:uploaded.objectPath,filename:path.basename(filePath),mime:mimeFor(ext)};
}
function createCollabService(getSession) {
  const session = () => getSession() || {};
  const account = () => { const a = session().account || session(); if (!a?.id) throw new Error('请先登录账号'); return a; };
  const call = (action, payload = {}) => gateway(action, payload, session().token || '');
  return {
    isProducer: () => call('producer-status').then(r => r.isProducer === true),
    adminSetProducer: (p) => call('admin-set-producer', p),
    createProject: (p) => call('project-create', p), listProjects: () => call('project-list'), getProject: (p) => call('project-get', p), updateProject: (p) => call('project-update', p), linkDirector: (p) => call('project-link-director', p), setProjectLocked: (p) => call('project-lock', p), deleteProject: (p) => call('project-delete', p), restoreProject: (p) => call('project-restore', p),
    createDirectorProject: (p) => call('director-project-create', p), listDirectorProjects: () => call('director-project-list'), getDirectorProject: (p) => call('director-project-get', p), updateDirectorProject: (p) => call('director-project-update', p), deleteDirectorProject: (p) => call('director-project-delete', p), setDirectorProjectLocked: (p) => call('director-project-lock', p),
    directorListMembers: (p) => call('director-members-list', p), directorAddMember: (p) => call('director-member-add', p), directorRemoveMember: (p) => call('director-member-remove', p),
    replaceAssets: (p) => call('assets-replace', p), createAsset: (p) => call('asset-create', p), listAssets: (p) => call('assets-list', p), updateAsset: (p) => call('asset-update', p),
    attachAssetImage: async (p) => { const uploaded = await uploadToBucket(p.projectId, p.filePath, 'asset', session().token || ''); return call('asset-image-record', { ...p, ...uploaded }); },
    attachGeneratedAssetImage: async (p) => { const uploaded = await uploadToBucket(p.projectId, p.filePath, 'asset', session().token || ''); return call('asset-image-record', { projectId: p.projectId, assetId: p.assetId, episode:p.episode||0, ...uploaded }); },
    deleteAssetImage: (p) => call('asset-image-delete', p), clearAssetImages: (p) => call('asset-images-clear', p),
    listMembers: (p) => call('members-list', p), addMember: (p) => call('member-add', p), updateMemberRole: (p) => call('member-role', p), removeMember: (p) => call('member-remove', p),
    listTasks: (p) => call('tasks-list', p), assignTask: (p) => call('task-assign', p), updateTask: (p) => call('task-update', p), deleteTask: (p) => call('task-delete', p),
    listMedia: (p) => call('media-list', p),
    uploadMedia: async (p) => { const uploaded = await uploadToBucket(p.projectId, p.filePath, p.kind, session().token || ''); return call('media-record', { ...p, ...uploaded }); },
    recordGeneratedMedia: async (p) => { const uploaded = await uploadToBucket(p.projectId, p.filePath, p.kind || 'media', session().token || ''); return call('media-record', { ...p, ...uploaded }); },
    deleteMedia: (p) => call('media-delete', p), listMessages: (p) => call('messages-list', p), sendMessage: async (p) => { const uploaded = p.imagePath ? await uploadToBucket(p.projectId, p.imagePath, 'chat', session().token || '') : null; return call('message-send', { ...p, imageUrl:uploaded?.url||'' }); }, getStats: (p) => call('stats-get', p),
    _account: account,
  };
}
module.exports = { createCollabService, uploadToBucket, gateway };
