async function handleAction(action, payload, user, repo) {
  if (!user) return { status: 401, body: { error: '请先登录账号' } };
  const projectId = payload.projectId || payload.id;
  if (action === 'producer-status') return { status: 200, body: { isProducer: user.is_producer === true } };
  if (action === 'project-create') return { status: 200, body: await repo.createProject({ ...payload, ownerId: user.id, ownerName: user.display_name || user.username }) };
  if (action === 'project-list') return { status: 200, body: await repo.listProjects(user.id) };
  if (action === 'project-get') return { status: 200, body: await repo.getProject(projectId, user.id) };
  if (action === 'project-update') return { status: 200, body: await repo.updateProject(projectId, payload, user.id) };
  if (action === 'members-list') return { status: 200, body: await repo.listMembers(projectId, user.id) };
  if (action === 'member-add') return { status: 200, body: await repo.addMember(projectId, payload, user.id) };
  if (action === 'member-remove') return { status: 200, body: await repo.removeMember(projectId, payload.userId, user.id) };
  if (action === 'assets-list') return { status: 200, body: await repo.listAssets(projectId, user.id) };
  if (action === 'asset-create') return { status: 200, body: await repo.createAsset(projectId, payload, user.id) };
  if (action === 'asset-update') return { status: 200, body: await repo.updateAsset(payload.assetId || payload.id, payload, user.id) };
  if (action === 'tasks-list') return { status: 200, body: await repo.listTasks(projectId, user.id) };
  if (action === 'task-assign' || action === 'task-update') return { status: 200, body: await repo.upsertTask(projectId, payload, user.id) };
  if (action === 'messages-list') return { status: 200, body: await repo.listMessages(projectId, user.id) };
  if (action === 'message-send') return { status: 200, body: await repo.sendMessage(projectId, payload, user.id) };
  if (action === 'media-list') return { status: 200, body: await repo.listMedia(projectId, user.id) };
  return { status: 501, body: { error: '腾讯云版该功能正在接入中' } };
}
module.exports = { handleAction };
