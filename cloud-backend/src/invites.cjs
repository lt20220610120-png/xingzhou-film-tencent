const crypto = require('node:crypto');

const normalizeInviteCode = (value) => String(value || '').trim().toUpperCase();
const digestInvite = (value) => crypto.createHash('sha256').update(normalizeInviteCode(value)).digest('hex');
const generateInviteCode = () => 'XZ-' + crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();

const INVITE_KINDS = ['role', 'full', 'unlock', 'admin'];

function inviteUsable(invite) {
  if (!invite || invite.disabled === true) return false;
  if (invite.max_uses === null || invite.max_uses === undefined) return true;
  return Number(invite.used_count || 0) < Number(invite.max_uses);
}

// 注册可用的邀请码类型；unlock 只能用于为已有账号增加身份。
function rolesForInvite(invite, requestedRole) {
  if (invite.kind === 'unlock') return { error: '身份解锁码不能用于注册新账号' };
  if (invite.kind === 'admin' || invite.kind === 'full') {
    return { roles: ['creator', 'director'], isAdmin: invite.kind === 'admin', isProducer: invite.kind === 'admin' };
  }
  if (invite.kind === 'role') {
    if (invite.role && invite.role !== requestedRole) return { error: '该邀请码不能开通所选的工作身份' };
    return { roles: [requestedRole], isAdmin: false, isProducer: false };
  }
  return { error: '邀请码类型无效' };
}

module.exports = { normalizeInviteCode, digestInvite, generateInviteCode, inviteUsable, rolesForInvite, INVITE_KINDS };
