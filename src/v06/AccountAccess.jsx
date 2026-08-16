import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Film, LockKeyhole, MailCheck, ShieldCheck, UserRound, X } from 'lucide-react';
import { BrandLogo } from './GlobalTools.jsx';

const roleMeta = {
  creator: { label: '内容创作者', destination: '创作者工作台', icon: UserRound },
  director: { label: '导演', destination: '导演工作台', icon: Film },
};

function humanizeError(reason, fallback) {
  const message = String(reason?.message || fallback);
  return message.replace(/^Error invoking remote method '[^']+': Error:\s*/, '');
}

function useCountdown() {
  const [seconds, setSeconds] = useState(0);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);
  const start = (from = 60) => {
    clearInterval(timer.current);
    setSeconds(from);
    timer.current = setInterval(() => setSeconds((current) => {
      if (current <= 1) { clearInterval(timer.current); return 0; }
      return current - 1;
    }), 1000);
  };
  return [seconds, start];
}

export function SendCodeButton({ email, onError }) {
  const [seconds, start] = useCountdown();
  const [sending, setSending] = useState(false);
  const send = async () => {
    onError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim())) return onError('请先填写有效的邮箱地址');
    setSending(true);
    try {
      await window.xingzhou.authSendEmailCode({ email });
      start(60);
    } catch (reason) {
      onError(humanizeError(reason, '验证码发送失败，请稍后重试'));
    } finally {
      setSending(false);
    }
  };
  return (
    <button type="button" className="send-code-btn" disabled={sending || seconds > 0} onClick={send}>
      {sending ? '发送中…' : seconds > 0 ? `${seconds}s 后重发` : '发送验证码'}
    </button>
  );
}

export function RegistrationScreen({ requestedRole, onClose, onRegistered, onLogin }) {
  const [mode, setMode] = useState('register');
  const [form, setForm] = useState({ username: '', displayName: '', password: '', confirmPassword: '', email: '', emailCode: '', inviteCode: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const meta = roleMeta[requestedRole];
  const Icon = meta.icon;
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const switchMode = (next) => { setMode(next); setError(''); setNotice(''); };
  const submit = async (event) => {
    event.preventDefault();
    setError(''); setNotice('');
    setSubmitting(true);
    try {
      if (mode === 'register') {
        if (form.password !== form.confirmPassword) throw new Error('两次输入的密码不一致');
        const account = await window.xingzhou.authRegister({ ...form, requestedRole });
        onRegistered(account);
      } else if (mode === 'login') {
        const account = await window.xingzhou.authLogin({ username: form.username, password: form.password });
        onLogin(account);
      } else {
        const found = await window.xingzhou.authRecover({ username: form.username, email: form.email, emailCode: form.emailCode, newPassword: form.password || undefined });
        setNotice(`该邮箱绑定的账号是：${found.username}${form.password ? '，新密码已生效，请切换到登录页登录。' : '，可直接用原密码登录。'}`);
      }
    } catch (reason) {
      setError(humanizeError(reason, '操作失败，请检查后重试'));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="auth-screen">
      <header className="auth-topbar">
        <BrandLogo />
        <button aria-label="关闭" onClick={onClose}><X /></button>
      </header>
      <div className="auth-layout">
        <section className="auth-intro">
          <button className="auth-back" onClick={onClose}><ArrowLeft /> 返回身份选择</button>
          <span className="auth-kicker">账号 · 仅限团队成员</span>
          <h1>{mode === 'register' ? '注册账号' : mode === 'login' ? '登录账号' : '找回账号'}</h1>
          <p>{mode === 'register' ? `注册成功后可直接进入${meta.destination}。为了避免重复注册，创建账号需要完成邮箱验证码。` : mode === 'login' ? '登录后将按照账号已有权限进入对应工作台。' : '通过注册时绑定的邮箱找回账号，也可以同时设置一个新密码。'}</p>
          {mode === 'register' && <div className="selected-role"><Icon /><span><small>本次选择</small><strong>{meta.label}</strong></span><b>{meta.destination}</b></div>}
          <div className="auth-security"><ShieldCheck /><span><strong>邀请码控制访问权限</strong><small>普通邀请码只开通一个身份；身份解锁码可在之后增加另一个工作台。</small></span></div>
          <div className="auth-security"><MailCheck /><span><strong>一个邮箱绑定一个账号</strong><small>邮箱用于接收验证码，也用于日后找回自己的账号。</small></span></div>
        </section>
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-tabs">
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>创建账号</button>
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>已有账号登录</button>
            <button type="button" className={mode === 'recover' ? 'active' : ''} onClick={() => switchMode('recover')}>找回账号</button>
          </div>
          <label>账号<input autoFocus value={form.username} onChange={update('username')} placeholder={mode === 'recover' ? '请输入要找回的账号' : '例如 staff001'} autoComplete="username" /></label>
          {mode === 'register' && <label>姓名或称呼<input value={form.displayName} onChange={update('displayName')} placeholder="例如 张导演" /></label>}
          {mode !== 'recover' && <label>密码<input type="password" value={form.password} onChange={update('password')} placeholder="至少 6 位" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>}
          {mode === 'register' && <label>确认密码<input type="password" value={form.confirmPassword} onChange={update('confirmPassword')} placeholder="再次输入密码" autoComplete="new-password" /></label>}
          {mode !== 'login' && <>
            <label>邮箱<input type="email" value={form.email} onChange={update('email')} placeholder={mode === 'register' ? '用于接收注册验证码' : '注册时绑定的邮箱'} autoComplete="email" /></label>
            <label>邮箱验证码<span className="code-row"><input value={form.emailCode} onChange={update('emailCode')} placeholder="邮箱收到的验证码" inputMode="numeric" maxLength={8} autoComplete="one-time-code" /><SendCodeButton email={form.email} onError={setError} /></span></label>
          </>}
          {mode === 'recover' && <label>新密码（可选）<input type="password" value={form.password} onChange={update('password')} placeholder="留空则只找回账号名" autoComplete="new-password" /></label>}
          {mode === 'register' && <>
            <label>邀请码<input value={form.inviteCode} onChange={update('inviteCode')} placeholder={`请输入${meta.label}邀请码`} autoComplete="off" /></label>
            <p className="invite-note"><LockKeyhole /> 邀请码由管理员发放，并决定账号能够使用的工作台。</p>
          </>}
          {error && <div className="auth-error">{error}</div>}
          {notice && <div className="auth-notice">{notice}</div>}
          <button className="auth-submit" disabled={submitting}>{submitting ? '正在处理…' : mode === 'register' ? '创建账号' : mode === 'login' ? '登录账号' : '找回账号'}</button>
        </form>
      </div>
    </main>
  );
}

export function LockedRoleDialog({ targetRole, onClose, onUnlocked }) {
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const meta = roleMeta[targetRole];
  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true); setError('');
    try { onUnlocked(await window.xingzhou.authUnlockRole({ inviteCode })); }
    catch (reason) { setError(humanizeError(reason, '解锁失败')); }
    finally { setSubmitting(false); }
  };
  return <div className="role-lock-veil"><form className="role-lock-dialog" onSubmit={submit}>
    <button type="button" className="role-lock-close" onClick={onClose}><X /></button>
    <div className="role-lock-icon"><LockKeyhole /></div>
    <span className="auth-kicker">需要额外权限</span>
    <h2>{meta.label}工作台已锁定</h2>
    <p>你的账号尚未开通这个身份。输入管理员发放的“身份解锁邀请码”，即可同时使用两个工作台。</p>
    <label>身份解锁邀请码<input autoFocus value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="请输入二层解锁邀请码" /></label>
    {error && <div className="auth-error">{error}</div>}
    <div className="role-lock-actions"><button type="button" className="secondary" onClick={onClose}>暂不解锁</button><button className="auth-submit" disabled={submitting}>{submitting ? '验证中…' : '验证并解锁'}</button></div>
  </form></div>;
}
