const fs = require('fs');
const path = require('path');
const {projectMediaMime} = require('./local-project-media.cjs');
const { isMediaNetworkError } = require('./media-network.cjs');
// 复用带端点回退的 gateway：域名被拦截时自动切到服务器 IP。
const { gateway: sharedGateway } = require('./cloud-access-service.cjs');
const gateway = (action, payload = {}, token = '') => sharedGateway(action, payload, token);
// 通过服务端签名直传腾讯云 COS：大文件不再经过 JSON base64，避免内存暴涨与请求体超限。
async function uploadToBucket(projectId, filePath, kindHint, token) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('素材文件不存在');
  const ext = (path.extname(filePath) || '.bin').toLowerCase();
  const mime = projectMediaMime(ext, kindHint);
  const filename = path.basename(filePath);
  const kind = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'doc';
  const signed = await gateway('media-upload-url', { projectId, filename, kind, mime }, token);
  const body = fs.readFileSync(filePath);
  // PUT to this exact signed object is idempotent. A retry cannot create another photo.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const put = await require('./win-ai-api-fetch.cjs').winAIFetch(signed.url, {
        method: 'PUT', headers: { Authorization: signed.authorization, 'Content-Type': signed.contentType || mime, 'Content-Length': String(body.length) },
        body, signal: AbortSignal.timeout(120000),
      });
      await put.body?.cancel?.();
      if (!put.ok) throw Object.assign(new Error(`素材上传失败（${put.status}）`), {retryable:[408,429,500,502,503,504].includes(put.status)});
      break;
    } catch (error) {
      if (attempt === 2 || !(error.retryable || isMediaNetworkError(error))) throw new Error(`图片或素材保存到云端失败，本地文件已保留，请重试保存：${String(error.message||'上传失败').replace(/https?:\/\/[^\s]+/g,'[上传地址]')}`);
      await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));
    }
  }
  return { url: signed.url || '', objectPath: signed.objectKey, objectKey: signed.objectKey, filename, mime, kind };
}
function createCollabService(getSession, {callGateway=gateway, upload=uploadToBucket, fetchFn=require('./win-ai-api-fetch.cjs').winAIFetch} = {}) {
  const session = () => getSession() || {};
  const account = () => { const a = session().account || session(); if (!a?.id) throw new Error('请先登录账号'); return a; };
  const call = (action, payload = {}) => callGateway(action, payload, session().token || '');
  const reviewCall=async(action,{accountId:expected,...payload})=>{
    const matches=()=>expected===undefined||String(session().account?.id||session().id||'')===String(expected);
    if(!matches())throw Error('账号已变化，请回到原账号继续发布');
    const result=await call(action,payload);
    if(!matches())throw Error('账号已变化，发布回执已保留，请回到原账号重试');
    return result;
  };
  const attaching = new Map();
  const attachGenerated = p => {
    const key = `${account().id}:${p.projectId}:${p.assetId}:${p.filePath}`;
    if (attaching.has(key)) return attaching.get(key);
    const work = (async () => {
      // Generated filenames are unique and retained during recovery. Reconcile a
      // previous successful record whose response was lost before uploading again.
      const rows = await call('assets-list', {projectId:p.projectId});
      const existing = rows.find(a=>a.id===p.assetId)?.images?.find(i=>i.filename===path.basename(p.filePath));
      if (existing) return existing;
      const uploaded = await upload(p.projectId,p.filePath,'asset',session().token || '');
      return call('asset-image-record',{projectId:p.projectId,assetId:p.assetId,episode:p.episode||0,...uploaded});
    })().finally(()=>attaching.delete(key));
    attaching.set(key,work); return work;
  };
  return {
    isProducer: () => call('producer-status').then(r => r.isProducer === true),
    adminSetProducer: (p) => call('admin-set-producer', p),
    publishAnalysis:p=>call('analysis-publish',{...p,ackOnly:true}),
    saveArtReview:p=>reviewCall('art-review-save',p),
    savePromptBinding:p=>call('prompt-binding-save',p),
    publishArtReview:p=>reviewCall('art-review-publish',p),
    appendEpisode:p=>call('art-episode-append',p),
    resolveEpisodeIdentity:p=>call('episode-identity-resolve',p),
    async patchStoryboard(p) {
      const expectedToken=session().token||'';
      const expectedAccount=String(session().account?.id||session().id||'');
      const sameSession=()=>String(session().token||'')===String(expectedToken)&&String(session().account?.id||session().id||'')===expectedAccount;
      try {
        const result=await call('storyboard-patch',p);
        if(!sameSession())throw Error('账号已变化，保存回执已保留，请回到原账号继续');
        return result;
      }
      catch(error) {
        if(!sameSession()||!p.ackOnly||p.operation||!/未确认本次保存/.test(error.message))throw error;
        const saved=await call('project-get',{projectId:p.projectId,episodeId:p.episodeId,shotId:p.shotId,shotReceipt:true}).catch(()=>null);
        if(!sameSession())throw Error('账号已变化，保存回执已保留，请回到原账号继续');
        const shot=saved?.storyboardReceipt?.shot;
        if(shot&&(shot.storyboardPublicationId||'')===(p.storyboardPublicationId||'')&&Object.entries(p.updates||{}).every(([key,value])=>require('node:util').isDeepStrictEqual(shot[key],value)))return saved;
        throw error;
      }
    },
    localProjectState: p => call('project-local-state',p),
    prepareLocalShare: p => call('project-local-share-prepare',p),
    readLocalShareReceipt: p => call('project-local-share-receipt',p),
    commitLocalShare: p => callGateway('project-local-share',p,session().token || '',{timeoutMs:120000}),
    createProject: (p) => call('project-create', p), listProjects: () => call('project-list', {summary:true}), getProject: (p) => call('project-get', p), updateProject: (p) => call('project-update', p), linkDirector: (p) => call('project-link-director', p), setProjectLocked: (p) => call('project-lock', p), deleteProject: (p) => call('project-delete', p), restoreProject: (p) => call('project-restore', p),
    createDirectorProject: (p) => call('director-project-create', p), listDirectorProjects: (p={}) => call('director-project-list',p), getDirectorProject: (p) => call('director-project-get', p), updateDirectorProject: (p) => call('director-project-update', p), deleteDirectorProject: (p) => call('director-project-delete', p), setDirectorProjectLocked: (p) => call('director-project-lock', p),
    directorListMembers: (p) => call('director-members-list', p), directorAddMember: (p) => call('director-member-add', p), directorRemoveMember: (p) => call('director-member-remove', p),
    directorSyncLive:p=>call('director-live-sync',p),
    directorListVersions:p=>call('director-version-list',p),directorGetVersion:p=>call('director-version-get',p),directorPublishVersion:p=>call('director-version-publish',p),directorRestoreVersion:p=>call('director-version-restore',p),
    replaceAssets: (p) => call('assets-replace', p), createAsset: (p) => call('asset-create', p), listAssets: (p) => call('assets-list', p), updateAsset: (p) => call('asset-update', p),
    resolveAssetImage: (p) => call('asset-image-url', p),
    attachAssetImage: async (p) => { const uploaded = await uploadToBucket(p.projectId, p.filePath, 'asset', session().token || ''); return call('asset-image-record', { ...p, ...uploaded }); },
    attachGeneratedAssetImage: attachGenerated,
    deleteAssetImage: (p) => call('asset-image-delete', p), clearAssetImages: (p) => call('asset-images-clear', p),
    listMembers: (p) => call('members-list', p), addMember: (p) => call('member-add', p), updateMemberRole: (p) => call('member-role', p), removeMember: (p) => call('member-remove', p),
    listTasks: (p) => call('tasks-list', p), assignTask: (p) => call('task-assign', p), updateTask: (p) => call('task-update', p), deleteTask: (p) => call('task-delete', p),
    listMedia: (p) => call('media-list', p),
    uploadMedia: async (p) => { const uploaded = await uploadToBucket(p.projectId, p.filePath, p.kind, session().token || ''); return call('media-record', { ...p, ...uploaded }); },
    recordGeneratedMedia: async (p) => { const uploaded = await uploadToBucket(p.projectId, p.filePath, p.kind || 'media', session().token || ''); return call('media-record', { ...p, ...uploaded }); },
    deleteMedia: async ({accountId:expected,...p}) => {
      if(expected!==undefined&&String(account().id)!==String(expected))throw Error('账号已切换，删除已停止');
      const result=await call('media-delete',p);
      // The record is already gone: report cleanup separately so callers always
      // remove stale draft references even when COS is temporarily unreachable.
      if(!result?.remove?.url)return result;
      try {
        const response=await fetchFn(result.remove.url,{method:'DELETE',headers:{Authorization:result.remove.authorization},redirect:'error',signal:AbortSignal.timeout(15000)});
        await response.body?.cancel?.();
        if(!response.ok&&response.status!==404)throw Error('object cleanup failed');
        return {...result,objectDeleted:true};
      } catch {return {...result,objectDeleted:false,cleanupWarning:'素材记录已删除，云端文件清理暂未完成'};}
    }, listMessages: (p) => call('messages-list', p), sendMessage: async (p) => { const uploaded = p.imagePath ? await uploadToBucket(p.projectId, p.imagePath, 'chat', session().token || '') : null; return call('message-send', { ...p, imageUrl:uploaded?.url||'' }); }, getStats: (p) => call('stats-get', p),
    _account: account,
  };
}
module.exports = { createCollabService, uploadToBucket, gateway };
