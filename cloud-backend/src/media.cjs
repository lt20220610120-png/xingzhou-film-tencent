const { buildObjectKey } = require('./cos.cjs');

const NO_STORAGE = { status: 503, body: { error: '媒体存储尚未配置，请联系管理员' } };

const publicMedia = (row) => ({
  id: row.id, projectId: row.project_id, assetId: row.asset_id || null, userId: row.user_id || null,
  episode: row.episode || 0, scene: row.scene || '', kind: row.kind || 'file',
  filename: row.filename || '', mime: row.mime || '', note: row.note || '',
  objectKey: row.object_path || '', username: row.username || '', createdAt: row.created_at,
});

async function handleMediaAction(action, payload, user, repo, signer) {
  if (!user) return { status: 401, body: { error: '请先登录账号' } };
  if (!signer) return NO_STORAGE;
  const projectId = String(payload?.projectId || '');

  if (action === 'media-upload-url') {
    if (!await repo.getProject(projectId, user.id)) return { status: 403, body: { error: '你没有这个项目的访问权限' } };
    const objectKey = buildObjectKey({ projectId, kind: payload?.kind, filename: payload?.filename });
    const signed = signer.signUpload({ objectKey, contentType: payload?.mime });
    return { status: 200, body: { method: signed.method, url: signed.url, authorization: signed.authorization, objectKey, contentType: signed.contentType, expiresAt: signed.expiresAt } };
  }

  if (action === 'media-commit' || action === 'media-record') {
    if (!await repo.getProject(projectId, user.id)) return { status: 403, body: { error: '你没有这个项目的访问权限' } };
    const objectKey = String(payload?.objectKey || '');
    // 对象键必须落在本项目目录下，防止把记录指向他人项目的文件。
    if (!objectKey.startsWith(`projects/${projectId}/`)) return { status: 400, body: { error: '媒体存储路径不合法' } };
    const saved = await repo.createMedia(projectId, {
      asset_id: payload?.assetId || null, episode: Number(payload?.episode || 0),
      scene: String(payload?.scene || ''), kind: String(payload?.kind || 'file'),
      object_path: objectKey, filename: String(payload?.filename || ''),
      mime: String(payload?.mime || ''), note: String(payload?.note || ''),
      username: user.display_name || user.username, url: '',
    }, user.id);
    return { status: 200, body: publicMedia(saved) };
  }

  if (action === 'media-list') {
    if (!await repo.getProject(projectId, user.id)) return { status: 403, body: { error: '你没有这个项目的访问权限' } };
    const rows = await repo.listMedia(projectId, user.id);
    // 每条记录附带短时签名地址，界面可直接显示图片或播放视频。
    return { status: 200, body: rows.map((row) => ({ ...publicMedia(row), url: row.object_path ? signer.signDownload({ objectKey: row.object_path }).url : '' })) };
  }

  if (action === 'media-download-url') {
    const found = await repo.findMedia(String(payload?.mediaId || ''), user.id);
    if (!found) return { status: 404, body: { error: '媒体不存在或无权访问' } };
    const signed = signer.signDownload({ objectKey: found.object_path });
    return { status: 200, body: { url: signed.url, expiresAt: signed.expiresAt, filename: found.filename, mime: found.mime } };
  }

  if (action === 'media-delete') {
    let removed;
    if (payload?.purpose === 'reference-upload') {
      const project = projectId && await repo.getProject(projectId, user.id);
      if (!project || String(project.genre || '').includes('[DIRECTOR_PROJECT]')) return {status:403,body:{error:'你没有这个项目的操作权限'}};
      if (project.deleted_at || String(project.genre || '').includes('[RECYCLE_UNTIL:')) return {status:410,body:{error:'项目已删除，请先恢复'}};
      if (String(project.genre || '').includes('[PROJECT_LOCKED]')) return {status:423,body:{error:'项目已锁定，暂不可删除'}};
      let locked;
      try { locked = await repo.isProjectLocked(projectId); } catch { locked = undefined; }
      if (locked === true) return {status:423,body:{error:'项目已锁定，暂不可删除'}};
      if (locked !== false) return {status:503,body:{error:'暂时无法确认项目锁定状态，请稍后重试'}};
      const role = project.owner_id === user.id ? 'producer' : (await repo.findMembership(projectId,user.id))?.role;
      if (!['producer','collaborator','artist_collaborator'].includes(role)) return {status:403,body:{error:'你没有这个项目的删除权限'}};
      const found = await repo.findMedia(String(payload.mediaId || ''),user.id);
      if (!found) return {status:404,body:{error:'媒体不存在或无权删除'}};
      if (found.project_id !== projectId || found.user_id !== user.id || found.asset_id || found.adoptedVoice || !/^参考素材\s/.test(found.note || '') || !['image','audio','video'].includes(found.kind)) return {status:403,body:{error:'只能删除自己上传的参考素材，已采用的资产和音色不能在此删除'}};
      if (!require('./reference-upload-delete.cjs').validReferenceObject(found)) return {status:400,body:{error:'媒体存储路径不合法'}};
      if (typeof repo.deleteReferenceUpload !== 'function') return {status:503,body:{error:'参考素材删除服务尚未就绪'}};
      removed = await repo.deleteReferenceUpload(projectId,found.id,user.id);
    } else removed = await repo.deleteMedia(String(payload?.mediaId || ''), user.id);
    if (!removed) return { status: 404, body: { error: '媒体不存在或无权删除' } };
    const signed = signer.signDelete({ objectKey: removed.object_path });
    return { status: 200, body: { ok: true, remove: { method: signed.method, url: signed.url, authorization: signed.authorization } } };
  }

  return { status: 501, body: { error: '腾讯云版该媒体功能正在接入中' } };
}

module.exports = { handleMediaAction, publicMedia };
