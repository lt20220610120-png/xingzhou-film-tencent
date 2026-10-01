import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Copy, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2, UserRound, Undo2, Clapperboard, PanelsTopLeft } from 'lucide-react';
import { DeleteConfirm } from './DeleteConfirm.jsx';
import { WorkBuddyPanel } from './WorkBuddyPanel.jsx';

const KIND_LABELS = { role: '单身份邀请码', full: '全权限邀请码', unlock: '身份解锁码', admin: '管理员注册码' };
const ROLE_LABELS = { creator: '内容创作者', director: '导演' };
const readableError = (reason, fallback) => String(reason?.message || fallback)
  .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '').replace(/^Error:\s*/i, '');

function fmtTime(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('zh-CN', { hour12: false }); } catch { return value; }
}

const adminTabKey = (accountId) => `xz-admin-tab:${encodeURIComponent(String(accountId || ''))}`;
const readAdminTab = (accountId) => {
  try { return localStorage.getItem(adminTabKey(accountId)) === 'workbuddy' ? 'workbuddy' : 'users'; }
  catch { return 'users'; }
};

export function AdminPanel({ account, active = true }) {
  const api = window.xingzhou;
  const [tab, setTab] = useState(() => readAdminTab(account?.id));
  const [workBuddyVisited, setWorkBuddyVisited] = useState(() => readAdminTab(account?.id) === 'workbuddy');
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [kind, setKind] = useState('role');
  const [role, setRole] = useState('creator');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirmUser, setConfirmUser] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(adminTabKey(account?.id), tab); } catch {}
    if (tab === 'workbuddy') setWorkBuddyVisited(true);
  }, [account?.id, tab]);

  const refresh = async () => {
    setLoading(true); setError('');
    try {
      const [userRows, inviteRows] = await Promise.all([api.adminListUsers(), api.adminListInvites()]);
      setUsers(userRows || []);
      setInvites(inviteRows || []);
    } catch (reason) {
      setError(readableError(reason, '加载失败，请检查网络'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const flash = (text) => { setNotice(text); setTimeout(() => setNotice(''), 2600); };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); flash(`已复制：${text}`); } catch { flash('复制失败，请手动选择复制'); } };

  const createInvite = async () => {
    setCreating(true); setError('');
    try {
      const invite = await api.adminCreateInvite({ kind, role: kind === 'role' ? role : undefined, note });
      setNote('');
      await refresh();
      await copy(invite.code);
    } catch (reason) {
      setError(readableError(reason, '生成失败'));
    } finally {
      setCreating(false);
    }
  };

  const toggleBan = async (user) => {
    setError('');
    try { await api.adminSetBanned({ userId: user.id, banned: !user.banned }); await refresh(); flash(user.banned ? `已恢复 ${user.username} 的使用权限` : `已停用 ${user.username}`); }
    catch (reason) { setError(readableError(reason, '操作失败')); }
  };

  const toggleProducer = async (user) => {
    setError('');
    try { await api.collabAdminSetProducer({ userId: user.id, isProducer: !user.isProducer }); await refresh(); flash(user.isProducer ? `已取消 ${user.username} 的制片身份` : `已授予 ${user.username} 制片身份，对方可在「项目协作」中开启项目`); }
    catch (reason) { setError(readableError(reason, '操作失败')); }
  };

  const deleteUser = async () => {
    const user = confirmUser;
    setConfirmUser(null); setError('');
    try { await api.adminDeleteUser({ userId: user.id }); await refresh(); flash(`已删除用户 ${user.username}`); }
    catch (reason) { setError(readableError(reason, '删除失败')); }
  };

  const toggleInvite = async (invite) => {
    setError('');
    try { await api.adminDisableInvite({ inviteId: invite.id, disabled: !invite.disabled }); await refresh(); }
    catch (reason) { setError(readableError(reason, '操作失败')); }
  };

  const activeInvites = useMemo(() => invites.filter((invite) => invite.kind !== 'admin'), [invites]);

  return (
    <div className="admin-panel">
      <header className="admin-head">
        <div>
          <span className="auth-kicker"><ShieldCheck size={15} /> 管理后台 · 仅管理员可见</span>
          <h1>管理后台</h1>
          <p>管理行舟账号、邀请码与本机 WorkBuddy 号池。</p>
        </div>
        {tab === 'users' && <button className="admin-refresh" onClick={refresh} disabled={loading}><RefreshCw size={16} /> {loading ? '刷新中…' : '刷新'}</button>}
      </header>
      <div className="admin-workspace-tabs" role="tablist" aria-label="管理功能">
        <button role="tab" id="admin-users-tab" aria-selected={tab === 'users'} aria-controls="admin-users-panel" className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><UserRound size={17} /> 用户与邀请码</button>
        <button role="tab" id="admin-workbuddy-tab" aria-selected={tab === 'workbuddy'} aria-controls="admin-workbuddy-panel" className={tab === 'workbuddy' ? 'active' : ''} onClick={() => setTab('workbuddy')}><PanelsTopLeft size={17} /> WorkBuddy 号池</button>
      </div>
      {(workBuddyVisited || tab === 'workbuddy') && <div id="admin-workbuddy-panel" role="tabpanel" aria-labelledby="admin-workbuddy-tab" hidden={tab !== 'workbuddy'}><WorkBuddyPanel account={account} active={active && tab === 'workbuddy'} /></div>}
      <div id="admin-users-panel" role="tabpanel" aria-labelledby="admin-users-tab" hidden={tab !== 'users'}>
      <p className="admin-data-note">用户与邀请码保存在云端。删除或停用账号后，对方将失去软件使用权限。</p>
      {error && <div className="auth-error admin-load-error" role="alert"><span>{error}</span><button onClick={refresh} disabled={loading}>重试</button></div>}
      {notice && <div className="auth-notice">{notice}</div>}

      <section className="admin-section">
        <h2><KeyRound size={18} /> 生成邀请码</h2>
        <div className="invite-maker">
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="role">单身份邀请码（只开通所选身份）</option>
            <option value="full">全权限邀请码（两个工作台互通）</option>
            <option value="unlock">身份解锁码（给已注册用户解锁另一身份）</option>
          </select>
          {kind === 'role' && (
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="creator">内容创作者</option>
              <option value="director">导演</option>
            </select>
          )}
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注（发给谁，可留空）" />
          <button onClick={createInvite} disabled={creating}><Plus size={16} /> {creating ? '生成中…' : '生成并复制'}</button>
        </div>
        <div className="admin-table invites">
          <div className="admin-row head"><span>邀请码</span><span>类型</span><span>已用</span><span>备注</span><span>创建时间</span><span>操作</span></div>
          {activeInvites.map((invite) => (
            <div className={`admin-row${invite.disabled ? ' disabled' : ''}`} key={invite.id}>
              <span className="mono">{invite.code}</span>
              <span>{KIND_LABELS[invite.kind]}{invite.kind === 'role' ? ` · ${ROLE_LABELS[invite.role] || ''}` : ''}</span>
              <span>{invite.used_count || 0}{invite.max_uses ? ` / ${invite.max_uses}` : ''}</span>
              <span>{invite.note || '—'}</span>
              <span>{fmtTime(invite.created_at)}</span>
              <span className="row-actions">
                <button title="复制" onClick={() => copy(invite.code)}><Copy size={15} /></button>
                <button title={invite.disabled ? '恢复启用' : '停用'} onClick={() => toggleInvite(invite)}>{invite.disabled ? <Undo2 size={15} /> : <Ban size={15} />}</button>
              </span>
            </div>
          ))}
          {!activeInvites.length && !loading && <div className="admin-empty">还没有邀请码，点上方“生成并复制”创建第一个。</div>}
        </div>
      </section>

      <section className="admin-section">
        <h2><UserRound size={18} /> 注册用户（{users.length}）</h2>
        <div className="admin-table users">
          <div className="admin-row head"><span>账号</span><span>称呼</span><span>邮箱</span><span>身份</span><span>状态</span><span>注册时间</span><span>操作</span></div>
          {users.map((user) => (
            <div className={`admin-row${user.banned ? ' disabled' : ''}`} key={user.id}>
              <span className="mono">{user.username}{user.isAdmin ? ' ⭐' : ''}</span>
              <span>{user.displayName || '—'}</span>
              <span className="mono">{user.email}</span>
              <span>{user.isAdmin ? '管理员' : (user.roles || []).map((r) => ROLE_LABELS[r]).join(' + ') || '—'}{user.isProducer ? ' · 制片' : ''}</span>
              <span>{user.banned ? '已停用' : '正常'}</span>
              <span>{fmtTime(user.createdAt)}</span>
              <span className="row-actions">
                {!user.isAdmin && <button title={user.isProducer ? '取消制片身份' : '设为制片（可开启协作项目）'} className={user.isProducer ? 'producer-on' : ''} onClick={() => toggleProducer(user)}><Clapperboard size={15} /></button>}
                {!user.isAdmin && <button title={user.banned ? '恢复使用权限' : '停用（保留数据）'} onClick={() => toggleBan(user)}>{user.banned ? <Undo2 size={15} /> : <Ban size={15} />}</button>}
                {!user.isAdmin && <button title="彻底删除" className="danger" onClick={() => setConfirmUser(user)}><Trash2 size={15} /></button>}
              </span>
            </div>
          ))}
          {!users.length && !loading && <div className="admin-empty">暂时还没有注册用户。</div>}
        </div>
      </section>

      {confirmUser && (
        <DeleteConfirm
          open
          title="删除用户"
          name={confirmUser.username}
          detail={`删除后 ${confirmUser.displayName || confirmUser.username} 将立即失去软件使用权限，且无法恢复。也可以选择“停用”来保留账号数据。`}
          onCancel={() => setConfirmUser(null)}
          onConfirm={deleteUser}
        />
      )}
      </div>
    </div>
  );
}
