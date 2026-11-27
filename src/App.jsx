import { dismissWorkspaceDialogs, setWorkspaceDialogsEnabled } from './components/workspace-dialog.js';
import {upgradeMuseProfiles} from '../core/museLocal.js';
import {bindingStorageEpoch,subscribeBindingStorage} from '../core/projectBindingCache.js';
import {LogoutConfirm} from './components/LogoutConfirm.jsx';
import {SettingsUtilityCards} from './components/SettingsUtilityCards.jsx';
import './temporary-references.css';
import {initializeClientDistribution} from '../core/clientDistribution.js';
import {migrateDirectorReplies,retireDirectorReplies} from '../core/directorLegacyReplies.js';
import {ProjectRecycleBin} from './components/ProjectRecycleBin.jsx';
import {cleanupRecycle} from '../core/projectRecycle.js';
import {commitDirectoryChange} from '../core/dataDirectoryCommit.js';
import {beginAssetImageDirectorySwitch,finishAssetImageDirectorySwitch,pauseAssetImageBatches,revokeAssetImageActivities} from '../core/assetImageActivity.js';
import {createPortal} from 'react-dom';
import {flushEditing,interruptEditingComposition,settleEditing} from './editing.js';
import {UserProfile} from './v06/UserProfile.jsx';
import {SidebarGroup} from './components/SidebarGroup.jsx';
import {QuickRoleSwitch} from './components/QuickRoleSwitch.jsx';
import {WorkspacePresence,WorkspaceActiveContext} from './components/WorkspacePresence.jsx';
import {WinAIWorkspace} from './v06/WinAIWorkspace.jsx';
import {navigationForRole,SHARED_WORKSPACES,ROLE_WORKSPACES} from '../core/workspaceNavigation.js';
import {GenerationMonitor} from './v06/GenerationMonitor.jsx';
import packageInfo from '../package.json';
import React, { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import { Film, BookOpen, Library, ScrollText, Settings, Sparkles, KeyRound, Network, Trash2, PenLine, HardDrive, Users, LogOut, ShieldCheck, Palette } from 'lucide-react';
import { cleanupChatSessions, createInitialState, normalizeState, mergePersistedState, mergeDirectorSnapshot, stateForDataDirectory } from '../core/projectStore.js';
import { SkillLibrary, ApiLibrary, BrandLogo } from './v06/GlobalTools.jsx';
import { DirectorWorkspace } from './v06/DirectorWorkspace.jsx';
import { PersistentChat } from './v06/PersistentChat.jsx';
import { RegistrationScreen, LockedRoleDialog } from './v06/AccountAccess.jsx';
import { AdminPanel } from './v06/AdminPanel.jsx';
import {useProductionFurnace} from './v06/useProductionFurnace.js';
import { CanvasWorkspace } from './v06/CanvasWorkspace.jsx';
import { CollabWorkspace } from './v06/CollabWorkspace.jsx';
import { GenerationWorkspace } from './v06/GenerationWorkspace.jsx';
import { FloatingAIButton } from './v06/FloatingAIButton.jsx';
import { StudioRoleScreen } from './v06/StudioRoleScreen.jsx';
import { createDirectorPersistence } from '../core/directorPersistence.js';
import { useDirectorQuickGeneration } from './v06/useDirectorQuickGeneration.js';
import { CreatorWorkspace } from './creator/CreatorWorkspace.jsx';
import { recoverCreatorTasks } from '../core/creatorWorkspace.js';

// ========== 常量 ==========
const STORAGE = 'xingzhou-film-v1';
const normalizeAccount = (savedAccount) => savedAccount ? {
  ...savedAccount,
  roles: Array.isArray(savedAccount.roles) ? savedAccount.roles : [],
  activeRole: ['creator', 'director'].includes(savedAccount.activeRole) ? savedAccount.activeRole : null,
} : null;

export class RenderErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { reportRendererIncident('render-error');console.error('[xingzhou-render-error]', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="render-error-page">
      <BrandLogo />
      <h1>工作区加载失败</h1>
      <p>软件已阻止白屏。请重新加载工作区；项目文件和云端数据不会被删除。</p>
      <pre>{String(this.state.error?.message || this.state.error)}</pre>
      <button className="primary" onClick={() => window.location.reload()}>重新加载工作区</button>
    </div>;
  }
}

import {desktopIpc} from '../core/desktopIpc.js';
import {reportRendererIncident} from './runtimeIncident.js';
// API 对象：Electron 环境用 window.xingzhou，浏览器 fallback
const api = desktopIpc(window.xingzhou) || {
  saveTxt: ({ name, content }) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    a.download = name + '.txt';
    a.click();
    return Promise.resolve(name);
  },
  aiChat: () => Promise.reject(new Error('桌面应用中才可连接 API')),
  cancelAiTask: () => Promise.resolve(false),
  testAiConnection: () => Promise.reject(new Error('桌面应用中才可连接 API')),
  storageInfo: () => Promise.resolve({ dataDir: '浏览器本地存储', dataFile: 'localStorage', engine: '浏览器' }),
  loadState: () => Promise.resolve(null),
  saveState: () => Promise.resolve(),
  loadDirectorProjects: () => Promise.resolve(null),
  saveDirectorProjects: () => Promise.resolve(),
  selectDataDir: () => Promise.resolve(null),
  openDataDir: () => Promise.resolve(),
  appVersion: () => Promise.resolve('0.3.0'),
  checkUpdate: () => Promise.resolve({ configured: false, currentVersion: '0.3.0' }),
  openExternal: (url) => window.open(url),
  importFullScript: () => Promise.resolve(null),
  downloadUpdate: () => Promise.reject(new Error('桌面应用中才可下载更新')),
  installUpdate: () => Promise.resolve(),
  onUpdateProgress: () => () => {},
  authSession: () => { try { return Promise.resolve(JSON.parse(localStorage.getItem('xz-dev-account'))); } catch { return Promise.resolve(null); } },
  authRegister: () => Promise.reject(new Error('请在桌面客户端中注册')),
  authLogin: () => Promise.reject(new Error('请在桌面客户端中登录')),
  authLogout: () => Promise.resolve(),
  authUnlockRole: () => Promise.reject(new Error('请在桌面客户端中解锁身份')),
  authSendEmailCode: () => Promise.reject(new Error('请在桌面客户端中发送验证码')),
  authRecover: () => Promise.reject(new Error('请在桌面客户端中找回账号')),
  adminListUsers: () => Promise.reject(new Error('请在桌面客户端中使用管理后台')),
  adminDeleteUser: () => Promise.reject(new Error('请在桌面客户端中使用管理后台')),
  adminSetBanned: () => Promise.reject(new Error('请在桌面客户端中使用管理后台')),
  adminCreateInvite: () => Promise.reject(new Error('请在桌面客户端中使用管理后台')),
  adminListInvites: () => Promise.reject(new Error('请在桌面客户端中使用管理后台')),
  adminDisableInvite: () => Promise.reject(new Error('请在桌面客户端中使用管理后台')),
  mediaGenerateImage: () => Promise.reject(new Error('桌面应用中才可生成图片')),
  mediaGenerateVideo: () => Promise.reject(new Error('桌面应用中才可生成视频')),
  mediaImportFile: () => Promise.resolve(null),
  mediaExportFile: () => Promise.resolve(null),
  onMediaTaskStatus: () => () => {},
  collabIsProducer: () => Promise.resolve(false),
  collabAdminSetProducer: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabCreateProject: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabListProjects: () => Promise.resolve([]),
  collabGetProject: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabUpdateProject: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabLinkDirector: () => Promise.reject(new Error('桌面应用中才可重新关联导演项目')),
  collabSetProjectLocked: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  directorCollabCreateProject: () => Promise.reject(new Error('桌面应用中才可使用导演协作')),
  directorCollabListProjects: () => Promise.resolve([]),
  directorCollabGetProject: () => Promise.reject(new Error('桌面应用中才可使用导演协作')),
  directorCollabUpdateProject: () => Promise.reject(new Error('桌面应用中才可使用导演协作')),
  directorCollabSetLocked: () => Promise.reject(new Error('桌面应用中才可使用导演协作')),
  directorListMembers: () => Promise.resolve([]),
  directorAddMember: () => Promise.reject(new Error('桌面应用中才可使用导演协作')),
  directorRemoveMember: () => Promise.reject(new Error('桌面应用中才可使用导演协作')),
  collabDeleteProject: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabRestoreProject: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabCreateAsset: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabListAssets: () => Promise.resolve([]),
  collabUpdateAsset: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabGenerateAssetImage: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabAttachGeneratedAssetImage: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabUploadAssetImage: () => Promise.resolve(null),
  collabDeleteAssetImage: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabClearAssetImages: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabExportImages: () => Promise.reject(new Error('桌面应用中才可导出云端图片')),
  collabListMembers: () => Promise.resolve([]),
  collabAddMember: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabUpdateMemberRole: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabRemoveMember: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabListTasks: () => Promise.resolve([]),
  collabAssignTask: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabUpdateTask: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabDeleteTask: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabListMedia: () => Promise.resolve([]),
  collabGenerateVideo: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabRecordGeneratedMedia: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabUploadMedia: () => Promise.resolve(null),
  collabDeleteMedia: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabListMessages: () => Promise.resolve([]),
  collabSendMessage: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
  collabSendImage: () => Promise.resolve(null),
  collabGetStats: () => Promise.reject(new Error('桌面应用中才可使用项目协作')),
};

function SettingsPage({ state, setState, getState=()=>state, beforeSelectDataDir, afterSelectDataDir, onDataDirectoryChange }) {
  const [storageInfo, setStorageInfo] = useState(null);
  const [selectingDirectory, setSelectingDirectory] = useState(false);
  const [directoryError, setDirectoryError] = useState('');
  const [appVersion, setAppVersion] = useState('0.9.7');
  useEffect(() => { api.storageInfo().then(setStorageInfo); api.appVersion().then(setAppVersion); }, []);

  const handleSelectDir = async () => {
    if(selectingDirectory)return;
    setSelectingDirectory(true);setDirectoryError('');
    let holding=false,pausingImages=false,prepared;
    try {
      if(api.chooseDataDir && !await api.chooseDataDir())return;
      pausingImages=true;
      await beginAssetImageDirectorySwitch();
      const savedSnapshot = await beforeSelectDataDir?.();holding=true;
      prepared = await (api.applyDataDir?api.applyDataDir(savedSnapshot || state):api.selectDataDir(savedSnapshot || state));
      const result = prepared&&await commitDirectoryChange({snapshot:savedSnapshot||state,getState,prepared,api});
      if (result) {
        setStorageInfo(result.info);
        onDataDirectoryChange(result.info?.dataDir||'');
        if (result.state) setState(stateForDataDirectory(result.state,result.directorProjects));
        try { if(result.info?.dataDir)localStorage.setItem(STORAGE+'-data-dir',result.info.dataDir); } catch { /* disk remains primary */ }
      }
    }catch(e){if(prepared?.migrationId)await api.cancelDataDir?.({migrationId:prepared.migrationId});setDirectoryError(e.message||'切换资料位置失败');}
    finally{if(holding)afterSelectDataDir?.();if(pausingImages)finishAssetImageDirectorySwitch();setSelectingDirectory(false);}
  };

  return (
    <div className="settings-page">
      {selectingDirectory&&createPortal(<div role="dialog" aria-modal="true" aria-label="正在迁移资料" style={{position:'fixed',inset:0,zIndex:100000,background:'#f4f6fbe8',display:'grid',placeItems:'center'}}><p>正在核验并迁移资料，请等待完成后继续编辑。</p></div>,document.body)}
      <header>
        <span className="eyebrow">行舟影视设置</span>
        <h1>设置</h1>

      </header>

      <section className="settings-card">
        <div className="settings-title">
          <div>
            <HardDrive size={20} />
            <span>
              <h2>本地资料位置</h2>

            </span>
          </div>
          <b>{storageInfo?.engine || '本地资料库'}</b>
        </div>
        <label>项目资料目录 <input readOnly value={storageInfo?.dataDir || '正在读取…'} /></label>
        <label>资料文件 <input readOnly value={storageInfo?.dataFile || '正在读取…'} /></label>
        <div className="settings-actions">
          <button className="primary" disabled={selectingDirectory} onClick={handleSelectDir}>{selectingDirectory?'正在切换…':'选择资料位置'}</button>
          {directoryError&&<p role="alert">{directoryError}</p>}
          <button className="secondary" onClick={() => api.openDataDir()}>打开资料文件夹</button>
        </div>
      </section>

      <SettingsUtilityCards api={api} version={appVersion}/>
    </div>
  );
}

/* ================================================================
 * App - 主应用组件
 * ================================================================ */
function createSaveStatus() {
  let value = { saved: false };
  const listeners = new Set();
  return {
    read: () => value,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    update(next) {
      if (value.saved === next.saved && value.saving === next.saving && value.error === next.error) return;
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

function SaveStatusOutlet({ store, children }) {
  return children(useSyncExternalStore(store.subscribe, store.read));
}

function App() {
  const [role, setRole] = useState(null);
  const [nav, setNavigation] = useState('fruit');
  const setNav = useCallback(next => {
    dismissWorkspaceDialogs();
    setNavigation(next);
  }, []);
  const lastRole=useRef('creator'),rolePages=useRef({creator:'fruit',director:'director'});
  if(role){lastRole.current=role;if(ROLE_WORKSPACES[role]?.includes(nav))rolePages.current[role]=nav;}
  const [creatorDestination,setCreatorDestination]=useState(null),[creatorSection,setCreatorSection]=useState({});
  const chooseCreatorSection=(area,tab)=>{setCreatorDestination({area,tab,id:crypto.randomUUID()});setNav(area);};
  const rememberCreatorSection=useCallback(section=>setCreatorSection(current=>current[section.area]===section.tab?current:{...current,[section.area]:section.tab}),[]);
  const lastCreatorArea=useRef('fruit');
  if(['fruit','studio','scripts'].includes(nav))lastCreatorArea.current=nav;
  const [canvasRoute, setCanvasRoute] = useState(() => localStorage.getItem('xz-canvas-last-route') || '#/canvas');
  const canvasFrameRef = useRef(null);
  const [canvasVisited, setCanvasVisited] = useState(false);
  const [visitedWorkspaces, setVisitedWorkspaces] = useState({});
  const saveStatus = useMemo(createSaveStatus, []);
  useEffect(() => {
    if (nav === 'director' || nav === 'collab' || nav === 'generation' || SHARED_WORKSPACES.includes(nav) || ['fruit', 'studio', 'scripts'].includes(nav)) {
      const key = ['fruit', 'studio', 'scripts'].includes(nav) ? 'creator' : nav;
      setVisitedWorkspaces((current) => current[key] ? current : { ...current, [key]: true });
    }
  }, [nav]);
  const initialCanvasRoute = useRef(canvasRoute);
  useEffect(() => { if (nav === 'canvas') setCanvasVisited(true); }, [nav]);
  const [account, setAccount] = useState(null);
  const [dataDirectory,setDataDirectory]=useState('');
  const directoryEpoch=useSyncExternalStore(subscribeBindingStorage,bindingStorageEpoch);
  useEffect(() => {
    setWorkspaceDialogsEnabled(Boolean(role && account?.id));
    return () => setWorkspaceDialogsEnabled(false);
  }, [role, account?.id]);
  const [authReady, setAuthReady] = useState(false);
  const [registerRole, setRegisterRole] = useState(null);
  const [lockedRole, setLockedRole] = useState(null);
  const [logoutOpen,setLogoutOpen]=useState(false);
  const [initialized, setInitialized] = useState(false);
  const [storageLoadError, setStorageLoadError] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiAttachment, setAiAttachment] = useState(null);
  const [state, setRenderedState] = useState(() => {
    try {
      return normalizeState(JSON.parse(localStorage.getItem(STORAGE)) || createInitialState());
    } catch {
      return createInitialState();
    }
  });

  // All state mutations share the latest synchronous snapshot, including background commits.
  const stateRef = useRef(state);
  const getState = useCallback(() => stateRef.current, []);
  const setState = useCallback(updates => {
    const next = typeof updates === 'function' ? updates(stateRef.current) : updates;
    stateRef.current = next;
    setRenderedState(next);
  }, []);
  const persistenceRef = useRef(null);
  if (!persistenceRef.current) persistenceRef.current = createDirectorPersistence({
    saveState: value => api.saveState(value),
    saveDirectorProjects: projects => api.saveDirectorProjects?.(projects),
    saveDelta: api.saveWorkspaceDelta,
  });
  const persistence = persistenceRef.current;
  const saveLocal = useCallback(async () => {
    persistence.enqueue(stateRef.current);
    await persistence.flush();
  }, [persistence]);
  const saveCreator = useCallback(async () => {
    try {
      flushEditing();
      saveStatus.update({saving:true});
      await saveLocal();
      saveStatus.update({saved:true});
    } catch (error) { saveStatus.update({error:error.message}); }
  }, [saveLocal, saveStatus]);
  useEffect(()=>{
    if(!initialized||storageLoadError||!account?.id||!window.xingzhou)return;
    const migrated=migrateDirectorReplies(stateRef.current,account.id,localStorage);
    if(!migrated.retired.length)return;
    setState(migrated.state);persistence.enqueue(stateRef.current);
    persistence.flush().then(()=>retireDirectorReplies(migrated.retired,localStorage)).catch(()=>{/* Original recovery keys stay until a successful retry. */});
  },[initialized,account?.id,storageLoadError]);
  const quickGeneration = useDirectorQuickGeneration({ state, stateRef, setState, api, accountId:account?.id, persistence, initialized });
  const production=useProductionFurnace({api,account,stateRef,setState,quickGeneration});

  useEffect(()=>{
    const beforeQuit=async()=>{
      void pauseAssetImageBatches();
      if(!initialized||storageLoadError)return true;
      document.activeElement?.blur?.();interruptEditingComposition();await settleEditing();
      persistence.enqueue(stateRef.current);await persistence.flush();return true;
    };
    window.__xingzhouBeforeQuit=beforeQuit;
    return()=>{if(window.__xingzhouBeforeQuit===beforeQuit)delete window.__xingzhouBeforeQuit;};
  },[initialized,storageLoadError,persistence]);

  useEffect(() => {
    const receiveCanvasRoute = (event) => {
      if (!canvasFrameRef.current || event.source !== canvasFrameRef.current.contentWindow) return;
      if (event.data?.type !== 'xingzhou-canvas-route' || !String(event.data.hash || '').startsWith('#/')) return;
      const route = String(event.data.hash);
      localStorage.setItem('xz-canvas-last-route', route);
      setCanvasRoute(route);
    };
    window.addEventListener('message', receiveCanvasRoute);
    return () => window.removeEventListener('message', receiveCanvasRoute);
  }, []);

  // 加载持久化状态
  const loadSavedState = useCallback(async () => {
    try {
      const [saved, directorProjects, info] = await Promise.all([api.loadState(), api.loadDirectorProjects?.() || Promise.resolve(null), api.storageInfo()]);
      setDataDirectory(info.dataDir||'');
      const cachedDirectory=localStorage.getItem(STORAGE+'-data-dir');
      const recoverRecycle=!cachedDirectory||cachedDirectory===info.dataDir;
      persistence.seed(mergeDirectorSnapshot(saved,directorProjects));
      setState(current => initializeClientDistribution(upgradeMuseProfiles(recoverCreatorTasks(mergePersistedState(current, mergeDirectorSnapshot(saved,directorProjects),{recoverRecycle}))),{fresh:saved===null&&directorProjects===null&&!localStorage.getItem(STORAGE)}));
      try { localStorage.setItem(STORAGE+'-data-dir',info.dataDir); } catch { /* disk remains primary */ }
      setStorageLoadError('');
      setInitialized(true);
    } catch (error) { setInitialized(false); setStorageLoadError(error.message || '本地资料读取失败'); }
  }, [setState,persistence]);
  useEffect(() => { loadSavedState(); }, [loadSavedState]);

  useEffect(() => {
    api.authSession().then((savedAccount) => {
      const safeAccount = normalizeAccount(savedAccount);
      setAccount(safeAccount);
      if (safeAccount) {
        const lastRole = localStorage.getItem('xz-role');
        const nextRole = safeAccount.roles.includes(lastRole) ? lastRole : safeAccount.activeRole;
        setRole(nextRole);
        setNav(nextRole === 'director' ? 'director' : 'fruit');
      }
      setAuthReady(true);
    }).catch(() => setAuthReady(true));
  }, []);

  // Coalesce editing updates, but continuous typing must still reach local disk.
  const saveDeadline = useRef(null), saveQuiet = useRef(null), savePending = useRef(false), typingUntil = useRef(0), inputComposing = useRef(false);
  const persistLocal = useRef(null);
  const scheduleSaveDeadline = () => {
    if (!saveDeadline.current) saveDeadline.current = setTimeout(() => { saveDeadline.current = null; persistLocal.current(true); }, 15000);
  };
  persistLocal.current = async (force = false) => {
    if (inputComposing.current) return;
    if (!force && Date.now() < typingUntil.current) {
      clearTimeout(saveQuiet.current); saveQuiet.current = setTimeout(() => persistLocal.current(), typingUntil.current - Date.now()); return;
    }
    flushEditing();
    if (!savePending.current) return;
    savePending.current = false;
    clearTimeout(saveQuiet.current); saveQuiet.current = null;
    clearTimeout(saveDeadline.current); saveDeadline.current = null;
    const snapshot = stateRef.current;
    // The desktop local file is primary; the browser cache is a recovery copy.
    try { if(!window.xingzhou)localStorage.setItem(STORAGE, JSON.stringify(snapshot)); }
    catch (error) { console.warn('浏览器缓存已满，继续保存本地资料文件', error.name); }
    try {
      persistence.enqueue(snapshot); await persistence.flush();
      saveStatus.update(savePending.current ? { saving: true } : { saved: true });
    } catch (error) { saveStatus.update({ error: error.message }); }
  };
  useEffect(() => {
    if (!initialized) return;
    savePending.current = true; saveStatus.update({ saving: true });
    scheduleSaveDeadline();
    clearTimeout(saveQuiet.current); saveQuiet.current = setTimeout(() => persistLocal.current(), 1200);
    return () => clearTimeout(saveQuiet.current);
  }, [state, initialized]);
  useEffect(() => {
    if (!initialized) return;
    const flush = () => { document.activeElement?.blur?.(); flushEditing(); savePending.current = true; persistLocal.current(true); };
    const input = event => {
      if (!event.target?.matches?.('input,textarea,[contenteditable=true]')) return;
      savePending.current = true; scheduleSaveDeadline();
      typingUntil.current = Date.now() + 1200;
      clearTimeout(saveQuiet.current); saveQuiet.current = setTimeout(() => persistLocal.current(), 1200);
    };
    const composing = () => { inputComposing.current = true; clearTimeout(saveQuiet.current); };
    const composed = event => { inputComposing.current = false; if (savePending.current) scheduleSaveDeadline(); input(event); };
    const interrupted = event => composed({target:event.detail});
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    document.addEventListener('input', input, true);
    document.addEventListener('compositionstart', composing, true);
    document.addEventListener('compositionend', composed, true);
    document.addEventListener('xz-composition-interrupted', interrupted);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
      document.removeEventListener('input', input, true);
      document.removeEventListener('compositionstart', composing, true);
      document.removeEventListener('compositionend', composed, true);
      document.removeEventListener('xz-composition-interrupted', interrupted);
      clearTimeout(saveQuiet.current);
      clearTimeout(saveDeadline.current); saveDeadline.current = null;
    };
  }, [initialized]);

  // 清理过期会话
  useEffect(() => {
    if (initialized) {
      setState((s) => cleanupChatSessions(s));
    }
  }, [initialized]);

  useEffect(()=>{if(!initialized)return;const check=()=>setState(s=>cleanupRecycle(s));check();const timer=setInterval(check,60*60*1000);return()=>clearInterval(timer);},[initialized,setState]);

  // 角色选择
  const enterRole = (r) => {
    const nextNav=navigationForRole({account,targetRole:r,currentNav:nav,remembered:rolePages.current[r]});
    document.activeElement?.blur?.();
    setRole(r);
    localStorage.setItem('xz-role', r);
    setNav(nextNav);
  };

  const handleRoleSelect = (r) => {
    if (!account) { setRegisterRole(r); return; }
    if (!account.roles.includes(r)) { setLockedRole(r); return; }
    enterRole(r);
  };

  const handleAuthenticated = (nextAccount, requestedRole = registerRole) => {
    const safeAccount = normalizeAccount(nextAccount);
    setAccount(safeAccount);
    setRegisterRole(null);
    const nextRole = safeAccount.roles.includes(requestedRole) ? requestedRole : safeAccount.activeRole;
    setRole(nextRole);localStorage.setItem('xz-role',nextRole);setNav(nextRole==='director'?'director':'fruit');
  };

  const handleLogout = () => setLogoutOpen(true);
  const performLogout = async () => {
    revokeAssetImageActivities();
    dismissWorkspaceDialogs();window.dispatchEvent(new Event('xz-auth-ending'));
    setAiOpen(false);setAiAttachment(null);setLockedRole(null);
    const stopping=Promise.allSettled([quickGeneration.pauseAndFlush(),production?.pauseAll()]);
    try{await api.authLogout();}
    finally{
      await stopping;
      setLogoutOpen(false);setAccount(null);setRole(null);setRegisterRole(null);
      setVisitedWorkspaces({});setCanvasVisited(false);setCreatorDestination(null);setCreatorSection({});
      rolePages.current={creator:'fruit',director:'director'};
      localStorage.removeItem('xz-role');
    }
  };

  if (!authReady) return <div className="app-loading"><BrandLogo /><span>正在读取账号权限…</span></div>;
  if (storageLoadError) return <div className="render-error-page"><BrandLogo /><h1>本地资料暂时无法读取</h1><p>{storageLoadError}</p><button className="primary" onClick={loadSavedState}>重新读取资料</button></div>;

  if (registerRole) {
    return <RegistrationScreen requestedRole={registerRole} onClose={() => setRegisterRole(null)} onRegistered={handleAuthenticated} onLogin={handleAuthenticated} />;
  }

  // 角色选择界面
  if (!role&&!account) {
    return (
      <StudioRoleScreen account={account} onSelect={handleRoleSelect} onLogout={handleLogout}>
        {lockedRole && <LockedRoleDialog targetRole={lockedRole} onClose={() => setLockedRole(null)} onUnlocked={(nextAccount) => { setAccount(nextAccount); const nextRole = lockedRole; setLockedRole(null); enterRole(nextRole); }} />}
      </StudioRoleScreen>
    );
  }

  // 导航配置
  const creatorNav = [
    ['fruit', BookOpen, '成品库'],
    ['studio', PenLine, '创作剧本'],
    ['scripts', ScrollText, '剧本库'],
  ];
  const toolsNav = [
    ['skills', Library, 'Skill 库'],
    ['apis', KeyRound, 'API 接口'],
    ['winai', Network, 'Win AI'],
    ['settings', Settings, '设置'],
    ['recycle', Trash2, '回收站'],
  ];
  const directorNav = [
    ['director', Film, '导演工作台'],
    ['collab', Users, '项目协作'],
    ['generation', Sparkles, '图视生成'],
    ['canvas', Palette, '画布'],
  ];

  const adminNav = account?.isAdmin ? [['admin', ShieldCheck, '管理后台']] : [];
  const workspaceRole=role||lastRole.current;
  const navItems=workspaceRole==='director'?directorNav:creatorNav;
  const sharedNav=[...toolsNav,...adminNav];
  const unlockRole=nextAccount=>{const r=lockedRole;setAccount(nextAccount);setLockedRole(null);document.activeElement?.blur?.();setRole(r);localStorage.setItem('xz-role',r);setNav(navigationForRole({account:nextAccount,targetRole:r,currentNav:nav,remembered:rolePages.current[r]}));};

  return (
    <><WorkspaceActiveContext.Provider value={!!role}><div key={account?.id} className="app v06-app" hidden={!role} style={role?undefined:{display:'none'}}><GenerationMonitor state={state} api={api} account={account}/>
      {/* 侧边导航栏 */}
      <nav className="sidebar" id="app-sidebar">
        <BrandLogo compact />
        <UserProfile account={account} api={api} onUpdate={setAccount} role={role}/>
        <span className="shared-tools-label sidebar-main-label">常用</span>
        {navItems.map(([key, Icon, label]) => ['fruit','studio'].includes(key)?<SidebarGroup key={key} label={label} Icon={Icon} active={nav===key} selected={creatorSection[key]} items={key==='fruit'?[{id:'fruit',label:'果子库'},{id:'ip',label:'IP 库'}]:[{id:'rewrite',label:'洗稿'},{id:'original',label:'原创'}]} onNavigate={()=>setNav(key)} onSelect={tab=>chooseCreatorSection(key,tab)}/>:(
          <button key={key} aria-label={label} title={label} className={nav === key ? 'active' : ''} onClick={() => setNav(key)}>
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
        <span className="shared-tools-label">更多</span>
        {sharedNav.map(([key,Icon,label])=><button key={key} aria-label={label} title={label} className={nav===key?'active':''} onClick={()=>setNav(key)}><Icon size={19}/><span>{label}</span></button>)}
        <div className="side-bottom">
          <QuickRoleSwitch role={role} account={account} onSelect={handleRoleSelect} onChooseScreen={()=>{document.activeElement?.blur?.();setRole(null);localStorage.removeItem('xz-role');}}/>
          <button aria-label="退出登录" title="退出登录" onClick={handleLogout}>
            <LogOut size={18} /> <span>退出登录</span>
          </button>
          <small>本地资料 · {packageInfo.version}</small>
        </div>
      </nav>

      {/* 主内容区域 */}
      <section className="content">
        {/* 全局 AI 按钮（画布页有自己的顶栏，不显示悬浮按钮） */}
        {nav !== 'canvas' && nav !== 'winai' && (
          <FloatingAIButton onOpen={() => setAiOpen(true)} />
        )}

        {(visitedWorkspaces.creator || ['fruit','studio','scripts'].includes(nav)) && <WorkspacePresence active={!!role&&['fruit','studio','scripts'].includes(nav)}><SaveStatusOutlet store={saveStatus}>{status=><CreatorWorkspace area={lastCreatorArea.current} destination={creatorDestination} onSectionChange={rememberCreatorSection} state={state} setState={setState} getState={getState} api={api} onNavigate={setNav} saveStatus={status} onSave={saveCreator}/>}</SaveStatusOutlet></WorkspacePresence>}
        {(visitedWorkspaces.skills||nav==='skills')&&<WorkspacePresence active={!!role&&nav==='skills'}><SkillLibrary state={state} setState={setState}/></WorkspacePresence>}
        {(visitedWorkspaces.apis||nav==='apis')&&<WorkspacePresence active={!!role&&nav==='apis'}><ApiLibrary state={state} setState={setState}/></WorkspacePresence>}
        {!!role&&nav==='winai'&&<WinAIWorkspace key={account?.id} account={account}/>}
        {(visitedWorkspaces.recycle||nav==='recycle')&&<WorkspacePresence active={!!role&&nav==='recycle'}><SaveStatusOutlet store={saveStatus}>{status=><ProjectRecycleBin state={state} setState={setState} saveStatus={status} onNavigate={setNav}/>}</SaveStatusOutlet></WorkspacePresence>}
        {(visitedWorkspaces.settings||nav==='settings')&&<WorkspacePresence active={!!role&&nav==='settings'}><SettingsPage state={state} setState={setState} getState={getState} beforeSelectDataDir={quickGeneration.prepareDirectorySwitch} afterSelectDataDir={quickGeneration.finishDirectorySwitch} onDataDirectoryChange={setDataDirectory}/></WorkspacePresence>}
        {account?.isAdmin && (visitedWorkspaces.admin || nav === 'admin') && <WorkspacePresence active={!!role&&nav==='admin'}><AdminPanel key={account.id} account={account} state={state} setState={setState} production={production} onNavigate={setNav} active={!!role&&nav==='admin'}/></WorkspacePresence>}
        {(visitedWorkspaces.generation || nav === 'generation') && <WorkspacePresence active={!!role&&nav==='generation'}><GenerationWorkspace key={account?.id} state={state} setState={setState} getState={getState} saveLocal={saveLocal} api={api} account={account} /></WorkspacePresence>}
        {(visitedWorkspaces.collab || nav === 'collab') && <WorkspacePresence active={!!role&&nav==='collab'}><CollabWorkspace key={JSON.stringify([account?.id,dataDirectory,directoryEpoch])} state={state} api={api} account={account} dataDirectory={dataDirectory} /></WorkspacePresence>}
        {(canvasVisited || nav === 'canvas') && <div className="canvas-preserved" hidden={nav !== 'canvas'}>{window.xingzhou
          ? <iframe ref={canvasFrameRef} className="canvas-embed" src={`xzapp://canvas/index.html?v=${packageInfo.version}${initialCanvasRoute.current}`} title="无限画布" allow="clipboard-read; clipboard-write" />
          : <CanvasWorkspace state={state} setState={setState} api={api} />}</div>}
        {(visitedWorkspaces.director || nav === 'director') && <WorkspacePresence active={!!role&&nav==='director'}>
          <DirectorWorkspace
            key={account?.id}
            active={!!role&&nav === 'director'}
            accountId={account?.id}
            state={state}
            setState={setState}
            api={api}
            quickGeneration={quickGeneration}
            onAttach={(attachment) => { setAiAttachment(attachment); setAiOpen(true); }}
          />
        </WorkspacePresence>}
      </section>

      {/* 全局 AI 持久会话抽屉 */}
      <PersistentChat
        open={!!role&&aiOpen}
        onClose={() => { setAiOpen(false); setAiAttachment(null); }}
        state={state}
        setState={setState}
        api={api}
        attachment={aiAttachment}
        onRemoveAttachment={() => setAiAttachment(null)}
      />
    </div></WorkspaceActiveContext.Provider><LogoutConfirm open={logoutOpen} onCancel={()=>setLogoutOpen(false)} onConfirm={performLogout}/>{!role&&<StudioRoleScreen account={account} onSelect={handleRoleSelect} onLogout={handleLogout}/>}{lockedRole&&<LockedRoleDialog targetRole={lockedRole} onClose={()=>setLockedRole(null)} onUnlocked={unlockRole}/>}</>
  );
}

export default App;
