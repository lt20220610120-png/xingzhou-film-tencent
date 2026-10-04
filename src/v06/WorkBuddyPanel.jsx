import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ArrowUpCircle, CheckCircle2, FolderOpen, LoaderCircle, PanelsTopLeft, RefreshCw, ShieldCheck, X } from 'lucide-react';

const readableError = (reason) => String(reason?.message || reason || '连接失败，请重试')
  .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '').replace(/^Error:\s*/i, '');
const accountCount = (accounts) => typeof accounts === 'number' ? accounts : Array.isArray(accounts) ? accounts.length
  : typeof accounts?.total === 'number' ? accounts.total : typeof accounts?.count === 'number' ? accounts.count : null;

export function WorkBuddyPanel({ account, active: panelActive = true }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('load');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [release, setRelease] = useState(null);
  const [progress, setProgress] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const hostRef = useRef(null);
  const dialogRef = useRef(null);
  const lifetime = useRef(0);
  const mounted = useRef(false);
  const initialized = useRef(false);
  const pendingOpen = useRef(false);
  const statusRef = useRef(null);
  const viewWanted = useRef(false);
  const viewPresent = useRef(false);
  const activeRef = useRef(panelActive);
  const presentationReady = useRef(false);
  const presentationEpoch = useRef(0);
  activeRef.current = panelActive;
  const viewEpoch = useRef(0);
  const lastBounds = useRef('');
  const modalBlocked = useRef(false);
  const updatePending = useRef(false);
  const updatingRef = useRef(false);
  const actions = useRef({});

  const active = useCallback((generation) => mounted.current && generation === lifetime.current, []);
  const invoke = useCallback((name, ...args) => {
    const method = window.xingzhou?.[name];
    if (typeof method !== 'function') return Promise.reject(new Error('请更新行舟影视后使用 WorkBuddy 号池'));
    return Promise.resolve().then(() => method(...args));
  }, []);
  const applyStatus = useCallback((next) => {
    statusRef.current = next;
    setStatus(next);
    if (next?.error) throw new Error(next.error);
    return next;
  }, []);
  const bounds = useCallback(() => {
    if (!activeRef.current) return { x: 0, y: 0, width: 0, height: 0 };
    const host = hostRef.current;
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    const x = Math.max(0, Math.round(rect.left + host.clientLeft));
    const y = Math.max(0, Math.round(rect.top + host.clientTop));
    return { x, y, width: Math.max(0, Math.floor(Math.min(window.innerWidth, rect.right - host.clientLeft)) - x),
      height: Math.max(0, Math.floor(Math.min(window.innerHeight, rect.bottom - host.clientTop)) - y) };
  }, []);
  const closeView = useCallback(async () => {
    pendingOpen.current = false;
    viewWanted.current = false;
    viewPresent.current = false;
    viewEpoch.current += 1;
    presentationReady.current = false;
    lastBounds.current = '';
    if (mounted.current) setVisible(false);
    await invoke('workBuddyClose');
  }, [invoke]);
  const showError = useCallback(async (reason, generation) => {
    if (!active(generation)) return;
    setError(readableError(reason));
    await closeView().catch(() => {});
  }, [active, closeView]);
  const markDisconnected = useCallback((reason, generation) => {
    if (!active(generation)) return;
    viewPresent.current = false;
    viewWanted.current = false;
    viewEpoch.current += 1;
    presentationReady.current = false;
    lastBounds.current = '';
    setVisible(false);
    setNotice('');
    setError(readableError(reason || '控制面板连接已断开，请重新连接'));
  }, [active]);
  const syncBounds = useCallback(() => {
    if (!mounted.current || !viewPresent.current) return;
    const next = !activeRef.current || !presentationReady.current || modalBlocked.current ? { x: 0, y: 0, width: 0, height: 0 } : bounds();
    if (!next) return;
    const key = JSON.stringify(next);
    if (key === lastBounds.current) return;
    lastBounds.current = key;
    const generation = lifetime.current;
    const epoch = viewEpoch.current;
    invoke('workBuddySetBounds', next).then(result => {
      if (result === false && active(generation) && epoch === viewEpoch.current && viewPresent.current) {
        markDisconnected('控制面板连接已断开，请重新连接', generation);
      }
    }).catch(reason => {
      if (active(generation) && epoch === viewEpoch.current) return showError(reason, generation);
    });
  }, [active, bounds, invoke, markDisconnected, showError]);
  const openView = useCallback(async (generation = lifetime.current) => {
    if (!active(generation) || updatingRef.current || !statusRef.current?.installed) return;
    if (!activeRef.current) { pendingOpen.current = true; return; }
    pendingOpen.current = false;
    const nextBounds = bounds();
    if (!nextBounds) return;
    viewWanted.current = true;
    const epoch = ++viewEpoch.current;
    const next = await invoke('workBuddyOpen', { bounds: modalBlocked.current ? { x: 0, y: 0, width: 0, height: 0 } : nextBounds });
    if (!active(generation) || epoch !== viewEpoch.current || !viewWanted.current) return;
    applyStatus(next);
    viewPresent.current = true;
    presentationReady.current = activeRef.current;
    lastBounds.current = '';
    setVisible(true);
    syncBounds();
  }, [active, applyStatus, bounds, invoke, syncBounds]);

  const refresh = async () => {
    const generation = lifetime.current;
    setBusy('load'); setError(''); setNotice('');
    try {
      await closeView();
      if (!active(generation)) return;
      if (!activeRef.current) { initialized.current = false; return; }
      const [next, currentProgress] = await Promise.all([invoke('workBuddyStatus'), invoke('workBuddyUpdateState')]);
      if (!active(generation)) return;
      applyStatus(next);
      setProgress(currentProgress);
      if (currentProgress?.busy) {
        updatingRef.current = true;
        setUpdating(true); setBusy('update');
      } else {
        await openView(generation);
      }
    } catch (reason) { await showError(reason, generation); }
    finally { if (active(generation) && !updatingRef.current) setBusy(''); }
  };
  const selectRoot = async () => {
    const generation = lifetime.current;
    setBusy('select'); setError(''); setNotice('');
    try {
      await closeView();
      const next = await invoke('workBuddySelectRoot');
      if (!active(generation)) return;
      if (next) { applyStatus(next); setRelease(null); }
      await openView(generation);
    } catch (reason) { await showError(reason, generation); }
    finally { if (active(generation)) setBusy(''); }
  };
  const checkUpdate = async () => {
    const generation = lifetime.current;
    setBusy('check'); setError(''); setNotice('');
    try {
      const next = await invoke('workBuddyCheckUpdate');
      if (!active(generation)) return;
      setRelease(next);
      setNotice(next.available ? `发现控制面板新版本 ${next.latestVersion}，可更新面板与预构建网页。` : '控制面板已是官方最新版本。');
    } catch (reason) { await showError(reason, generation); }
    finally { if (active(generation)) setBusy(''); }
  };
  const requestUpdate = async () => {
    const generation = lifetime.current;
    setBusy('confirm'); setError('');
    try {
      await closeView();
      if (active(generation)) setConfirmUpdate(true);
    } catch (reason) { await showError(reason, generation); }
    finally { if (active(generation)) setBusy(''); }
  };
  const cancelUpdate = () => {
    setConfirmUpdate(false);
    setTimeout(() => openView().catch(reason => showError(reason, lifetime.current)), 0);
  };
  const runUpdate = async () => {
    const generation = lifetime.current;
    let succeeded = false;
    setConfirmUpdate(false); setBusy('update'); setError(''); setNotice('');
    updatingRef.current = true; updatePending.current = true;
    setUpdating(true);
    setProgress({ busy: true, stage: 'prepare', message: '正在准备更新并备份当前控制面板…' });
    try {
      await closeView();
      const next = await invoke('workBuddyUpdate');
      if (!active(generation)) return;
      applyStatus(next); setRelease(null);
      succeeded = true;
      setNotice(`控制面板已更新${next.version ? `至 ${next.version}` : ''}，账号数据已保留。`);
    } catch (reason) { await showError(reason, generation); }
    finally {
      if (active(generation)) {
        updatePending.current = false; updatingRef.current = false;
        setUpdating(false); setBusy('');
      }
    }
    if (succeeded && active(generation)) {
      await openView(generation).catch(reason => showError(reason, generation));
    }
  };
  actions.current = { refresh, syncBounds, resumeView: async () => {
    if (!viewPresent.current) {
      if (pendingOpen.current) await openView().catch(reason => showError(reason, lifetime.current));
      return;
    }
    const generation = lifetime.current, epoch = ++presentationEpoch.current;
    presentationReady.current = false;
    syncBounds();
    try {
      const restored = await invoke('workBuddyResume', { bounds: modalBlocked.current ? { x: 0, y: 0, width: 0, height: 0 } : bounds() });
      if (!active(generation) || epoch !== presentationEpoch.current || !activeRef.current) return;
      if (!restored) { markDisconnected('控制面板连接已断开，请重新连接', generation); return; }
      presentationReady.current = true; lastBounds.current = ''; syncBounds();
    } catch (reason) { await showError(reason, generation); }
  } };

  useEffect(() => {
    mounted.current = true;
    lifetime.current += 1;
    initialized.current = false;
    pendingOpen.current = false;
    if (account?.isAdmin !== true || account?.banned === true) {
      updatingRef.current = false; updatePending.current = false;
      setUpdating(false); setConfirmUpdate(false);
      setError('需要有效的行舟管理员权限'); setBusy('');
    } else setBusy('');
    return () => {
      mounted.current = false;
      lifetime.current += 1;
      viewWanted.current = false;
      viewPresent.current = false;
      pendingOpen.current = false;
      viewEpoch.current += 1;
      invoke('workBuddyClose').catch(() => {});
    };
  }, [account?.id, account?.isAdmin, account?.banned, invoke]);

  useEffect(() => {
    presentationEpoch.current += 1;
    if (panelActive && account?.isAdmin === true && account?.banned !== true) {
      // A remembered admin tab is also mounted in hidden workspaces after a
      // role switch. Only entering the visible WorkBuddy tab may start it.
      if (!initialized.current) { initialized.current = true; actions.current.refresh(); }
      else actions.current.resumeView();
    } else {
      presentationReady.current = false;
      lastBounds.current = '';
      actions.current.syncBounds();
      // Hide even when an explicitly requested open is still starting.
      if (viewWanted.current || viewPresent.current) invoke('workBuddySetBounds', { x: 0, y: 0, width: 0, height: 0 }).catch(() => {});
    }
  }, [panelActive, account?.id, account?.isAdmin, account?.banned, invoke]);

  useEffect(() => {
    const generation = lifetime.current;
    const unsubscribe = window.xingzhou?.onWorkBuddyState?.(next => {
      if (next?.closed === true) markDisconnected(next.error, generation);
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [account?.id, account?.isAdmin, account?.banned, markDisconnected]);

  useEffect(() => {
    let frame;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => actions.current.syncBounds()); };
    const observer = new ResizeObserver(schedule);
    if (hostRef.current) observer.observe(hostRef.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    // Native content sits above DOM dialogs. Hide it while a visible app modal exists.
    const checkModal = () => {
      const blocked = Array.from(document.querySelectorAll('[aria-modal="true"], .veil, .drawer-veil, .role-lock-veil, .global-ai'))
        .some(node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden');
      if (blocked !== modalBlocked.current) { modalBlocked.current = blocked; schedule(); }
    };
    const dialogs = new MutationObserver(checkModal);
    dialogs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-modal'] });
    checkModal(); schedule();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); dialogs.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); };
  }, []);

  useEffect(() => {
    if (!updating) return;
    const generation = lifetime.current;
    let stopped = false, timer;
    const poll = async () => {
      let next;
      try {
        next = await invoke('workBuddyUpdateState');
      } catch (reason) {
        if (!stopped && active(generation)) {
          setProgress(previous => ({ ...previous, message: '正在更新，暂时未能读取进度…' }));
          timer = setTimeout(poll, 1000);
        }
        return;
      }
      if (stopped || !active(generation)) return;
      setProgress(next);
      if (!next?.busy && !updatePending.current) {
        updatingRef.current = false; setUpdating(false); setBusy('');
        if (next?.error) { await showError(next.error, generation); return; }
        try {
          const latest = await invoke('workBuddyStatus');
          if (!active(generation)) return;
          applyStatus(latest);
          setNotice('控制面板更新已完成，账号数据已保留。'); setRelease(null);
          await openView(generation);
        } catch (reason) { await showError(reason, generation); }
        return;
      }
      if (!stopped) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 300);
    return () => { stopped = true; clearTimeout(timer); };
  }, [updating, active, applyStatus, invoke, openView, showError]);

  useEffect(() => {
    if (!confirmUpdate) return;
    const previous = document.activeElement;
    dialogRef.current?.querySelector('button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [confirmUpdate]);
  const dialogKeys = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); cancelUpdate(); }
    if (event.key !== 'Tab') return;
    const buttons = dialogRef.current?.querySelectorAll('button:not(:disabled)');
    if (!buttons?.length) return;
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const count = accountCount(status?.accounts);
  const pending = Boolean(busy) || updating;
  const connection = visible ? '已连接' : status?.running ? '服务运行中' : status?.installed ? '待连接' : status ? '未找到安装' : '正在检查';

  return <section className="workbuddy-panel" aria-label="WorkBuddy 号池">
    <div className="workbuddy-toolbar">
      <div className="workbuddy-summary">
        <span className="workbuddy-icon"><PanelsTopLeft size={22} /></span>
        <div><strong>WorkBuddy 号池</strong><div className="workbuddy-meta"><span className={`workbuddy-status ${status?.running ? 'running' : ''}`}><i />{connection}</span><span>面板 {status?.version || '—'}</span>{count !== null && <span>{count} 个账号</span>}</div></div>
      </div>
      <div className="workbuddy-actions">
        <button className="secondary" onClick={refresh} disabled={pending} aria-label="刷新 WorkBuddy"><RefreshCw size={15} className={busy === 'load' ? 'workbuddy-spin' : ''} />刷新</button>
        <button className="secondary" onClick={checkUpdate} disabled={pending || !status?.installed}><ArrowUpCircle size={15} />{busy === 'check' ? '检查中…' : '检查更新'}</button>
        {release?.available && <button className="primary" onClick={requestUpdate} disabled={pending}>更新至 {release.latestVersion}</button>}
      </div>
    </div>
    <div className="workbuddy-install-info"><ShieldCheck size={14} /><span>使用当前行舟管理员身份连接</span><button onClick={selectRoot} disabled={pending}><FolderOpen size={14} />{busy === 'select' ? '选择中…' : status?.installed ? '更换安装目录' : '选择安装目录'}</button></div>
    {status?.root && <p className="workbuddy-root" title={status.root}>安装目录：{status.root}</p>}
    {error && <div className="auth-error workbuddy-error" role="alert"><AlertCircle size={16} /><span>{error}</span><button onClick={refresh} disabled={pending}>重试连接</button></div>}
    {notice && !error && <div className="auth-notice workbuddy-notice" role="status"><CheckCircle2 size={16} /><span>{notice}</span></div>}
    {updating && <div className="workbuddy-progress" role="status" aria-live="polite"><LoaderCircle size={19} className="workbuddy-spin" /><div><strong>正在更新控制面板</strong><p>{progress?.message || '正在下载并验证官方更新…'}</p><small>账号与配置将保留，请勿关闭软件。</small></div></div>}
    <div ref={hostRef} className={`workbuddy-view-host${visible ? ' connected' : ''}`} aria-label="WorkBuddy 控制面板显示区域">
      {!visible && <div className="workbuddy-empty">
        {busy === 'load' || busy === 'select' ? <LoaderCircle size={36} className="workbuddy-spin" /> : <PanelsTopLeft size={38} />}
        <h2>{updating ? '控制面板正在更新' : busy === 'load' ? '正在连接 WorkBuddy' : error ? '控制面板暂未连接' : !status?.installed ? '连接本机 WorkBuddy 控制面板' : '打开控制面板'}</h2>
        <p>{updating ? '更新期间暂时关闭面板页面，完成后会恢复。' : error ? '检查上方提示后重试连接。' : !status?.installed ? '会自动查找本机快捷方式。若未找到，请选择已安装的控制面板目录。' : '连接后可在这里管理 WorkBuddy 账号池。'}</p>
        {!pending && <button className="primary" onClick={status?.installed ? refresh : selectRoot}><FolderOpen size={16} />{status?.installed ? '重新连接' : '选择安装文件夹'}</button>}
      </div>}
    </div>
    {confirmUpdate && createPortal(<div className="veil workbuddy-update-veil" onMouseDown={event => { if (event.target === event.currentTarget) cancelUpdate(); }}>
      <div ref={dialogRef} className="modal workbuddy-update-dialog" role="dialog" aria-modal="true" aria-labelledby="workbuddy-update-title" onKeyDown={dialogKeys}>
        <header><span className="workbuddy-dialog-icon"><ArrowUpCircle size={25} /></span><button className="ghost" aria-label="关闭更新确认" onClick={cancelUpdate}><X size={18} /></button></header>
        <h2 id="workbuddy-update-title">更新 WorkBuddy 控制面板</h2>
        <p>从官方 GitHub 获取 {release?.latestVersion || '最新版本'}，更新控制面板与预构建网页。Go 引擎保留当前版本。</p>
        <div className="workbuddy-update-details"><ShieldCheck size={19} /><div><strong>先备份，再更新</strong><p>当前面板将先备份，账号、配置与数据库保留。更新期间暂时关闭面板页面，完成后重新连接。</p></div></div>
        <div className="modal-actions"><button className="secondary" onClick={cancelUpdate}>取消</button><button className="primary" onClick={runUpdate}><ArrowUpCircle size={16} />备份并更新</button></div>
      </div>
    </div>, document.body)}
  </section>;
}
