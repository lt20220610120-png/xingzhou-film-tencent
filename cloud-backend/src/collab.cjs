const DENY = { status: 403, body: { error: '你没有这个项目的操作权限' } };
const NOT_FOUND = { status: 404, body: { error: '项目不存在或无权访问' } };
const ok = (body) => ({ status: 200, body });

// 统一处理：仓储返回 null 表示无权限或不存在。
const guard = (value) => (value === null || value === undefined ? null : value);

async function handleAction(action, payload, user, repo) {
  if (!user) return { status: 401, body: { error: '请先登录账号' } };
  const projectId = payload.projectId || payload.id;
  const producer = user.is_producer === true || user.is_admin === true;

  if (action === 'producer-status') return ok({ isProducer: producer });

  // ---- 协作项目 ----
  if (action === 'project-create') return ok(await repo.createProject({ ...payload, ownerId: user.id, ownerName: user.display_name || user.username }));
  if (action === 'project-list') return ok(await repo.listProjects(user.id));
  if (action === 'project-get') { const r = guard(await repo.getProject(projectId, user.id)); return r ? ok(r) : NOT_FOUND; }
  if (action === 'project-update') { const r = guard(await repo.updateProject(projectId, payload, user.id)); return r ? ok(r) : DENY; }
  if (action === 'project-delete') { const r = guard(await repo.softDeleteProject(projectId, user.id)); return r ? ok({ ok: true, purgeAfter: r.purge_after }) : DENY; }
  if (action === 'project-restore') { const r = guard(await repo.restoreProject(projectId, user.id)); return r ? ok({ ok: true }) : { status: 410, body: { error: '恢复窗口已过期' } }; }
  if (action === 'project-lock') { const r = guard(await repo.setProjectLocked(projectId, payload.locked !== false, user.id)); return r ? ok({ ok: true }) : DENY; }
  if (action === 'project-link-director') { const r = guard(await repo.linkDirectorProject(projectId, payload.directorProjectId, user.id)); return r ? ok({ ok: true }) : DENY; }
  if (action === 'stats-get') { const r = guard(await repo.getStats(projectId, user.id)); return r ? ok(r) : NOT_FOUND; }

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
  if (action === 'assets-list') return ok(await repo.listAssets(projectId, user.id));
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
