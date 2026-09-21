const DENY = { status: 403, body: { error: '你没有这个项目的操作权限' } };
const NOT_FOUND = { status: 404, body: { error: '项目不存在或无权访问' } };
const LOCKED = { status: 423, body: { error: '项目已锁定，暂不可编辑' } };
const DELETED = { status: 410, body: { error: '项目已删除，请先恢复' } };
const STATE_UNAVAILABLE = { status: 503, body: { error: '暂时无法确认项目锁定状态，请稍后重试' } };
const ok = (body) => ({ status: 200, body });

// 统一处理：仓储返回 null 表示无权限或不存在。
const guard = (value) => (value === null || value === undefined ? null : value);

// 与 Supabase 版一致的内部标记：不能泄露给客户端，且要从中提取导演项目关联。
const COLLAB_SENTINEL = '[COLLAB_PROJECT]';
const DIRECTOR_SENTINEL = '[DIRECTOR_PROJECT]';
const LOCK_SENTINEL = '[PROJECT_LOCKED]';
const recycleUntil = (genre) => (String(genre || '').match(/\[RECYCLE_UNTIL:([^\]]+)\]/) || [])[1] || '';
const collabSource = (genre) => (String(genre || '').match(/\[COLLAB_SOURCE:([^\]]+)\]/) || [])[1] || '';
const stripInternalGenre = (genre) => String(genre || '')
  .replace(/\n?\[(?:COLLAB_PROJECT|DIRECTOR_PROJECT|PROJECT_LOCKED|COLLAB_LOCAL_SOURCE|COLLAB_SOURCE:[^\]]+|RECYCLE_UNTIL:[^\]]+)\]/g, '')
  .trim();

// 客户端按 myRole 决定可见功能区：
//   producer 看全部；artist 看美术；collaborator 看分镜。
// 所有者恒为 producer，其余取成员表角色，默认 collaborator。
// 统一对外表示：剥离内部标记、暴露 director_project_id 与 locked。
function present(row, myRole) {
  return {
    ...row,
    genre: stripInternalGenre(row.genre),
    director_project_id: row.director_project_id || collabSource(row.genre),
    locked: String(row.genre || '').includes(LOCK_SENTINEL),
    // 回收站：Supabase 用 genre 里的 RECYCLE_UNTIL 标记表达删除态，
    // 客户端靠 deleted_at 显示“恢复项目”，靠 purge_after 显示到期时间。
    deleted_at: recycleUntil(row.genre) ? new Date(new Date(recycleUntil(row.genre)).getTime() - 3 * 86400000).toISOString() : null,
    purge_after: recycleUntil(row.genre) || null,
    myRole,
  };
}

// 取当前用户在项目中的角色：所有者恒为 producer。
async function roleOf(pid, user, repo) {
  const row = await repo.getProject(pid, user.id);
  if (!row) return null;
  if (row.owner_id === user.id) return 'producer';
  const m = await repo.findMembership(pid, user.id);
  return m && m.role ? m.role : 'collaborator';
}

async function attachRole(row, user, repo) {
  if (!row) return row;
  if (row.owner_id === user.id) return present(row, 'producer');
  let members = [];
  try { members = (await repo.listMembers(row.id, user.id)) || []; } catch { members = []; }
  const mine = members.find((m) => m.user_id === user.id);
  return present(row, mine && mine.role ? mine.role : 'collaborator');
}

async function handleAction(action, payload, user, repo, signer = null, imagePreview = null) {
  if (!user) return { status: 401, body: { error: '请先登录账号' } };
  const projectId = payload.projectId || payload.id;
  const producer = user.is_producer === true || user.is_admin === true;

  if (action === 'producer-status') return ok({ isProducer: producer });

  const COLLAB_ACTIONS = ['project-get','project-update','project-delete','project-restore','project-lock','project-link-director','stats-get',
    'art-episode-append','analysis-publish','storyboard-patch','assets-list','assets-replace','asset-create','asset-update','asset-image-record','asset-image-url','asset-image-delete','asset-images-clear',
    'tasks-list','task-assign','task-update','task-delete','messages-list','message-send'];
  let collabRow;
  if(projectId&&COLLAB_ACTIONS.includes(action)) {
    collabRow=await repo.getProject(projectId,user.id);
    if(!collabRow||String(collabRow.genre||'').includes(DIRECTOR_SENTINEL))return action==='project-get'?NOT_FOUND:DENY;
  }

  // Ordinary writes fail closed. Restore may reactivate a recycled project;
  // project-lock may unlock a live one, but cannot mutate a recycled one.
  const WRITE_ACTIONS = ['assets-replace','asset-create','asset-update','asset-image-record','asset-image-delete','asset-images-clear','task-assign','task-update','task-delete','media-record','media-delete','message-send',
    'project-update','project-delete','project-link-director','art-episode-append','analysis-publish','storyboard-patch','member-add','member-remove','member-role','project-lock'];
  if (WRITE_ACTIONS.includes(action)) {
    if (!projectId) return DENY;
    const row = collabRow || await repo.getProject(projectId,user.id);
    if (!row || String(row.genre||'').includes(DIRECTOR_SENTINEL)) return DENY;
    if (row.deleted_at || String(row.genre||'').includes('[RECYCLE_UNTIL:')) return DELETED;
    if (action !== 'project-lock') {
      if (String(row.genre||'').includes(LOCK_SENTINEL)) return LOCKED;
      let locked;
      try { locked = await repo.isProjectLocked(projectId); } catch { return STATE_UNAVAILABLE; }
      if (locked === true) return LOCKED;
      if (locked !== false) return STATE_UNAVAILABLE;
    }
  }

  // ---- 协作项目 ----
  if (action === 'project-create') {
    try {
      const created = await repo.createProject({ ...payload, ownerId: user.id, ownerName: user.display_name || user.username, ownerUsername: user.username });
      return ok(await attachRole(created, user, repo));
    } catch (error) {if (error.status) return {status:error.status,body:{error:error.message}}; throw error;}
  }
  if (action === 'project-list') {
    // 只返回“协作项目”（非导演文档）；含回收站中的项目，客户端据 deleted_at 显示恢复入口。
    const rows = (await repo.listProjects(user.id)) || [];
    const collabOnly = rows.filter((row) => !String(row.genre || '').includes(DIRECTOR_SENTINEL));
    const projects = await Promise.all(collabOnly.map((row) => attachRole(row, user, repo)));
    return ok(payload.summary ? projects.map(({script, episodes, analysis_output, analysis_progress, ...row}) => ({
      ...row, episodeCount: (episodes || []).length,
    })) : projects);
  }
  if (action === 'project-get') {
    try {const r = guard(repo.refreshDirectorPrompts ? await repo.refreshDirectorPrompts(projectId,user.id) : await repo.getProject(projectId, user.id)); return r ? ok(await attachRole(r, user, repo)) : NOT_FOUND;}
    catch(error){if(error.status)return {status:error.status,body:{error:error.message}};throw error;}
  }
  if (action === 'art-episode-append') {
    if (await repo.isProjectLocked(projectId)) return LOCKED;
    const row = await repo.getProject(projectId, user.id);
    if (!row || String(row.genre || '').includes(DIRECTOR_SENTINEL)) return DENY;
    if (!['producer', 'artist', 'artist_collaborator'].includes(await roleOf(projectId, user, repo))) return DENY;
    try {
      const saved = await repo.appendArtEpisode(projectId, payload, user.id);
      return saved ? ok(await attachRole(saved, user, repo)) : DENY;
    } catch (error) {
      if (error.status) return {status: error.status, body: {error: error.message}};
      throw error;
    }
  }
  if (action === 'analysis-publish'){
    if(!['producer','artist','artist_collaborator'].includes(await roleOf(projectId,user,repo)))return DENY;
    try{const saved=await repo.publishAnalysis(projectId,payload,user.id);return saved?ok(payload.ackOnly?{id:saved.id,updated_at:saved.updated_at,fingerprint:payload.fingerprint}:await attachRole(saved,user,repo)):DENY;}
    catch(e){if(e.status)return {status:e.status,body:{error:e.message}};throw e;}
  }
  if (action === 'storyboard-patch') {
    if(await repo.isProjectLocked(projectId))return LOCKED;
    const role=await roleOf(projectId,user,repo);
    if(!['producer','collaborator','artist_collaborator'].includes(role))return DENY;
    try{const saved=await repo.patchStoryboard(projectId,payload,user.id);return saved?ok(await attachRole(saved,user,repo)):DENY;}
    catch(error){if(error.status)return {status:error.status,body:{error:error.message}};throw error;}
  }
  if (action === 'project-update') {
    // Supabase 契约：updates + scope，按 scope 限定可写字段与所需角色。
    if (await repo.isProjectLocked(projectId)) return LOCKED;
    const row = await repo.getProject(projectId, user.id);
    if (!row || String(row.genre || '').includes(DIRECTOR_SENTINEL)) return DENY;
    const myRole = await roleOf(projectId, user, repo);
    if (!myRole) return DENY;
    const scope = String(payload.scope || '');
    if (!['', 'director-sync', 'storyboard'].includes(scope)) return DENY;
    if (scope === 'director-sync' && myRole !== 'producer') return DENY;
    if (!scope && myRole !== 'producer') return DENY;
    if (scope === 'storyboard' && !['producer', 'collaborator', 'artist_collaborator'].includes(myRole)) return DENY;
    const keys = scope === 'director-sync' ? ['script', 'episodes']
      : scope === 'storyboard' ? ['episodes']
      : ['name', 'style', 'genre', 'script', 'analysis_output', 'episodes'];
    const updates = payload.updates || payload;
    const allowed = {};
    for (const k of keys) if (k in updates) allowed[k] = updates[k];
    try {
      const saved = guard(scope === 'director-sync' && repo.syncDirectorSnapshot ? await repo.syncDirectorSnapshot(projectId,allowed,user.id) : await repo.updateProjectFields(projectId, allowed,user.id,scope));
      return saved ? ok(await attachRole(saved, user, repo)) : DENY;
    } catch (error) {if (error.status) return {status:error.status,body:{error:error.message}}; throw error;}
  }
  if (action === 'project-delete') { const r = guard(await repo.softDeleteProject(projectId, user.id)); return r ? ok({ ok: true, purgeAfter: r.purge_after }) : DENY; }
  if (action === 'project-restore') { const r = guard(await repo.restoreProject(projectId, user.id)); return r ? ok({ ok: true }) : { status: 410, body: { error: '恢复窗口已过期' } }; }
  if (action === 'project-lock') { const r = guard(await repo.setProjectLocked(projectId, payload.locked !== false, user.id)); return r ? ok({ ok: true }) : DENY; }
  if (action === 'project-link-director') {
    try{const r = guard(await repo.linkDirectorProject(projectId, payload.directorProjectId, user.id)); return r ? ok({ ok: true }) : DENY;}
    catch(error){if(error.status)return {status:error.status,body:{error:error.message}};throw error;}
  }
  if (action === 'stats-get') {
    // Supabase 契约：返回 {members, activity, media} 三个数组，客户端 summarizeActivity 会遍历。
    if (!await repo.getProject(projectId, user.id)) return NOT_FOUND;
    const bundle = await repo.getStatsBundle(projectId);
    return ok({ members: bundle.members || [], activity: bundle.activity || [], media: bundle.media || [] });
  }

  // ---- 导演项目 ----
  const DIRECTOR_ACTIONS = ['director-project-get','director-project-update','director-project-delete','director-project-lock',
    'director-members-list','director-member-add','director-member-remove'];
  if (DIRECTOR_ACTIONS.includes(action)) {
    const pid = payload.directorProjectId || projectId;
    const row = pid && await (repo.getProject ? repo.getProject(pid, user.id) : repo.getDirectorProject(pid, user.id));
    if (!row || !String(row.genre || '').includes(DIRECTOR_SENTINEL)
      || String(row.genre || '').includes(COLLAB_SENTINEL) || row.deleted_at || recycleUntil(row.genre))
      return action === 'director-project-get' ? NOT_FOUND : DENY;
  }
  if (action === 'director-project-create') {
    if (!producer) return { status: 403, body: { error: '需要制片人权限才能开启导演协作' } };
    return ok(await repo.createDirectorProject({ ...payload, ownerUsername: user.username }, user.id, user.display_name || user.username));
  }
  if (action === 'director-project-list') {
    // 客户端 cloudForProject 依赖 analysis_output === 导演项目本地ID；
    // “管理协作/开启导演协作”按钮依赖 myRole / locked / collaborationLinked。
    const rows = (await repo.listDirectorProjectRows(user.id)) || [];
    let links = [];
    try { links = (await repo.listCollabLinks()) || []; } catch { links = []; }
    const out = [];
    for (const row of rows) {
      const member = await repo.findMembership(row.id, user.id);
      const myRole = row.owner_id === user.id ? 'producer' : (member && member.role ? member.role : '');
      if (!myRole) continue;
      const source = row.analysis_output || '';
      // 被“项目协作”单向引用且该协作项目未进回收站时，禁止直接删除云端导演项目。
      const collaborationLinked = links.some((link) => collabSource(link.genre) === source && !recycleUntil(link.genre));
      out.push({
        ...row,
        genre: stripInternalGenre(row.genre),
        analysis_output: source,
        myRole,
        locked: String(row.genre || '').includes(LOCK_SENTINEL),
        collaborationLinked,
      });
    }
    return ok(out);
  }
  if (action === 'director-project-get') { const r = guard(await repo.getDirectorProject(payload.directorProjectId || projectId, user.id)); return r ? ok(r) : NOT_FOUND; }
  if (action === 'director-project-update') { try { const r = guard(await repo.updateDirectorProject(payload.directorProjectId || projectId, payload, user.id)); return r ? ok(r) : DENY; } catch(error) { if(error.status)return {status:error.status,body:{error:error.message}};throw error; } }
  if (action === 'director-project-delete') { try {const r = guard(await repo.deleteDirectorProject(payload.directorProjectId || projectId, user.id)); return r ? ok({ ok: true }) : DENY;} catch(error) {if(error.status)return {status:error.status,body:{error:error.message}};throw error;} }
  if (action === 'director-project-lock') { const r = guard(await repo.setDirectorProjectLocked(payload.directorProjectId || projectId, payload.locked !== false, user.id)); return r ? ok({ ok: true }) : DENY; }

  // ---- 成员（导演项目与协作项目共用成员表）----
  if (['members-list','member-add','member-remove','member-role'].includes(action)) {
    const row=projectId&&await repo.getProject(projectId,user.id);
    if(!row||String(row.genre||'').includes(DIRECTOR_SENTINEL))return DENY;
  }
  if (action === 'director-members-list' || action === 'members-list') {
    const pid = payload.directorProjectId || projectId;
    const r = guard(await repo.listDirectorMembers(pid, user.id, action === 'director-members-list' ? 'director' : 'collab'));
    return r ? ok(r) : NOT_FOUND;
  }
  if (action === 'director-member-add' || action === 'member-add') {
    const pid = payload.directorProjectId || projectId;
    const r = guard(await repo.addDirectorMember(pid, payload, user.id, action === 'director-member-add' ? 'director' : 'collab'));
    if (!r) return DENY;
    if (r.error === 'user_not_found') return { status: 404, body: { error: '账号不存在，请确认对方已注册' } };
    return ok(r);
  }
  if (action === 'director-member-remove' || action === 'member-remove') {
    const pid = payload.directorProjectId || projectId;
    const r = guard(await repo.removeDirectorMember(pid, payload.userId, user.id, action === 'director-member-remove' ? 'director' : 'collab'));
    return r ? ok({ ok: true }) : DENY;
  }
  if (action === 'member-role') { const r = guard(await repo.updateMemberRole(projectId, payload, user.id)); return r ? ok(r) : DENY; }

  // ---- 资产 ----
  if (action === 'assets-list') {
    const rows = (await repo.listAssets(projectId, user.id)) || [];
    let images = [];
    try { images = (await repo.listAssetImages(projectId, user.id)) || []; } catch { images = []; }
    // 资产附带图片列表：signer 在 media 层负责签名，这里只给出对象路径。
    const { assetImageLink } = require('./asset-image-links.cjs');
    images = [...new Map(images.map(image => [image.id, image])).values()];
    return ok(rows.map((row) => ({
      ...row,
      image_url: assetImageLink(row.image_url, signer).url,
      images: images.filter((img) => img.asset_id === row.id).map((img) => ({ id: img.id, projectId, assetId: row.id, ...assetImageLink(img.object_path, signer), filename: img.filename, mime: img.mime })),
    })));
  }
  if (action === 'asset-image-url') {
    const { assetImageLink } = require('./asset-image-links.cjs');
    const withPreview = async image => {
      if (payload.preview === true && imagePreview) {
        const previewDataUrl = await imagePreview(image).catch(() => null);
        if (previewDataUrl) return ok({...image, previewDataUrl});
      }
      return ok(image);
    };
    if (payload.imageId && payload.imageId !== 'legacy') {
      const image = await repo.findMedia(payload.imageId, user.id);
      if (!image || (projectId && image.project_id !== projectId) || (payload.assetId && image.asset_id !== payload.assetId)) return NOT_FOUND;
      return withPreview({ id: image.id, projectId: image.project_id, assetId: image.asset_id, ...assetImageLink(image.object_path || image.url, signer), filename: image.filename, mime: image.mime });
    }
    const assets = await repo.listAssets(projectId, user.id);
    const asset = assets?.find(item => item.id === payload.assetId);
    if (!asset?.image_url) return NOT_FOUND;
    return withPreview({ id: 'legacy', projectId, assetId: asset.id, ...assetImageLink(asset.image_url, signer) });
  }
  if (action === 'asset-create') { const r = guard(await repo.createAsset(projectId, payload, user.id)); return r ? ok(r) : DENY; }
  if (action === 'asset-update') {
    if (!projectId || !payload.assetId) return { status: 400, body: { error: '缺少项目或资产编号' } };
    const myRole = await roleOf(projectId, user, repo);
    if (!['producer', 'artist', 'artist_collaborator'].includes(myRole)) return DENY;
    const updates = payload.updates || payload;
    const fields = {};
    for (const key of ['name', 'description']) {
      if (key in updates) {
        if (typeof updates[key] !== 'string') return { status: 400, body: { error: '资产名称和提示词必须是文本' } };
        fields[key] = updates[key];
      }
    }
    const r = guard(await repo.updateAsset(payload.assetId, fields, user.id, projectId));
    return r ? ok(r) : NOT_FOUND;
  }
  if (action === 'assets-replace') { const r = guard(await repo.replaceAssets(projectId, payload.assets || payload.list, user.id)); return r ? ok(r) : DENY; }
  if (action === 'asset-image-record') {
    const r = guard(await repo.recordAssetImage(projectId, { ...payload, username: user.display_name || user.username }, user.id));
    if (!r) return DENY;
    const objectKey = r.object_path || payload.objectPath || payload.objectKey;
    const url = objectKey && signer ? signer.signDownload({ objectKey }).url : '';
    return ok({ ...r, objectKey, url });
  }
  if (action === 'asset-image-delete') { const r = guard(await repo.deleteAssetImage(projectId, payload, user.id)); return r ? ok({ ok: true }) : DENY; }
  if (action === 'asset-images-clear') { const r = guard(await repo.clearAssetImages(projectId, payload, user.id)); return r ? ok({ ok: true }) : DENY; }

  // ---- 任务 ----
  if (action === 'tasks-list') return ok(await repo.listTasks(projectId, user.id));
  if (action === 'task-assign' || action === 'task-update') { const r = guard(await repo.upsertTask(projectId, payload, user.id)); return r ? ok(r) : DENY; }
  if (action === 'task-delete') { const r = guard(await repo.deleteTask(projectId, payload.taskId || payload.id, user.id)); return r ? ok({ ok: true }) : DENY; }

  // ---- 消息 ----
  if (action === 'messages-list') return ok(await repo.listMessages(projectId, user.id));
  if (action === 'message-send') {const r=guard(await repo.sendMessage(projectId,{...payload,username:user.display_name||user.username},user.id));return r?ok(r):DENY;}

  return { status: 501, body: { error: '腾讯云版暂不支持该操作：' + action } };
}

module.exports = { handleAction };
