const DENY = { status: 403, body: { error: '你没有这个项目的操作权限' } };
const NOT_FOUND = { status: 404, body: { error: '项目不存在或无权访问' } };
const LOCKED = { status: 423, body: { error: '项目已锁定，暂不可编辑' } };
const ok = (body) => ({ status: 200, body });

// 统一处理：仓储返回 null 表示无权限或不存在。
const guard = (value) => (value === null || value === undefined ? null : value);

// 与 Supabase 版一致的内部标记：不能泄露给客户端，且要从中提取导演项目关联。
const COLLAB_SENTINEL = '[COLLAB_PROJECT]';
const DIRECTOR_SENTINEL = '[DIRECTOR_PROJECT]';
const LOCK_SENTINEL = '[PROJECT_LOCKED]';
const collabSource = (genre) => (String(genre || '').match(/\[COLLAB_SOURCE:([^\]]+)\]/) || [])[1] || '';
const stripInternalGenre = (genre) => String(genre || '')
  .replace(/\n?\[(?:COLLAB_PROJECT|DIRECTOR_PROJECT|PROJECT_LOCKED|COLLAB_SOURCE:[^\]]+|RECYCLE_UNTIL:[^\]]+)\]/g, '')
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

async function handleAction(action, payload, user, repo) {
  if (!user) return { status: 401, body: { error: '请先登录账号' } };
  const projectId = payload.projectId || payload.id;
  const producer = user.is_producer === true || user.is_admin === true;

  if (action === 'producer-status') return ok({ isProducer: producer });

  // Supabase 契约：项目锁定后禁止一切写操作。
  const WRITE_ACTIONS = ['assets-replace','asset-create','asset-update','asset-image-record','asset-image-delete','asset-images-clear','task-assign','task-update','task-delete','media-record','media-delete','message-send'];
  if (WRITE_ACTIONS.includes(action) && projectId) {
    let locked = false;
    try { locked = await repo.isProjectLocked(projectId); } catch { locked = false; }
    if (locked) return LOCKED;
  }

  // ---- 协作项目 ----
  if (action === 'project-create') {
    const created = await repo.createProject({ ...payload, ownerId: user.id, ownerName: user.display_name || user.username, ownerUsername: user.username });
    return ok(await attachRole(created, user, repo));
  }
  if (action === 'project-list') {
    const rows = (await repo.listProjects(user.id)) || [];
    return ok(await Promise.all(rows.map((row) => attachRole(row, user, repo))));
  }
  if (action === 'project-get') { const r = guard(await repo.getProject(projectId, user.id)); return r ? ok(await attachRole(r, user, repo)) : NOT_FOUND; }
  if (action === 'project-update') {
    // Supabase 契约：updates + scope，按 scope 限定可写字段与所需角色。
    if (await repo.isProjectLocked(projectId)) return LOCKED;
    const myRole = await roleOf(projectId, user, repo);
    if (!myRole) return DENY;
    const scope = String(payload.scope || '');
    if (scope === 'director-sync' && myRole !== 'producer') return DENY;
    if (scope === 'storyboard' && !['producer', 'collaborator', 'artist_collaborator'].includes(myRole)) return DENY;
    const keys = scope === 'director-sync' ? ['script', 'episodes']
      : scope === 'storyboard' ? ['episodes']
      : ['name', 'style', 'genre', 'script', 'analysis_output', 'episodes'];
    const updates = payload.updates || payload;
    const allowed = {};
    for (const k of keys) if (k in updates) allowed[k] = updates[k];
    const saved = guard(await repo.updateProjectFields(projectId, allowed));
    return saved ? ok(await attachRole(saved, user, repo)) : DENY;
  }
  if (action === 'project-delete') { const r = guard(await repo.softDeleteProject(projectId, user.id)); return r ? ok({ ok: true, purgeAfter: r.purge_after }) : DENY; }
  if (action === 'project-restore') { const r = guard(await repo.restoreProject(projectId, user.id)); return r ? ok({ ok: true }) : { status: 410, body: { error: '恢复窗口已过期' } }; }
  if (action === 'project-lock') { const r = guard(await repo.setProjectLocked(projectId, payload.locked !== false, user.id)); return r ? ok({ ok: true }) : DENY; }
  if (action === 'project-link-director') { const r = guard(await repo.linkDirectorProject(projectId, payload.directorProjectId, user.id)); return r ? ok({ ok: true }) : DENY; }
  if (action === 'stats-get') {
    // Supabase 契约：返回 {members, activity, media} 三个数组，客户端 summarizeActivity 会遍历。
    if (!await repo.getProject(projectId, user.id)) return NOT_FOUND;
    const bundle = await repo.getStatsBundle(projectId);
    return ok({ members: bundle.members || [], activity: bundle.activity || [], media: bundle.media || [] });
  }

  // ---- 导演项目 ----
  if (action === 'director-project-create') {
    if (!producer) return { status: 403, body: { error: '需要制片人权限才能开启导演协作' } };
    return ok(await repo.createDirectorProject(payload, user.id, user.display_name || user.username));
  }
  if (action === 'director-project-list') return ok(await repo.listDirectorProjects(user.id));
  if (action === 'director-project-get') { const r = guard(await repo.getDirectorProject(payload.directorProjectId || projectId, user.id)); return r ? ok(r) : NOT_FOUND; }
  if (action === 'director-project-update') { const r = guard(await repo.updateDirectorProject(payload.directorProjectId || projectId, payload, user.id)); return r ? ok(r) : DENY; }
  if (action === 'director-project-delete') { const r = guard(await repo.deleteDirectorProject(payload.directorProjectId || projectId, user.id)); return r ? ok({ ok: true }) : DENY; }
  if (action === 'director-project-lock') { const r = guard(await repo.setProjectLocked(payload.directorProjectId || projectId, payload.locked !== false, user.id)); return r ? ok({ ok: true }) : DENY; }

  // ---- 成员（导演项目与协作项目共用成员表）----
  if (action === 'director-members-list' || action === 'members-list') {
    const pid = payload.directorProjectId || projectId;
    const r = guard(await repo.listDirectorMembers(pid, user.id));
    return r ? ok(r) : NOT_FOUND;
  }
  if (action === 'director-member-add' || action === 'member-add') {
    const pid = payload.directorProjectId || projectId;
    const r = guard(await repo.addDirectorMember(pid, payload, user.id));
    if (!r) return DENY;
    if (r.error === 'user_not_found') return { status: 404, body: { error: '账号不存在，请确认对方已注册' } };
    return ok(r);
  }
  if (action === 'director-member-remove' || action === 'member-remove') {
    const pid = payload.directorProjectId || projectId;
    const r = guard(await repo.removeDirectorMember(pid, payload.userId, user.id));
    return r ? ok({ ok: true }) : DENY;
  }
  if (action === 'member-role') { const r = guard(await repo.updateMemberRole(projectId, payload, user.id)); return r ? ok(r) : DENY; }

  // ---- 资产 ----
  if (action === 'assets-list') {
    const rows = (await repo.listAssets(projectId, user.id)) || [];
    let images = [];
    try { images = (await repo.listAssetImages(projectId, user.id)) || []; } catch { images = []; }
    // 资产附带图片列表：signer 在 media 层负责签名，这里只给出对象路径。
    return ok(rows.map((row) => ({
      ...row,
      images: images.filter((img) => img.asset_id === row.id).map((img) => ({ id: img.id, objectKey: img.object_path, filename: img.filename, mime: img.mime })),
    })));
  }
  if (action === 'asset-create') { const r = guard(await repo.createAsset(projectId, payload, user.id)); return r ? ok(r) : DENY; }
  if (action === 'asset-update') { const r = guard(await repo.updateAsset(payload.assetId || payload.id, payload, user.id)); return r ? ok(r) : DENY; }
  if (action === 'assets-replace') { const r = guard(await repo.replaceAssets(projectId, payload.assets || payload.list, user.id)); return r ? ok(r) : DENY; }
  if (action === 'asset-image-record') { const r = guard(await repo.recordAssetImage(projectId, { ...payload, username: user.display_name || user.username }, user.id)); return r ? ok(r) : DENY; }
  if (action === 'asset-image-delete') { const r = guard(await repo.deleteAssetImage(projectId, payload, user.id)); return r ? ok({ ok: true }) : DENY; }
  if (action === 'asset-images-clear') { const r = guard(await repo.clearAssetImages(projectId, payload, user.id)); return r ? ok({ ok: true }) : DENY; }

  // ---- 任务 ----
  if (action === 'tasks-list') return ok(await repo.listTasks(projectId, user.id));
  if (action === 'task-assign' || action === 'task-update') { const r = guard(await repo.upsertTask(projectId, payload, user.id)); return r ? ok(r) : DENY; }
  if (action === 'task-delete') { const r = guard(await repo.deleteTask(projectId, payload.taskId || payload.id, user.id)); return r ? ok({ ok: true }) : DENY; }

  // ---- 消息 ----
  if (action === 'messages-list') return ok(await repo.listMessages(projectId, user.id));
  if (action === 'message-send') return ok(await repo.sendMessage(projectId, { ...payload, username: user.display_name || user.username }, user.id));

  return { status: 501, body: { error: '腾讯云版暂不支持该操作：' + action } };
}

module.exports = { handleAction };
