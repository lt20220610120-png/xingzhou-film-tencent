import React, { useState } from 'react';
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
import { setActiveMediaApi } from '../../core/canvasStore.js';

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
  if (!open) return null;
  return (
    <div className="veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal form-dialog">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="ghost" onClick={onClose} style={{ padding: 4 }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
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
export function ApiForm({ initial = {}, onSave, onCancel }) {
  const providerOptions = Object.values(API_PROVIDERS);
  const [provider, setProvider] = useState(initial.provider || providerOptions[0]?.type || 'custom');
  const [endpoint, setEndpoint] = useState(initial.endpoint || 'https://api.openai.com/v1');
  const [model, setModel] = useState(initial.model || 'gpt-4o-mini');
  const [apiKey, setApiKey] = useState(initial.apiKey || '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const selectedProvider = providerOptions.find((p) => p.type === provider);

  const handleProviderChange = (providerId) => {
    setProvider(providerId);
    const p = providerOptions.find((pr) => pr.type === providerId);
    if (p) {
      setEndpoint(p.defaultEndpoint || '');
      setModel(p.defaultModel || '');
    }
  };

  const handleTest = async () => {
    if (!endpoint || (selectedProvider?.requiresApiKey && !apiKey)) {
      setTestResult({ ok: false, message: selectedProvider?.requiresApiKey ? '请填写接口地址和 API Key' : '请填写接口地址' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const api = window.xingzhou || {
        testAiConnection: async (cfg) => {
          const res = await fetch(`${cfg.endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
            body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return '连接成功';
        },
      };
      const result = await api.testAiConnection({ endpoint, apiKey, model, requiresApiKey: selectedProvider?.requiresApiKey });
      setTestResult({ ok: true, message: result?.message || (typeof result === 'string' ? result : '连接成功') });
    } catch (e) {
      setTestResult({ ok: false, message: `连接失败：${e.message}` });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!provider || !endpoint.trim()) return;
    onSave({
      name: initial.name || `${selectedProvider?.name || '自定义'}-${model}`,
      provider: provider,
      endpoint: endpoint.trim(),
      model: model.trim(),
      apiKey: apiKey.trim(),
      requiresApiKey: selectedProvider?.requiresApiKey,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        供应商
        <select value={provider} onChange={(e) => handleProviderChange(e.target.value)}>
          {providerOptions.map((p) => (
            <option key={p.type} value={p.type}>{p.name}</option>
          ))}
        </select>
      </label>
      <label>
        接口地址
        <input
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </label>
      <label>
        模型
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="gpt-4o-mini"
        />
      </label>
      <label>
        API Key
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-……"
        />
      </label>

      {testResult && (
        <div style={{
          padding: '8px 12px',
          borderRadius: 6,
          marginBottom: 12,
          fontSize: 13,
          background: testResult.ok ? '#ecfdf5' : '#fef2f2',
          color: testResult.ok ? '#065f46' : '#991b1b',
        }}>
          {testResult.message}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="ghost" onClick={onCancel}>取消</button>
        <button type="button" className="secondary" onClick={handleTest} disabled={testing}>
          <RefreshCw size={14} /> {testing ? '测试中…' : '测试连接'}
        </button>
        <button type="submit" className="primary">
          <Save size={14} /> 保存
        </button>
      </div>
    </form>
  );
}

/* ================================================================
 * ApiLibrary - API 接口库管理
 * ================================================================ */
export function ApiLibrary({ state, setState }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [editingApi, setEditingApi] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeApiKind, setActiveApiKind] = useState('chat');

  const apiProfiles = state.apiProfiles || [];
  const mediaProfiles = state.mediaProfiles || [];
  const activeApiId = state.activeApiId;

  const handleSave = (data) => {
    if (editingApi) {
      setState((s) => updateApiProfile(s, editingApi.id, data));
    } else {
      setState((s) => {
        const next = addApiProfile(s, data.name, data.provider, data.endpoint, data.model, data.apiKey);
        const added = next.apiProfiles.at(-1);
        return setActiveApi({ ...next, apiProfiles: next.apiProfiles.map((item) => item.id === added.id ? { ...item, requiresApiKey: data.requiresApiKey } : item) }, added.id);
      });
    }
    setDialogOpen(false);
    setEditingApi(null);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      setState((s) => removeApiProfile(s, deleteTarget.id));
      setDeleteTarget(null);
    }
  };

  const handleActivate = (id) => {
    setState((s) => setActiveApi(s, id));
  };
  const renderMediaGroup = (kind) => {
    const items = mediaProfiles.filter((profile) => profile.kind === kind);
    const activeId = kind === 'image' ? state.activeImageApiId : state.activeVideoApiId;
    return <section className={`resource-card api-media-section ${kind}`}><header><div className="resource-icon">{kind === 'image' ? <ImageIcon /> : <Video />}</div><div><h3>{kind === 'image' ? '图片生成 API' : '视频生成 API'}</h3><p>{kind === 'image' ? '用于美术、资产与画布图片' : '用于分镜与画布视频'}</p></div></header>{items.length ? items.map((profile) => <div className="api-media-row" key={profile.id}><span><b>{profile.name}</b><small>{profile.model || profile.endpoint}</small></span>{profile.id === activeId ? <em>使用中</em> : <button className="secondary" onClick={() => setState((s) => setActiveMediaApi(s, kind, profile.id))}>启用</button>}</div>) : <small className="api-media-empty">暂未配置，可点击上方“添加生图 / 视频 API”</small>}<button className="secondary api-media-add" onClick={() => setMediaDialogOpen(true)}>管理{kind === 'image' ? '图片' : '视频'} API</button></section>;
  };

  return (
    <div className="resource-page">
      <header>
        <span className="eyebrow">工具配置 · API 接口</span>
        <h1>API 接口</h1>
        <p>统一管理语言模型和图片/视频生成 API；生图配置会同步用于画布、项目协作的美术与资产。</p>
      </header>

      <nav className="api-library-tabs" aria-label="API 类型"><button className={activeApiKind === 'chat' ? 'active' : ''} onClick={() => setActiveApiKind('chat')}>对话式 API</button><button className={activeApiKind === 'image' ? 'active' : ''} onClick={() => setActiveApiKind('image')}>图片生成 API</button><button className={activeApiKind === 'video' ? 'active' : ''} onClick={() => setActiveApiKind('video')}>视频 API</button></nav>
      <div className="resource-grid api-resource-grid">
        {activeApiKind === 'chat' && <button className="resource-card resource-add" onClick={() => { setEditingApi(null); setDialogOpen(true); }}>
          <div className="resource-icon"><Plus /></div>
          <h3>添加 API</h3>
          <p>配置新的语言模型 API</p>
        </button>}
        {activeApiKind !== 'chat' && <button className="resource-card resource-add" onClick={() => setMediaDialogOpen(true)}>
          <div className="resource-icon"><Sparkles /></div>
          <h3>添加生图 / 视频 API</h3>
          <p>供画布、项目协作美术与资产共用</p>
        </button>}

        {activeApiKind === 'chat' && apiProfiles.map((api) => (
          <article key={api.id} className={`resource-card api-card ${api.id === activeApiId ? 'active-check' : ''}`}>
            <h3>{api.name}</h3>
            <p>{api.provider} · {api.model}</p>
            <p className="api-endpoint">{api.endpoint}</p>
            <div className="card-tools">
              {api.id === activeApiId ? (
                <span className="active-badge"><Check size={12} /> 当前使用</span>
              ) : (
                <button className="secondary" onClick={() => handleActivate(api.id)}>
                  <Check size={14} /> 启用
                </button>
              )}
              <button className="secondary" onClick={() => { setEditingApi(api); setDialogOpen(true); }}>
                <PenLine size={14} /> 编辑
              </button>
              <button className="card-delete" onClick={() => setDeleteTarget(api)}>
                <Trash2 size={14} /> 删除
              </button>
            </div>
          </article>
        ))}
        {activeApiKind === 'image' && renderMediaGroup('image')}
        {activeApiKind === 'video' && renderMediaGroup('video')}
      </div>

      {/* API 编辑/创建对话框 */}
      <Dialog open={dialogOpen} title={editingApi ? '编辑 API 配置' : '添加 API 配置'} onClose={() => { setDialogOpen(false); setEditingApi(null); }}>
        <ApiForm
          initial={editingApi || {}}
          onSave={handleSave}
          onCancel={() => { setDialogOpen(false); setEditingApi(null); }}
        />
      </Dialog>
      {mediaDialogOpen && <MediaApiSettings state={state} setState={setState} onClose={() => setMediaDialogOpen(false)} />}

      {/* 删除确认 */}
      <DeleteConfirm
        open={!!deleteTarget}
        title="删除 API 配置"
        name={deleteTarget?.name}
        detail="删除此 API 配置后，使用它的对话不会受影响，但需要换用其他 API。"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

/* ================================================================
 * GlobalAI - 旧版全局 AI 助手（保留兼容）
 * ================================================================ */
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
