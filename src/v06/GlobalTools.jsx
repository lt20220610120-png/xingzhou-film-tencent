import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import companyLogo from '../assets/company-logo.png';
import {
  Settings, KeyRound, Sparkles, Bot, Plus, Save, Trash2, X, Image as ImageIcon, Video,
  Check, FolderOpen, RefreshCw, BookOpen, PenLine, FolderInput, FileUp, PencilLine
} from 'lucide-react';
import { addSkill, updateSkill, removeSkill, addApiProfile, updateApiProfile, setActiveApi, removeApiProfile } from '../../core/projectStore.js';
import { API_PROVIDERS } from '../../core/apiProviders.js';
import { buildSkillFromDirectory, buildSkillFromDocument } from '../../core/skillImport.js';
import { buildSkillContext, buildSkillManifest } from '../../core/skillContext.js';
import { DeleteConfirm } from './DeleteConfirm.jsx';
import { MediaApiSettings } from './CanvasWorkspace.jsx';
import { addMediaProfile, updateMediaProfile, removeMediaProfile, setActiveMediaApi } from '../../core/canvasStore.js';

/* ================================================================
 * BrandLogo - 行舟影视品牌标识
 * ================================================================ */
export function BrandLogo({ compact = false }) {
  return (
    <div className={`brand-logo ${compact ? 'compact' : ''}`}>
      <img src={companyLogo} alt="行舟影视" />
      <div>
        <strong>行舟影视</strong>
        <small>XINGZHOU FILM</small>
      </div>
    </div>
  );
}

/* ================================================================
 * Dialog - 通用对话框
 * ================================================================ */
export function Dialog({ open, title, children, onClose }) {
  const modalRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const focusables = () => [...(modalRef.current?.querySelectorAll('button:not(:disabled), input, select, textarea, [tabindex="0"]') || [])];
    focusables()[0]?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const nodes = focusables(), first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [open]);
  if (!open) return null;
  return createPortal(<div className="veil" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={modalRef} className="modal form-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <div className="form-dialog-header"><h2>{title}</h2><button className="ghost" aria-label="关闭对话框" onClick={onClose}><X size={18}/></button></div>
      {children}
    </div>
  </div>, document.body);
}

/* ================================================================
 * SkillForm - Skill 创建/编辑表单
 * ================================================================ */
export function SkillForm({ initial = {}, onSave, onCancel }) {
  const [name, setName] = useState(initial.name || '');
  const [type, setType] = useState(initial.type || 'custom');
  const [content, setContent] = useState(initial.content || '');
  const [description, setDescription] = useState(initial.description || '');
  const [pendingDoc, setPendingDoc] = useState(null);
  const [uploadError, setUploadError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), type, content, description, files: initial.files || [], importMethod: initial.importMethod || 'manual', sourceName: initial.sourceName || '' });
  };

  // 上传文档并询问是否替换当前提示词内容
  const handleUploadReplace = async () => {
    setUploadError('');
    try {
      if (!window.xingzhou?.importSkillDocument) throw new Error('请在桌面软件中使用文档上传');
      const result = await window.xingzhou.importSkillDocument();
      if (!result) return;
      setPendingDoc(result);
    } catch (error) {
      setUploadError(error.message || '文档上传失败');
    }
  };

  const confirmReplace = () => {
    if (!pendingDoc) return;
    setContent(pendingDoc.content || '');
    setPendingDoc(null);
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Skill 名称
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：大师级提示词1.0"
        />
      </label>
      <label>
        简介
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="说明这个 Skill 在什么情况下使用"
        />
      </label>
      <label>
        类型
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="custom">自定义</option>
          <option value="transform">转换</option>
          <option value="format">格式</option>
          <option value="director">导演</option>
        </select>
      </label>
      <label>
        <span className="skill-content-label-row">
          提示词内容
          <button type="button" className="ghost skill-upload-replace" onClick={handleUploadReplace}>
            <FileUp size={14} /> 上传文档替换
          </button>
        </span>
        <textarea
          rows={initial.importMethod === 'skill-folder' ? 14 : 11}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="输入 Skill 的完整提示词……"
        />
      </label>
      {uploadError && <div className="skill-import-error">{uploadError}</div>}
      {pendingDoc && (
        <div className="skill-replace-confirm">
          <p>已读取文档「{pendingDoc.fileName}」（{(pendingDoc.content || '').length} 字），是否用它替换当前提示词内容？替换后原内容将被覆盖。</p>
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={() => setPendingDoc(null)}>取消</button>
            <button type="button" className="primary" onClick={confirmReplace}><Check size={14} /> 确认替换</button>
          </div>
        </div>
      )}
      {initial.importMethod === 'skill-folder' && (
        <div className="skill-file-summary">
          <strong>完整目录文件</strong>
          <span>SKILL.md</span>
          {(initial.files || []).map((file) => <span key={file.path}>{file.path}</span>)}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="ghost" onClick={onCancel}>取消</button>
        <button type="submit" className="primary">保存</button>
      </div>
    </form>
  );
}

/* ================================================================
 * SkillLibrary - Skill 库管理
 * ================================================================ */
export function SkillLibrary({ state, setState }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);

  const skills = state.skills || [];

  const handleSave = (data) => {
    if (editingSkill) {
      setState((s) => updateSkill(s, editingSkill.id, data));
    } else {
      setState((s) => addSkill(s, { ...data, importMethod: data.importMethod || 'manual', files: data.files || [] }));
    }
    setDialogOpen(false);
    setEditingSkill(null);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      setState((s) => removeSkill(s, deleteTarget.id));
      setDeleteTarget(null);
    }
  };

  const importSkillDirectory = async () => {
    setImportError(''); setImporting(true);
    try {
      if (!window.xingzhou?.importSkillDirectory) throw new Error('请在桌面软件中使用完整 Skill 导入');
      const result = await window.xingzhou.importSkillDirectory();
      if (!result) return;
      const skill = buildSkillFromDirectory(result);
      setState((s) => addSkill(s, skill));
    } catch (error) { setImportError(error.message || '完整 Skill 导入失败'); }
    finally { setImporting(false); }
  };

  const importSkillDocument = async () => {
    setImportError(''); setImporting(true);
    try {
      if (!window.xingzhou?.importSkillDocument) throw new Error('请在桌面软件中使用文档导入');
      const result = await window.xingzhou.importSkillDocument();
      if (!result) return;
      const skill = buildSkillFromDocument(result);
      setState((s) => addSkill(s, skill));
    } catch (error) { setImportError(error.message || '文档导入失败'); }
    finally { setImporting(false); }
  };

  const typeLabels = { custom: '自定义', transform: '转换', format: '格式', director: '导演' };

  return (
    <div className="resource-page">
      <header>
        <span className="eyebrow">工具配置 · Skill 库</span>
        <h1>Skill 库</h1>
        <p>管理和编辑 AI 提示词模板，在创作和导演流程中使用。</p>
      </header>

      <section className="skill-create-panel" aria-label="创建 Skill">
        <div className="skill-create-heading">
          <div><span className="eyebrow">三种方式</span><h2>添加 Skill</h2></div>
          <p>可直接导入带 SKILL.md 与 references 等目录的完整 Skill，也可从文档生成，或在软件内手动编写。</p>
        </div>
        <div className="skill-create-grid">
          <button className="skill-create-option" disabled={importing} onClick={importSkillDirectory}>
            <span><FolderInput /></span><strong>导入完整 Skill</strong><small>选择含 SKILL.md 的文件夹，保留 references、assets 等目录</small>
          </button>
          <button className="skill-create-option" disabled={importing} onClick={importSkillDocument}>
            <span><FileUp /></span><strong>导入文档</strong><small>支持 Markdown 与 TXT，文件名自动成为 Skill 名称</small>
          </button>
          <button className="skill-create-option" onClick={() => { setEditingSkill(null); setDialogOpen(true); }}>
            <span><PencilLine /></span><strong>手动编写</strong><small>打开完整编辑窗口，自定义名称、类型与提示词正文</small>
          </button>
        </div>
        {importError && <div className="skill-import-error">{importError}</div>}
      </section>

      <div className="resource-grid skill-library-grid">

        {skills.map((skill) => (
          <article key={skill.id} className="resource-card skill-card-enhanced" data-type={skill.type}>
            <span className="skill-type-badge">{typeLabels[skill.type] || '自定义'}</span>
            <span className="skill-source-badge">{skill.importMethod === 'skill-folder' ? `完整 Skill · ${buildSkillManifest(skill).totalFiles} 个文件` : skill.importMethod === 'document' ? '文档导入' : '手动编写'}</span>
            <h3>{skill.name}</h3>
            <p>{skill.description || `${skill.content?.slice(0, 80) || ''}${skill.content?.length > 80 ? '……' : ''}`}</p>
            {skill.updatedAt && <div className="skill-meta"><small>更新于 {new Date(skill.updatedAt).toLocaleDateString('zh-CN')}</small></div>}
            <div className="card-tools">
              <button className="secondary" onClick={() => { setEditingSkill(skill); setDialogOpen(true); }}>
                <PenLine size={14} /> 编辑
              </button>
              <button className="card-delete" onClick={() => setDeleteTarget(skill)}>
                <Trash2 size={14} /> 删除
              </button>
            </div>
          </article>
        ))}
      </div>

      {/* Skill 编辑/创建对话框 */}
      <Dialog open={dialogOpen} title={editingSkill ? '编辑 Skill' : '新建 Skill'} onClose={() => { setDialogOpen(false); setEditingSkill(null); }}>
        <SkillForm
          initial={editingSkill || {}}
          onSave={handleSave}
          onCancel={() => { setDialogOpen(false); setEditingSkill(null); }}
        />
      </Dialog>

      {/* 删除确认 */}
      <DeleteConfirm
        open={!!deleteTarget}
        title="删除 Skill"
        name={deleteTarget?.name}
        detail="删除后不可恢复，依赖此 Skill 的项目不会受影响。"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

/* ================================================================
 * ApiForm - API 配置表单
 * ================================================================ */
export function ApiForm({ initial = {}, kind = 'chat', onSave, onCancel }) {
  const providerOptions = Object.values(API_PROVIDERS);
  const [form, setForm] = useState(() => ({
    name: initial.name || '', provider: initial.provider || 'custom', endpoint: initial.endpoint || '',
    model: initial.model || '', apiKey: initial.apiKey || '', protocol: initial.protocol || 'auto',
    requiresApiKey: initial.requiresApiKey ?? true,
  }));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const formRevision = React.useRef(0);
  const update = (key, value) => { formRevision.current++; setForm(f => ({ ...f, [key]: value })); setTestResult(null); };
  const handleProviderChange = (value) => {
    const p = API_PROVIDERS[value];
    formRevision.current++;
    setForm(f => ({ ...f, provider: value, endpoint: p.defaultEndpoint || '', model: p.defaultModel || '', requiresApiKey: p.requiresApiKey, protocol: value === 'claudeCodePool' ? 'anthropic' : 'auto' }));
    setTestResult(null);
  };
  const validate = () => {
    if (!form.endpoint.trim() || !form.model.trim()) return '请填写接口地址和模型名称';
    try { const url = new URL(form.endpoint.trim()); if (!['http:', 'https:'].includes(url.protocol)) return '接口地址必须以 https:// 或 http:// 开头'; } catch { return '请输入完整的接口地址'; }
    if (form.requiresApiKey && !form.apiKey.trim()) return '请填写 API Key';
    return '';
  };
  const handleTest = async () => {
    const error = validate();
    if (error) { setTestResult({ ok: false, message: error }); return; }
    const revision = formRevision.current;
    setTesting(true); setTestResult(null);
    try {
      if (!window.xingzhou?.testAiConnection) throw new Error('请在桌面应用中测试正文');
      const result = await window.xingzhou.testAiConnection({ ...form, endpoint: form.endpoint.trim() });
      if (revision === formRevision.current) setTestResult({ ok: true, message: `收到正文 · ${(result.elapsedMs / 1000).toFixed(1)} 秒`, reply: result.message });
    } catch (e) { if (revision === formRevision.current) setTestResult({ ok: false, message: e.message }); }
    finally { setTesting(false); }
  };
  const handleSubmit = (event) => {
    event.preventDefault();
    const error = validate();
    if (error) { setTestResult({ ok: false, message: error }); return; }
    onSave({ ...initial, ...form, kind, name: form.name.trim() || `${API_PROVIDERS[form.provider]?.name || '自定义'} · ${form.model.trim()}`, endpoint: form.endpoint.trim(), model: form.model.trim(), apiKey: form.apiKey.trim() });
  };
  return <form className="api-config-form" onSubmit={handleSubmit}>
    <p className="api-form-intro">{kind === 'chat' ? '填写服务商提供的地址、模型和密钥。测试会发送一次简短文本请求，确认能收到正文。' : kind === 'image' ? '用于画布、项目协作美术和资产。接口需支持 /images/generations。' : '用于画布与分镜视频。接口需支持火山方舟 /contents/generations/tasks 格式。'}</p>
    <div className="api-form-fields">
      <label>配置名称<input value={form.name} onChange={e => update('name', e.target.value)} placeholder="例如：剧本分析主力、备用接口" autoFocus /></label>
      {kind === 'chat' && <label>服务商<select value={form.provider} onChange={e => handleProviderChange(e.target.value)}>{providerOptions.map(p => <option value={p.type} key={p.type}>{p.name}</option>)}</select></label>}
      <label className="full">接口地址<input value={form.endpoint} onChange={e => update('endpoint', e.target.value)} placeholder="https://服务商域名/v1" spellCheck={false} /><small>可填写基础地址或完整接口路径，请以服务商文档为准。</small></label>
      <label>模型名称<input value={form.model} onChange={e => update('model', e.target.value)} placeholder="粘贴服务商提供的模型 ID" spellCheck={false} /></label>
      {kind === 'chat' && <label>接口协议<select value={form.protocol} onChange={e => update('protocol', e.target.value)}><option value="auto">自动（默认 OpenAI 兼容）</option><option value="chat">Chat Completions</option><option value="responses">Responses</option><option value="anthropic">Anthropic Messages</option></select></label>}
      <label className="full">API Key<div className="api-key-input"><input aria-label="API Key" type={showKey ? 'text' : 'password'} value={form.apiKey} onChange={e => update('apiKey', e.target.value)} placeholder="粘贴密钥" autoComplete="off" spellCheck={false} /><button type="button" className="ghost" onClick={() => setShowKey(v => !v)}>{showKey ? '隐藏' : '显示'}</button></div></label>
      {kind === 'chat' && <label className="api-key-optional full"><input type="checkbox" checked={!form.requiresApiKey} onChange={e => update('requiresApiKey', !e.target.checked)} />本地或自部署服务无需密钥</label>}
    </div>
    {testResult && <div className={`api-test-result ${testResult.ok ? 'success' : 'error'}`} role="status"><strong>{testResult.message}</strong>{testResult.reply && <pre>{testResult.reply}</pre>}</div>}
    <div className="modal-actions"><button type="button" className="ghost" onClick={onCancel}>取消</button>{kind === 'chat' && <button type="button" className="secondary" onClick={handleTest} disabled={testing}><RefreshCw size={14} className={testing ? 'spin' : ''}/>{testing ? '等待正文…' : '测试正文'}</button>}<button type="submit" className="primary"><Save size={14}/>保存配置</button></div>
  </form>;
}

export function ApiLibrary({ state, setState }) {
  const [activeApiKind, setActiveApiKind] = useState('chat');
  const [query, setQuery] = useState('');
  const [editingApi, setEditingApi] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const apiProfiles = state.apiProfiles || [];
  const mediaProfiles = state.mediaProfiles || [];
  const all = activeApiKind === 'chat' ? apiProfiles : mediaProfiles.filter(p => p.kind === activeApiKind);
  const activeId = activeApiKind === 'chat' ? state.activeApiId : activeApiKind === 'image' ? state.activeImageApiId : state.activeVideoApiId;
  const filtered = all.filter(p => `${p.name} ${p.model} ${p.endpoint}`.toLowerCase().includes(query.toLowerCase()));
  const kinds = [['chat', '对话式 API'], ['image', '图片生成 API'], ['video', '视频 API']];
  const openForm = (profile = null) => { setEditingApi(profile); setDialogOpen(true); };
  const closeForm = () => { setDialogOpen(false); setEditingApi(null); };
  const handleSave = (data) => {
    setState(s => {
      if (activeApiKind !== 'chat') return editingApi ? updateMediaProfile(s, editingApi.id, data) : addMediaProfile(s, data);
      if (editingApi) return updateApiProfile(s, editingApi.id, data);
      const next = addApiProfile(s, data.name, data.provider, data.endpoint, data.model, data.apiKey);
      const id = next.apiProfiles.at(-1).id;
      const configured = updateApiProfile(next, id, data);
      return s.activeApiId ? configured : setActiveApi(configured, id);
    });
    closeForm();
  };
  const handleActivate = id => setState(s => activeApiKind === 'chat' ? setActiveApi(s, id) : setActiveMediaApi(s, activeApiKind, id));
  const handleDelete = () => {
    setState(s => activeApiKind === 'chat' ? removeApiProfile(s, deleteTarget.id) : removeMediaProfile(s, deleteTarget.id));
    setDeleteTarget(null);
  };
  return <div className="resource-page api-library">
    <header className="api-library-header"><div><span className="eyebrow">创作设置</span><h1>API 接口</h1><p>为文本、图片和视频分别选择默认接口，所有创作工作区共用。</p></div><button className="primary" onClick={() => openForm()}><Plus size={16}/>添加接口</button></header>
    <nav className="api-library-tabs" aria-label="API 类型">{kinds.map(([kind, label]) => <button key={kind} className={activeApiKind === kind ? 'active' : ''} onClick={() => { setActiveApiKind(kind); setQuery(''); }}>{label}<span>{kind === 'chat' ? apiProfiles.length : mediaProfiles.filter(p => p.kind === kind).length}</span></button>)}</nav>
    <div className="api-list-toolbar"><span>{all.length} 个配置 · {all.find(p => p.id === activeId)?.name ? `默认：${all.find(p => p.id === activeId).name}` : '尚未设置默认接口'}</span><input aria-label="搜索接口" placeholder="搜索名称、模型或地址" value={query} onChange={e => setQuery(e.target.value)}/></div>
    <div className="api-connection-list">{filtered.map(profile => <article key={profile.id} className={`api-connection ${profile.id === activeId ? 'is-default' : ''}`}>
      <div className="api-connection-icon">{activeApiKind === 'chat' ? <Bot size={22}/> : activeApiKind === 'image' ? <ImageIcon size={22}/> : <Video size={22}/>}</div>
      <div className="api-connection-info"><h3>{profile.name}{profile.id === activeId && <span className="active-badge"><Check size={12}/>默认</span>}</h3><p className="api-model-name">{profile.model || '未填写模型'} <small>· {profile.protocol === 'responses' ? 'Responses' : profile.protocol === 'anthropic' ? 'Anthropic' : activeApiKind === 'chat' ? 'OpenAI 兼容' : activeApiKind === 'image' ? '图片生成' : '视频任务'}</small></p><p className="api-endpoint">{profile.endpoint}</p></div>
      <div className="api-connection-actions">{profile.id !== activeId && <button className="secondary" onClick={() => handleActivate(profile.id)}>设为默认</button>}<button className="secondary" onClick={() => openForm(profile)}><PenLine size={14}/>编辑{activeApiKind === 'chat' ? ' / 测试' : ''}</button><button className="ghost danger" aria-label={`删除 ${profile.name}`} onClick={() => setDeleteTarget(profile)}><Trash2 size={14}/></button></div>
    </article>)}{!filtered.length && <div className="api-empty"><KeyRound size={28}/><h3>{query ? '没有匹配的接口' : '添加你的第一个接口'}</h3><p>{query ? '尝试搜索模型名称或服务商地址。' : '准备好服务商地址、模型名称和 API Key 即可开始。'}</p>{!query && <button className="primary" onClick={() => openForm()}><Plus size={14}/>添加接口</button>}</div>}</div>
    <Dialog open={dialogOpen} title={`${editingApi ? '编辑' : '添加'}${kinds.find(k => k[0] === activeApiKind)[1]}`} onClose={closeForm}><ApiForm key={`${activeApiKind}-${editingApi?.id || 'new'}`} kind={activeApiKind} initial={editingApi || {}} onSave={handleSave} onCancel={closeForm}/></Dialog>
    <DeleteConfirm open={!!deleteTarget} title="删除 API 配置" name={deleteTarget?.name} detail="只删除此接口配置，已生成的内容仍会保留。" onCancel={() => setDeleteTarget(null)} onConfirm={handleDelete}/>
  </div>;
}

export function GlobalAI({ state, setState }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [skillId, setSkillId] = useState('');

  const activeApi = state.apiProfiles?.find((p) => p.id === state.activeApiId);
  const api = window.xingzhou || {
    aiChat: () => Promise.reject(new Error('桌面应用中才可连接 API')),
  };

  const handleSend = async () => {
    if (!prompt.trim() || loading || !activeApi) return;
    setLoading(true);
    const skill = state.skills?.find((s) => s.id === skillId);
    try {
      const res = await api.aiChat({
        ...activeApi,
        messages: [
          { role: 'system', content: `你是行舟影视 AI 助手。${skill ? `请完整遵循 Skill「${skill.name}」：\n\n${buildSkillContext(skill)}` : ''}` },
          { role: 'user', content: prompt },
        ],
      });
      setPrompt('');
      // Old GlobalAI doesn't persist, just show result inline
    } catch (e) {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  // This component is deprecated, superseded by PersistentChat
  return (
    <div className="global-ai">
      <div style={{ padding: 16 }}>
        <Bot /> <span>行舟 AI（旧版）</span>
        <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
          此组件已停用，请使用左侧「行舟 AI」按钮打开新版持久会话。
        </p>
      </div>
    </div>
  );
}

export default { BrandLogo, Dialog, SkillForm, SkillLibrary, ApiForm, ApiLibrary, GlobalAI };
