const { generateInviteCode, digestInvite, INVITE_KINDS } = require('./invites.cjs');

const publicInvite = (row) => ({
  id: row.id, code: row.code, kind: row.kind, role: row.role,
  maxUses: row.max_uses, usedCount: row.used_count,
  disabled: row.disabled === true, note: row.note || '', createdAt: row.created_at,
});
const publicUser = (row) => ({
  id: row.id, username: row.username, displayName: row.display_name || row.username,
  email: row.email || '', roles: row.roles || [], activeRole: row.active_role,
  isAdmin: row.is_admin === true, isProducer: row.is_producer === true,
  banned: row.banned === true, createdAt: row.created_at,
});

async function handleAdminAction(action, payload, user, repo) {
  if (user?.is_admin !== true) return { status: 403, body: { error: '需要管理员权限' } };
  if (action === 'admin-list-users') return { status: 200, body: (await repo.listUsers()).map(publicUser) };
  if (action === 'admin-list-invites') return { status: 200, body: (await repo.listInvites()).map(publicInvite) };
  if (action === 'admin-create-invite') {
    const kind = INVITE_KINDS.includes(payload?.kind) ? payload.kind : 'role';
    const role = ['creator', 'director'].includes(payload?.role) ? payload.role : null;
    if (kind === 'role' && !role) return { status: 400, body: { error: '身份邀请码必须指定身份' } };
    const code = generateInviteCode();
    const created = await repo.createInvite({ code, digest: digestInvite(code), kind, role, maxUses: kind === 'unlock' ? null : Number(payload?.maxUses || 1), note: String(payload?.note || '') });
    return { status: 200, body: publicInvite(created) };
  }
  if (action === 'admin-disable-invite') {
    const updated = await repo.disableInvite(payload?.inviteId, payload?.disabled !== false);
    return updated ? { status: 200, body: { ok: true } } : { status: 404, body: { error: '邀请码不存在' } };
  }
  if (action === 'admin-set-banned') {
    if (payload?.userId === user.id) return { status: 400, body: { error: '不能停用自己的管理员账号' } };
    const updated = await repo.setBanned(payload?.userId, payload?.banned === true);
    return updated ? { status: 200, body: { ok: true } } : { status: 404, body: { error: '账号不存在' } };
  }
  if (action === 'admin-set-producer') {
    const updated = await repo.setProducer(payload && payload.userId, payload && payload.isProducer === true);
    return updated ? { status: 200, body: { ok: true, isProducer: updated.is_producer } } : { status: 404, body: { error: '账号不存在' } };
  }
  if (action === 'admin-delete-user') {
    if (payload?.userId === user.id) return { status: 400, body: { error: '不能删除自己的管理员账号' } };
    await repo.deleteUser(payload?.userId);
    return { status: 200, body: { ok: true } };
  }
  return { status: 501, body: { error: '腾讯云版该管理功能正在接入中' } };
}

module.exports = { handleAdminAction, publicInvite, publicUser };
