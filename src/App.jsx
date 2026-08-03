import React, { useState, useEffect } from 'react';
import {
  Film, BookOpen, Library, Settings, Sparkles, KeyRound,
  FileText, Bot, Plus, X, Star, Trash2, Save, Upload, Download,
  Video, PenLine, MessageSquare, HardDrive, UserRound,
  RefreshCw, FolderOpen, Check, ArrowLeft, AlertCircle
} from 'lucide-react';
import { API_PROVIDERS } from '../core/apiProviders.js';
import {
  addEpisode, addScriptEpisode, archiveScript, buildAiContext,
  cleanupChatSessions, createInitialState, createProject, createScriptProject,
  createProjectGroup, renameProjectGroup, deleteProjectGroup, organizeProject,
  deleteFruitProject, deleteScriptProject, deleteScriptLibraryItem,
  normalizeState,
  setRating, updateEpisode, updateScriptEpisode,
  updateScriptProject,
} from '../core/projectStore.js';
import { resolveUpdateState, interpretUpdateResult } from '../core/appServices.js';
import { GlobalAI, SkillLibrary, ApiLibrary, BrandLogo } from './v06/GlobalTools.jsx';
import { DirectorWorkspace } from './v06/DirectorWorkspace.jsx';
import { ProjectCardHub } from './v06/ProjectCardHub.jsx';
import { DeleteConfirm } from './v06/DeleteConfirm.jsx';
import { PersistentChat } from './v06/PersistentChat.jsx';
import { splitFullScript } from '../core/scriptImport.js';
import { buildSkillManifest } from '../core/skillContext.js';
import { executeSkillWithAi, createSkillExecution } from '../core/skillExecution.js';

// ========== 常量 ==========
const STORAGE = 'xingzhou-film-v1';
const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/lt20220610120-png/xingzhou-film-updates/main/latest.json';

// API 对象：Electron 环境用 window.xingzhou，浏览器 fallback
const api = window.xingzhou || {
  saveTxt: ({ name, content }) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    a.download = name + '.txt';
    a.click();
    return Promise.resolve(name);
  },
  aiChat: () => Promise.reject(new Error('桌面应用中才可连接 API')),
  testAiConnection: () => Promise.reject(new Error('桌面应用中才可连接 API')),
  storageInfo: () => Promise.resolve({ dataDir: '浏览器本地存储', dataFile: 'localStorage', engine: '浏览器' }),
  loadState: () => Promise.resolve(null),
  saveState: () => Promise.resolve(),
  selectDataDir: () => Promise.resolve(null),
  openDataDir: () => Promise.resolve(),
  appVersion: () => Promise.resolve('0.3.0'),
  checkUpdate: () => Promise.resolve({ configured: false, currentVersion: '0.3.0' }),
  openExternal: (url) => window.open(url),
  importFullScript: () => Promise.resolve(null),
  downloadUpdate: () => Promise.reject(new Error('桌面应用中才可下载更新')),
  installUpdate: () => Promise.resolve(),
  onUpdateProgress: () => () => {},
};

const createFruitEpisodeData = (index = 0) => ({
  title: `第${index + 1}集`,
  inputType: 'text',
  fileName: '',
  rawText: '',
  scriptText: '',
  selectedSkill: '',
  status: '草稿',
});

const createScriptEpisodeData = (index = 0) => ({
  title: `第${index + 1}集`,
  content: '',
  selectedSkill: '',
  result: '',
  status: '草稿',
});

const buildFruitMasterScript = (project) => (project.episodes || [])
  .map((ep, i) => `【${ep.title || `第${i + 1}集`}】\n${ep.scriptText || ep.rawText || ''}`)
  .join('\n\n---\n\n');

const buildScriptMasterScript = (project) => (project.episodes || [])
  .map((ep, i) => `【${ep.title || `第${i + 1}集`}】\n${ep.result || ep.content || ''}`)
  .join('\n\n---\n\n');

/* ================================================================
 * Modal - 通用模态框（输入型）
 * ================================================================ */
function Modal({ title, placeholder, onClose, onSubmit }) {
  const [value, setValue] = useState('');
  return (
    <div className="veil">
      <form className="modal" onSubmit={(e) => { e.preventDefault(); value.trim() && onSubmit(value.trim()); }}>
        <h2>{title}</h2>
        <p>起一个容易识别的名字，之后还可以继续编辑。</p>
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>取消</button>
          <button className="primary">创建项目</button>
        </div>
      </form>
    </div>
  );
}

/* ================================================================
 * Empty - 空状态提示
 * ================================================================ */
function Empty({ icon: Icon, title, text, action, label }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon /></div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action && (
        <button className="primary" onClick={action}><Plus size={17} /> {label}</button>
      )}
    </div>
  );
}

/* ================================================================
 * Stars - 星级评分
 * ================================================================ */
function Stars({ value, onChange }) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n === value ? 0 : n)}>
          <Star size={20} fill={n <= value ? '#d9b468' : 'none'} color={n <= value ? '#d9b468' : '#ccc'} />
        </button>
      ))}
    </div>
  );
}

/* ================================================================
 * ProjectPicker - 项目选择器（旧版，保留兼容）
 * ================================================================ */
function ProjectPicker({ projects, active, onSelect, onAdd, onBack, kind }) {
  return (
    <aside className="director-rail">
      <button onClick={onBack}><ArrowLeft size={16} /> 返回</button>
      <h2>项目列表</h2>
      <div className="rail-label">总剧本</div>
      <button className={active === 'master' ? 'active' : ''} onClick={() => onSelect('master')}>
        <FileText size={17} /><span>总剧本编辑</span>
      </button>
      <div className="rail-label">分集</div>
      {projects.map((ep, i) => (
        <button key={ep.id} className={active === ep.id ? 'active' : ''} onClick={() => onSelect(ep.id)}>
          <span className="rail-index">{String(i + 1).padStart(2, '0')}</span>
          <span>{ep.title}<small>{ep.status || '草稿'}</small></span>
        </button>
      ))}
      <button className="add-episode" onClick={onAdd}><Plus size={16} /> 添加集数</button>
    </aside>
  );
}

/* ================================================================
 * EpisodeRail - 分集导航（果子/剧本共用）
 * ================================================================ */
function EpisodeRail({ project, active, onSelect, onAdd, onBack, kind }) {
  return (
    <aside className="director-rail">
      <button onClick={onBack}><ArrowLeft size={16} /> 所有{kind}项目</button>
      <h2>{project.name}</h2>
      <div className="rail-label">总剧本</div>
      <button className={active === 'master' ? 'active' : ''} onClick={() => onSelect('master')}>
        <FileText size={17} /><span>总剧本编辑</span>
      </button>
      <div className="rail-label">分集</div>
      {project.episodes.map((ep, i) => (
        <button key={ep.id} className={active === ep.id ? 'active' : ''} onClick={() => onSelect(ep.id)}>
          <span className="rail-index">{String(i + 1).padStart(2, '0')}</span>
          <span>{ep.title}<small>{ep.status || '草稿'}</small></span>
        </button>
      ))}
      <button className="add-episode" onClick={onAdd}><Plus size={16} /> 添加集数</button>
    </aside>
  );
}

/* ================================================================
 * SkillRunner - Skill 运行器
 * ================================================================ */
function SkillRunner({ skills, state, api, value, onSelect, input, title, onResult }) {
  const selectedSkill = skills.find((s) => s.name === value);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    if (!selectedSkill || running || !input?.trim()) return;
    setRunning(true);
    setError('');
    try {
      onResult(await executeSkillWithAi({ api, state, skillId: selectedSkill.id, input, assistantRole: '行舟影视剧本创作助手' }));
    } catch (reason) {
      setError(reason.message || 'Skill 运行失败');
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="skill-runner">
      <div>
        <Sparkles size={17} />
        <label>选择 Skill</label>
        <select value={value} onChange={(e) => onSelect(e.target.value)}>
          {skills.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
        <button className="skill-library" title="Skill 库">
          <FolderOpen size={15} /> Skill 库
        </button>
        {selectedSkill && <small className="skill-file-count">完整 Skill · {buildSkillManifest(selectedSkill).totalFiles} 个文件已附上</small>}
      </div>
      <button
        className="primary"
        onClick={run}
        disabled={!input?.trim() || !selectedSkill || running}
      >
        <Sparkles size={16} /> {running ? '运行中…' : '运行转换'}
      </button>
      {error && <small className="skill-run-error">{error}</small>}
    </div>
  );
}

/* ================================================================
 * AiDrawer - AI 创作助手抽屉
 * ================================================================ */
function AiDrawer({ open, onClose, project, episodeId, kind, onApply, state, skills }) {
  const activeApiProfile = state.apiProfiles?.find((p) => p.id === state.activeApiId)
    || state.apiProfiles?.[0]
    || { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' };
  const [config, setConfig] = useState(activeApiProfile);
  const [scope, setScope] = useState('episode'); // 'project' | 'episode' | 'range' | 'multi'
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [multiSelected, setMultiSelected] = useState([]); // 多选集的索引数组
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // 读取上次使用的 Skill
  const [selectedSkillId, setSelectedSkillId] = useState(() => {
    try { return localStorage.getItem('xz-last-used-skill') || ''; }
    catch { return ''; }
  });

  // 构建上下文（支持 episodeIds）
  const buildContext = () => {
    if (!project) return '';
    if (scope === 'range') {
      const eps = project.episodes.slice(rangeStart, rangeEnd + 1);
      return `项目：《${project.name}》\n范围：第${rangeStart + 1}集 ~ 第${rangeEnd + 1}集\n内容：\n` +
        eps.map((e) => `【${e.title}】\n${kind === 'fruit' ? (e.scriptText || e.rawText) : (e.result || e.content)}`).join('\n---\n');
    }
    if (scope === 'multi' && multiSelected.length > 0) {
      const eps = multiSelected.map((i) => project.episodes[i]).filter(Boolean);
      return `项目：《${project.name}》\n选中集数：${eps.map((e) => e.title).join('、')}\n内容：\n` +
        eps.map((e) => `【${e.title}】\n${kind === 'fruit' ? (e.scriptText || e.rawText) : (e.result || e.content)}`).join('\n---\n');
    }
    if (scope === 'episode' && episodeId) {
      const ep = project.episodes.find((e) => e.id === episodeId);
      if (ep) {
        return `项目：《${project.name}》\n分集：${ep.title}\n${kind === 'fruit' ? (ep.scriptText || ep.rawText) : (ep.result || ep.content)}`;
      }
    }
    // 整个项目
    return `项目：《${project.name}》\n${project.masterScript || project.episodes.map((e) => `${e.title}: ${kind === 'fruit' ? (e.scriptText || e.rawText) : (e.result || e.content)}`).join('\n')}`;
  };

  const handleSend = async () => {
    if (!prompt.trim()) return;
    if (!config.apiKey) { setResult('请先填写 API Key。'); return; }
    setLoading(true);
    try {
      const context = buildContext();
      const skill = skills?.find((s) => s.id === selectedSkillId);
      const userContent = `【附件】\n${context}\n\n【修改指令】\n${prompt}\n\n严格根据附件内容和用户指令修改，输出可以直接进入剧本编辑器的中文正文。`;
      const res = skill
        ? (await createSkillExecution({ api, state, skillId: skill.id, input: userContent, assistantRole: '行舟影视专业剧本创作助手', profile: config })).output
        : await api.aiChat({ ...config, messages: [{ role: 'system', content: '你是行舟影视的专业剧本创作助手。' }, { role: 'user', content: userContent }] });
      setResult(res);
    } catch (e) {
      setResult(`连接失败：${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = (patch) => {
    setConfig((current) => ({ ...current, ...patch }));
  };

  const toggleMultiSelect = (idx) => {
    setMultiSelected((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx].sort((a, b) => a - b)
    );
  };

  const getAttachmentLabel = () => {
    if (scope === 'multi' && multiSelected.length > 0) {
      return project?.episodes?.filter((_, i) => multiSelected.includes(i)).map((e) => e.title).join('、');
    }
    if (scope === 'range') {
      return `第${rangeStart + 1}-${rangeEnd + 1}集`;
    }
    if (scope === 'episode') {
      return project?.episodes?.find((e) => e.id === episodeId)?.title || '当前集';
    }
    return '总剧本';
  };

  if (!open) return null;

  return (
    <div className="drawer-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="ai-drawer">
        <header>
          <div>
            <Bot size={18} />
            <span>
              AI 创作助手
              <small>附上项目内容，与大语言模型一起修改</small>
            </span>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </header>

        {/* Skill 选择器 */}
        {skills && skills.length > 0 && (
          <div className="ai-drawer-skill">
            <Sparkles size={15} />
            <select
              value={selectedSkillId}
              onChange={(e) => {
                setSelectedSkillId(e.target.value);
                if (e.target.value) localStorage.setItem('xz-last-used-skill', e.target.value);
              }}
            >
              <option value="">不使用 Skill</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {selectedSkillId && <small className="skill-file-count">完整 Skill · {buildSkillManifest(skills.find((s) => s.id === selectedSkillId)).totalFiles} 个文件已附上</small>}
          </div>
        )}

        <div className="scope-tabs">
          <button className={scope === 'project' ? 'active' : ''} onClick={() => setScope('project')}>整个项目</button>
          <button className={scope === 'episode' ? 'active' : ''} disabled={!episodeId} onClick={() => setScope('episode')}>当前集</button>
          <button className={scope === 'range' ? 'active' : ''} disabled={!project?.episodes || project.episodes.length < 2} onClick={() => setScope('range')}>自选范围</button>
          <button className={scope === 'multi' ? 'active' : ''} disabled={!project?.episodes || project.episodes.length < 2} onClick={() => setScope('multi')}>多集勾选</button>
        </div>

        {/* 范围选择器 */}
        {scope === 'range' && (
          <div className="range-picker">
            <label>从 <select value={rangeStart} onChange={(e) => { const v = parseInt(e.target.value); setRangeStart(v); if (v > rangeEnd) setRangeEnd(v); }}>
              {project?.episodes?.map((ep, i) => <option key={i} value={i}>第{i + 1}集</option>)}
            </select></label>
            <label>到 <select value={rangeEnd} onChange={(e) => { const v = parseInt(e.target.value); setRangeEnd(v); if (v < rangeStart) setRangeStart(v); }}>
              {project?.episodes?.map((ep, i) => <option key={i} value={i}>第{i + 1}集</option>)}
            </select></label>
          </div>
        )}

        {/* 多集勾选 */}
        {scope === 'multi' && (
          <div className="multi-episode-picker">
            <small>勾选要选中的集数（已选 {multiSelected.length} 集）</small>
            <div className="multi-episode-list">
              {project?.episodes?.map((ep, i) => (
                <label key={i} className={`multi-episode-item ${multiSelected.includes(i) ? 'checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={multiSelected.includes(i)}
                    onChange={() => toggleMultiSelect(i)}
                  />
                  <span className="ep-num">第{i + 1}集</span>
                  <span className="ep-title">{ep.title}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="attached">
          <PaperclipIcon />
          <div>
            <small>已附上</small>
            <strong>《{project?.name}》 · {getAttachmentLabel()}</strong>
          </div>
        </div>

        <label className="ai-prompt">
          修改指令
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="例如：把第三场的冲突提前，增强主角第一次反击的爽感……" />
        </label>

        <button className="primary send" onClick={handleSend} disabled={loading}>
          {loading ? '正在创作…' : '发送给 AI'}
        </button>

        {result && (
          <div className="ai-answer">
            <div className="answer-head">AI 返回内容</div>
            <textarea value={result} onChange={(e) => setResult(e.target.value)} />
            <button className="secondary" onClick={() => onApply(result, scope)}>
              <Save size={15} /> 应用到{scope === 'episode' ? '当前集' : scope === 'multi' ? '选中集' : scope === 'range' ? '范围' : '总剧本'}
            </button>
          </div>
        )}

        <button className="config-toggle" onClick={() => setShowConfig(!showConfig)}>
          <Settings size={15} /> API 设置
        </button>

        {showConfig && (
          <div className="api-settings">
            <label>接口地址 <input value={config.endpoint} onChange={(e) => updateConfig({ endpoint: e.target.value })} /></label>
            <label>模型 <input value={config.model} onChange={(e) => updateConfig({ model: e.target.value })} /></label>
            <label>API Key <input type="password" value={config.apiKey} onChange={(e) => updateConfig({ apiKey: e.target.value })} /></label>
            <p>支持 OpenAI 兼容的 Chat Completions 接口。</p>
          </div>
        )}
      </aside>
    </div>
  );
}

// 小型 Paperclip 图标组件（避免额外导入）
function PaperclipIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" />
    </svg>
  );
}

/* ================================================================
 * FruitEpisodeEditor - 果子库单集编辑
 * ================================================================ */
function FruitEpisodeEditor({ project, episode, setState, skills, state, api }) {
  const update = (patch) => setState((s) => updateEpisode(s, project.id, episode.id, patch));

  const handleFileUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (type === 'document' && /\.(txt|md|text)$/i.test(file.name)) {
      const text = await file.text();
      update({ inputType: type, fileName: file.name, rawText: text, status: '已导入' });
    } else if (type === 'video') {
      update({ inputType: type, fileName: file.name, status: '等待视频转录' });
    }
  };

  return (
    <main className="focus-editor">
      <header className="editor-head">
        <div>
          <span className="eyebrow">市场果子 · 单集编辑</span>
          <input value={episode.title} onChange={(e) => update({ title: e.target.value })} />
        </div>
        <button className="secondary" onClick={() => api.saveTxt({ name: `${project.name}-${episode.title}`, content: episode.scriptText || episode.rawText })}>
          <Download size={16} /> 导出本集
        </button>
      </header>

      <div className="source-tabs large">
        <label className={episode.inputType === 'video' ? 'chosen' : ''}>
          <Video size={17} /> 视频上传
          <input type="file" accept="video/*" onChange={(e) => handleFileUpload(e, 'video')} hidden />
        </label>
        <label className={episode.inputType === 'document' ? 'chosen' : ''}>
          <Upload size={17} /> 文档上传
          <input type="file" accept=".txt,.md,.text,.doc,.docx" onChange={(e) => handleFileUpload(e, 'document')} hidden />
        </label>
        <button className={episode.inputType === 'text' ? 'chosen' : ''} onClick={() => update({ inputType: 'text' })}>
          <PenLine size={17} /> 直接输入
        </button>
        {episode.fileName && <span className="filename"><PaperclipIcon /> {episode.fileName}</span>}
      </div>

      <section className="single-stage">
        <label>
          <span>原始内容 / 沉浸式对话</span>
          <textarea
            className="big-editor"
            value={episode.rawText || ''}
            onChange={(e) => update({ rawText: e.target.value, status: '草稿' })}
            placeholder="粘贴或输入人物对话、场景信息……"
          />
        </label>

        <SkillRunner
          skills={skills}
          state={state}
          api={api}
          value={episode.selectedSkill || skills[0]?.name || '情景转换成剧本'}
          onSelect={(v) => update({ selectedSkill: v })}
          input={episode.rawText}
          title={episode.title}
          onResult={(output) => update({ scriptText: output.output, status: '已转换' })}
        />

        {episode.scriptText !== '' && (
          <div className="result-stage">
            <div className="result-title">
              <div>
                <Sparkles size={17} />
                <span>转换结果</span>
                <small>由 {episode.selectedSkill} 生成，可继续手动修改</small>
              </div>
              <span className="status done">已生成</span>
            </div>
            <textarea
              className="big-editor result"
              value={episode.scriptText}
              onChange={(e) => update({ scriptText: e.target.value, status: '已修改' })}
            />
            <div className="save-row">
              <span>修改会自动保存在本机</span>
              <button className="primary" onClick={() => update({ status: '已保存' })}>
                <Save size={16} /> 保存本集
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

/* ================================================================
 * MasterEditor - 总剧本编辑器
 * ================================================================ */
function MasterEditor({ project, kind, onChange }) {
  const content = kind === 'fruit'
    ? (project.masterScript || buildFruitMasterScript(project))
    : (project.finalScript || buildScriptMasterScript(project));

  return (
    <main className="focus-editor">
      <header className="editor-head">
        <div>
          <span className="eyebrow">{kind === 'fruit' ? '果子项目' : '创作项目'} · 总剧本</span>
          <h1>《{project.name}》总剧本</h1>
        </div>
        <button className="secondary" onClick={() => api.saveTxt({ name: `${project.name}-总剧本`, content })}>
          <Download size={16} /> 导出总剧本
        </button>
      </header>
      <section className="master-stage">
        <div className="master-note">
          各集内容已按左侧顺序汇总。你可以在这里统一校对和修改；如果不手动修改，将自动采用各集最新内容。
        </div>
        <textarea className="master-editor" value={content} onChange={(e) => onChange(e.target.value)} />
      </section>
    </main>
  );
}

/* ================================================================
 * ScriptEpisodeEditor - 剧本单集编辑
 * ================================================================ */
function ScriptEpisodeEditor({ project, episode, setState, skills, state, api }) {
  const update = (patch) => setState((s) => updateScriptEpisode(s, project.id, episode.id, patch));

  return (
    <main className="focus-editor">
      <header className="editor-head">
        <div>
          <span className="eyebrow">{project.mode === 'rewrite' ? '洗稿' : '原创'} · 单集创作</span>
          <input value={episode.title} onChange={(e) => update({ title: e.target.value })} />
        </div>
        <button className="secondary" onClick={() => api.saveTxt({ name: `${project.name}-${episode.title}`, content: episode.result || episode.content })}>
          <Download size={16} /> 导出本集
        </button>
      </header>

      <section className="single-stage">
        <label>
          <span>本集故事内容</span>
          <textarea
            className="big-editor"
            value={episode.content || ''}
            onChange={(e) => update({ content: e.target.value, status: '草稿' })}
            placeholder="专注编写这一集的剧情、对白和场景……"
          />
        </label>

        <SkillRunner
          skills={skills}
          state={state}
          api={api}
          value={episode.selectedSkill || '转换成剧本格式'}
          onSelect={(v) => update({ selectedSkill: v })}
          input={episode.content}
          title={episode.title}
          onResult={(output) => update({ result: output.output, status: '已转换' })}
        />

        {episode.result !== '' && (
          <div className="result-stage">
            <div className="result-title">
              <div>
                <Sparkles size={17} />
                <span>剧本格式结果</span>
                <small>转换完成后在这里手动修改</small>
              </div>
            </div>
            <textarea
              className="big-editor result"
              value={episode.result}
              onChange={(e) => update({ result: e.target.value, status: '已修改' })}
            />
            <div className="save-row">
              <span>修改会自动保存</span>
              <button className="primary" onClick={() => update({ status: '已保存' })}>
                <Save size={16} /> 保存本集
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

/* ================================================================
 * FruitLibrary - 果子库页面
 * ================================================================ */
function FruitLibrary({ state, setState, api }) {
  const [selectedId, setSelectedId] = useState(null);
  const [activePane, setActivePane] = useState('master');
  const [showCreate, setShowCreate] = useState(false);
  const [showAiDrawer, setShowAiDrawer] = useState(false);

  const project = state.fruitProjects?.find((p) => p.id === selectedId);
  const episode = project?.episodes?.find((ep) => ep.id === activePane);

  const handleCreate = (name) => {
    const created = createProject(state, name);
    const id = created.fruitProjects.at(-1).id;
    const next = addEpisode(created, id, createFruitEpisodeData(0));
    setState(next);
    setSelectedId(id);
    setActivePane(next.fruitProjects.find((p) => p.id === id).episodes[0].id);
    setShowCreate(false);
  };

  const handleOpen = (id) => { setSelectedId(id); const p = state.fruitProjects.find((pr) => pr.id === id); setActivePane(p?.episodes[0]?.id || 'master'); };

  const handleAddEpisode = () => {
    if (!project) return;
    setState((s) => {
      const next = addEpisode(s, project.id, createFruitEpisodeData(project.episodes.length));
      const updated = next.fruitProjects.find((p) => p.id === project.id);
      setActivePane(updated.episodes.at(-1).id);
      return next;
    });
  };

  const handleImportScript = async () => {
    if (!api.importFullScript || !project) return;
    const result = await api.importFullScript();
    if (!result) return;
    const parsed = splitFullScript(result.content);

    if (project.episodes.some((e) => e.rawText || e.scriptText) && !confirm(`导入将替换《${project.name}》现有分集，确定继续吗？`)) return;

    const episodes = parsed.episodes.map((ep, i) => ({
      id: `import-${Date.now()}-${i}`,
      title: ep.title,
      inputType: 'document',
      fileName: result.fileName,
      rawText: ep.content,
      scriptText: ep.content,
      selectedSkill: '情景转换成剧本',
      status: '完整剧本已导入',
    }));

    setState((s) => ({
      ...s,
      fruitProjects: s.fruitProjects.map((p) => p.id === project.id ? {
        ...p,
        masterScript: parsed.masterScript,
        episodes,
        importedFile: result.fileName,
      } : p),
    }));
    setActivePane(episodes[0]?.id || 'master');
    alert(parsed.detected ? `已识别并导入 ${episodes.length} 集。` : '未识别到明确分集标题，已作为第 1 集完整导入。');
  };

  const handleAiApply = (content, scope) => {
    if (scope === 'range') {
      const updatedEps = project.episodes.map((ep, i) => ({ ...ep }));
      setState((s) => ({
        ...s,
        fruitProjects: s.fruitProjects.map((p) => p.id === project.id ? { ...p, episodes: updatedEps } : p),
      }));
    } else {
      setState((s) =>
        scope === 'episode' && episode
          ? updateEpisode(s, project.id, episode.id, { scriptText: content, status: 'AI 已修改' })
          : { ...s, fruitProjects: s.fruitProjects.map((p) => p.id === project.id ? { ...p, masterScript: content } : p) }
      );
    }
  };

  if (!project) {
    return (
      <>
        <ProjectCardHub
          title="果子库"
          subtitle="收集市场上已经验证的完整剧本，按项目卡片进入继续整理。"
          projects={state.fruitProjects || []}
          groups={state.fruitGroups || []}
          kind="fruit"
          onCreate={() => setShowCreate(true)}
          onOpen={handleOpen}
          onRename={(id, name) => setState((s) => organizeProject(s, 'fruit', id, { name }))}
          onMoveToGroup={(id, groupId) => setState((s) => organizeProject(s, 'fruit', id, { groupId }))}
          onCreateGroup={(name) => setState((s) => createProjectGroup(s, 'fruit', name))}
          onRenameGroup={(id, name) => setState((s) => renameProjectGroup(s, 'fruit', id, name))}
          onDeleteGroup={(id) => setState((s) => deleteProjectGroup(s, 'fruit', id))}
          onDelete={(id) => setState((s) => deleteFruitProject(s, id))}
        />
        {showCreate && <Modal title="新建果子项目" placeholder="例如：剑破长空" onClose={() => setShowCreate(false)} onSubmit={handleCreate} />}
      </>
    );
  }

  return (
    <div className="project-shell">
      <EpisodeRail project={project} active={activePane} onSelect={setActivePane} onAdd={handleAddEpisode} onBack={() => setSelectedId(null)} kind="果子" />

      <section className="project-main">
        <div className="project-toolbar">
          <div>
            <h2>{project.name}</h2>
            <div className="rating">
              <Stars value={project.rating} onChange={(v) => setState((s) => setRating(s, project.id, v))} />
              <small>{project.rating || '未'}星</small>
            </div>
          </div>
          <div>
            <button className="secondary import-button" onClick={handleImportScript}><Upload size={17} /> 导入完整剧本</button>
            <button className="secondary ai-button" onClick={() => setShowAiDrawer(true)}><MessageSquare size={17} /> AI 创作助手</button>
            <button className="ghost danger" onClick={() => { confirm('确定删除？') && (setState((s) => deleteFruitProject(s, project.id)), setSelectedId(null)); }}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {activePane === 'master' ? (
          <MasterEditor project={project} kind="fruit" onChange={(v) => setState((s) => ({ ...s, fruitProjects: s.fruitProjects.map((p) => p.id === project.id ? { ...p, masterScript: v } : p) }))} />
        ) : episode ? (
          <FruitEpisodeEditor project={project} episode={episode} setState={setState} skills={state.skills || []} state={state} api={api} />
        ) : null}
      </section>

      <AiDrawer open={showAiDrawer} onClose={() => setShowAiDrawer(false)} project={project} episodeId={episode?.id} kind="fruit" onApply={handleAiApply} state={state} skills={state.skills || []} />
    </div>
  );
}

/* ================================================================
 * ScriptStudio - 创作剧本首页（项目卡片网格）
 * ================================================================ */
function ScriptStudio({ state, setState, api }) {
  const [mode, setMode] = useState('rewrite');
  const [selectedId, setSelectedId] = useState(null);
  const [activePane, setActivePane] = useState('master');
  const [showCreate, setShowCreate] = useState(false);
  const [showAiDrawer, setShowAiDrawer] = useState(false);

  const filteredProjects = (state.scriptProjects || []).filter((p) => p.mode === mode);
  const project = state.scriptProjects?.find((p) => p.id === selectedId && p.mode === mode);
  const episode = project?.episodes?.find((ep) => ep.id === activePane);

  const handleCreate = (name) => {
    const created = createScriptProject(state, name, mode);
    const id = created.scriptProjects.at(-1).id;
    const next = addScriptEpisode(created, id, createScriptEpisodeData(0));
    setState(next);
    setSelectedId(id);
    setActivePane(next.scriptProjects.find((p) => p.id === id).episodes[0].id);
    setShowCreate(false);
  };

  const handleOpen = (id) => { setSelectedId(id); const p = state.scriptProjects.find((pr) => pr.id === id); setActivePane(p?.episodes[0]?.id || 'master'); };

  const handleAddEpisode = () => {
    if (!project) return;
    setState((s) => {
      const next = addScriptEpisode(s, project.id, createScriptEpisodeData(project.episodes.length));
      const updated = next.scriptProjects.find((p) => p.id === project.id);
      setActivePane(updated.episodes.at(-1).id);
      return next;
    });
  };

  const handleArchive = () => {
    const content = project.finalScript || buildScriptMasterScript(project);
    setState((s) => archiveScript(s, project.name, project.mode, content));
  };

  const handleAiApply = (content, scope) => {
    if (scope === 'range') {
      const updatedEps = project.episodes.map((ep, i) => ({ ...ep }));
      setState((s) => ({
        ...s,
        scriptProjects: s.scriptProjects.map((p) => p.id === project.id ? { ...p, episodes: updatedEps } : p),
      }));
    } else {
      setState((s) =>
        scope === 'episode' && episode
          ? updateScriptEpisode(s, project.id, episode.id, { content: scope === 'project' ? undefined : undefined, result: content, status: 'AI 已修改' })
          : updateScriptProject(s, project.id, { finalScript: content })
      );
    }
  };

  if (!project) {
    return (
      <>
        <div className="script-card-header">
          <div className="seg">
            <button className={mode === 'rewrite' ? 'active' : ''} onClick={() => setMode('rewrite')}>洗稿</button>
            <button className={mode === 'original' ? 'active' : ''} onClick={() => setMode('original')}>原创</button>
          </div>
        </div>
        <ProjectCardHub
          title={mode === 'rewrite' ? '洗稿项目' : '原创项目'}
          subtitle="创建并管理剧本项目，按项目卡片进入继续创作。"
          projects={filteredProjects}
          groups={state.scriptGroups || []}
          kind="script"
          onCreate={() => setShowCreate(true)}
          onOpen={handleOpen}
          onRename={(id, name) => setState((s) => organizeProject(s, 'script', id, { name }))}
          onMoveToGroup={(id, groupId) => setState((s) => organizeProject(s, 'script', id, { groupId }))}
          onCreateGroup={(name) => setState((s) => createProjectGroup(s, 'script', name))}
          onRenameGroup={(id, name) => setState((s) => renameProjectGroup(s, 'script', id, name))}
          onDeleteGroup={(id) => setState((s) => deleteProjectGroup(s, 'script', id))}
          onDelete={(id) => setState((s) => deleteScriptProject(s, id))}
        />
        {showCreate && <Modal title={`新建${mode === 'rewrite' ? '洗稿' : '原创'}项目`} placeholder="请输入剧本名称" onClose={() => setShowCreate(false)} onSubmit={handleCreate} />}
      </>
    );
  }

  return (
    <div className="project-shell">
      <EpisodeRail project={project} active={activePane} onSelect={setActivePane} onAdd={handleAddEpisode} onBack={() => { setSelectedId(null); setActivePane('master'); }} kind={mode === 'rewrite' ? '洗稿' : '原创'} />

      <section className="project-main">
        <div className="project-toolbar">
          <div>
            <h2>{project.name}</h2>
            <div className="seg compact">
              <button className={mode === 'rewrite' ? 'active' : ''} onClick={() => setMode('rewrite')}>洗稿</button>
              <button className={mode === 'original' ? 'active' : ''} onClick={() => setMode('original')}>原创</button>
            </div>
          </div>
          <div>
            <button className="secondary ai-button" onClick={() => setShowAiDrawer(true)}><MessageSquare size={17} /> AI 创作助手</button>
            <button className="primary" onClick={handleArchive}><Save size={16} /> 收录剧本库</button>
          </div>
        </div>

        {mode === 'rewrite' && (
          <div className="project-attachments">
            <span>果子库附件</span>
            {(state.fruitProjects || []).map((fp) => (
              <button key={fp.id} className={project.attachments?.includes(fp.id) ? 'selected' : ''} onClick={() => setState((s) => updateScriptProject(s, project.id, {
                attachments: project.attachments?.includes(fp.id)
                  ? project.attachments.filter((id) => id !== fp.id)
                  : [...(project.attachments || []), fp.id],
              }))}>
                <PaperclipIcon /> {fp.name}
              </button>
            ))}
          </div>
        )}

        {activePane === 'master' ? (
          <MasterEditor project={project} kind="script" onChange={(v) => setState((s) => updateScriptProject(s, project.id, { finalScript: v }))} />
        ) : episode ? (
          <ScriptEpisodeEditor project={project} episode={episode} setState={setState} skills={state.skills || []} state={state} api={api} />
        ) : null}
      </section>

      <AiDrawer open={showAiDrawer} onClose={() => setShowAiDrawer(false)} project={project} episodeId={episode?.id} kind="script" onApply={handleAiApply} state={state} skills={state.skills || []} />
    </div>
  );
}

/* ================================================================
 * ScriptLibrary - 剧本库
 * ================================================================ */
function ScriptLibrary({ state, setState }) {
  const [deleteTarget, setDeleteTarget] = useState(null);

  return (
    <div className="library-page">
      <header>
        <span className="eyebrow">原创资产 · 剧本库</span>
        <h1>完成的创作剧本</h1>
        <p>这里与果子库分开保存，只收录你创作或改编完成的剧本。</p>
      </header>

      {state.scriptLibrary?.length ? (
        <div className="library-grid">
          {state.scriptLibrary.map((item) => (
            <article key={item.id}>
              <FileText />
              <span>{item.sourceMode === 'rewrite' ? '洗稿创作' : '原创创作'}</span>
              <h3>{item.name}</h3>
              <p>{item.content?.slice(0, 100)}</p>
              <div className="library-actions">
                <button className="secondary" onClick={() => api.saveTxt({ name: item.name, content: item.content })}>
                  <Download size={16} /> 下载 TXT
                </button>
                <button className="card-delete" onClick={() => setDeleteTarget(item)}>
                  <Trash2 size={16} /> 删除
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={BookOpen} title="剧本库还没有作品" text="在创作项目中完成转换并收录后，作品会出现在这里。" />
      )}

      <DeleteConfirm
        open={!!deleteTarget}
        title="删除剧本库作品"
        name={deleteTarget?.name}
        detail="只删除剧本库中的这份作品，不影响原创作项目。"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => { setState((s) => deleteScriptLibraryItem(s, deleteTarget.id)); setDeleteTarget(null); }}
      />
    </div>
  );
}

/* ================================================================
 * SettingsPage - 设置页
 * ================================================================ */
function SettingsPage({ state, setState }) {
  const [storageInfo, setStorageInfo] = useState(null);
  const [appVersion, setAppVersion] = useState('0.9.7');
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateStatus, setUpdateStatus] = useState('正在自动检查更新…');
  const [updatePhase, setUpdatePhase] = useState('idle');
  const [progress, setProgress] = useState({ percent: 0, transferred: 0, total: 0 });

  const manifestUrl = UPDATE_MANIFEST_URL;

  const formatSize = (bytes) => bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '未知大小';

  const checkUpdate = async () => {
    setChecking(true);
    setUpdateStatus('正在检查更新…');
    try {
      const result = await api.checkUpdate(manifestUrl);
      const info = interpretUpdateResult(result);
      setUpdateInfo(info);
      setUpdateStatus(info.status);
      setUpdatePhase(info.available ? 'available' : 'idle');
    } catch (e) {
      setUpdateStatus(`检查失败：${e.message}`);
      setUpdatePhase('error');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    api.storageInfo().then(setStorageInfo);
    api.appVersion().then(setAppVersion);
    const cleanup = api.onUpdateProgress?.((p) => {
      setProgress(p);
    });
    checkUpdate();
    return () => cleanup?.();
  }, []);

  const handleSelectDir = async () => {
    const result = await api.selectDataDir(state);
    if (result) {
      setStorageInfo(result.info);
      if (result.state) setState(normalizeState(result.state));
    }
  };

  const handleDownload = async () => {
    setUpdatePhase('downloading');
    setProgress({ percent: 0, transferred: 0, total: 0 });
    setUpdateStatus(`正在下载 ${updateInfo.version}…`);
    try {
      await api.downloadUpdate({ url: updateInfo.installerUrl, version: updateInfo.version });
      setUpdatePhase('ready');
      setUpdateStatus('下载完成，可以立即安装。');
    } catch (e) {
      setUpdatePhase('error');
      setUpdateStatus(`下载失败：${e.message}`);
    }
  };

  const handleInstall = async () => {
    setUpdatePhase('installing');
    setUpdateStatus('正在启动安装程序，软件即将关闭…');
    try {
      await api.installUpdate();
    } catch (e) {
      setUpdatePhase('error');
      setUpdateStatus(`安装失败：${e.message}`);
    }
  };

  return (
    <div className="settings-page">
      <header>
        <span className="eyebrow">行舟影视设置</span>
        <h1>设置</h1>
        <p>管理资料保存位置，以及软件后续版本更新。</p>
      </header>

      <section className="settings-card">
        <div className="settings-title">
          <div>
            <HardDrive size={20} />
            <span>
              <h2>本地资料位置</h2>
              <p>项目、分集、Skill 配置与剧本库统一保存在这个目录。</p>
            </span>
          </div>
          <b>{storageInfo?.engine || '本地资料库'}</b>
        </div>
        <label>项目资料目录 <input readOnly value={storageInfo?.dataDir || '正在读取…'} /></label>
        <label>资料文件 <input readOnly value={storageInfo?.dataFile || '正在读取…'} /></label>
        <div className="settings-actions">
          <button className="primary" onClick={handleSelectDir}>选择资料位置</button>
          <button className="secondary" onClick={() => api.openDataDir()}>打开资料文件夹</button>
        </div>
      </section>

      <section className="settings-card update-card">
        <div className="settings-title">
          <div>
            <RefreshCw size={20} />
            <span>
              <h2>软件更新</h2>
              <p>应用内下载、显示进度，然后直接安装，不再打开浏览器。</p>
            </span>
          </div>
          <b>v{appVersion}</b>
        </div>

        <div className="update-status">
          <strong>{updateStatus}</strong>
          {updateInfo?.notes && <p>{updateInfo.notes}</p>}
        </div>

        {updatePhase === 'downloading' && (
          <div className="download-progress">
            <div className="progress-meta">
              <span>正在下载安装包</span>
              <b>{progress.percent}%</b>
            </div>
            <div className="progress-track">
              <i style={{ transform: `scaleX(${progress.percent / 100})` }} />
            </div>
            <small>{formatSize(progress.transferred)} / {formatSize(progress.total)}</small>
          </div>
        )}

        <div className="update-row">
          <button className="secondary" onClick={checkUpdate} disabled={checking || updatePhase === 'downloading' || updatePhase === 'installing'}>
            {checking ? '检查中…' : '重新检查'}
          </button>
          {updatePhase === 'available' && (
            <button className="primary" onClick={handleDownload}><Download size={16} /> 在软件内下载更新</button>
          )}
          {updatePhase === 'ready' && (
            <button className="primary" onClick={handleInstall}><RefreshCw size={16} /> 立即安装并重启</button>
          )}
          {updatePhase === 'error' && updateInfo?.available && (
            <button className="primary" onClick={handleDownload}>重新下载</button>
          )}
        </div>

        <p className="settings-note">
          资料保存在独立目录。更新安装只替换软件程序，不会删除果子库、剧本库、Skill、API 配置或导演提示词。
        </p>
      </section>
    </div>
  );
}

/* ================================================================
 * App - 主应用组件
 * ================================================================ */
function App() {
  const [role, setRole] = useState(() => localStorage.getItem('xz-role'));
  const [nav, setNav] = useState(() => localStorage.getItem('xz-role') === 'director' ? 'director' : 'fruit');
  const [initialized, setInitialized] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiAttachment, setAiAttachment] = useState(null);
  const [state, setState] = useState(() => {
    try {
      return normalizeState(JSON.parse(localStorage.getItem(STORAGE)) || createInitialState());
    } catch {
      return createInitialState();
    }
  });

  // 加载持久化状态
  useEffect(() => {
    api.loadState().then((saved) => {
      if (saved) {
        setState(normalizeState(saved));
      } else {
        api.saveState(state);
      }
      setInitialized(true);
    }).catch(() => setInitialized(true));
  }, []);

  // 保存状态（debounce）
  useEffect(() => {
    if (!initialized) return;
    localStorage.setItem(STORAGE, JSON.stringify(state));
    const timer = setTimeout(() => api.saveState(state), 250);
    return () => clearTimeout(timer);
  }, [state, initialized]);

  // 清理过期会话
  useEffect(() => {
    if (initialized) {
      setState((s) => cleanupChatSessions(s));
    }
  }, [initialized]);

  // 角色选择
  const handleRoleSelect = (r) => {
    setRole(r);
    localStorage.setItem('xz-role', r);
    setNav(r === 'director' ? 'director' : 'fruit');
  };

  // 角色选择界面
  if (!role) {
    return (
      <div className="role-screen v06">
        <BrandLogo />
        <div className="role-copy">
          <span className="eyebrow">XINGZHOU FILM STUDIO</span>
          <h1>选择你的工作身份</h1>
          <p>同一套剧本资产与 AI 能力，服务内容创作和导演制作。</p>
        </div>
        <div className="role-cards">
          <button onClick={() => handleRoleSelect('creator')}>
            <div><UserRound /></div>
            <span>01</span>
            <h2>内容创作者</h2>
            <p>果子库、剧本创作和原创资产管理。</p>
            <b>进入工作台 →</b>
          </button>
          <button onClick={() => handleRoleSelect('director')}>
            <div><Film /></div>
            <span>02</span>
            <h2>导演</h2>
            <p>逐集阅读剧本，记录画面并生成 AI 视频提示词。</p>
            <b>进入导演台 →</b>
          </button>
        </div>
      </div>
    );
  }

  // 导航配置
  const creatorNav = [
    ['fruit', BookOpen, '果子库'],
    ['studio', PenLine, '创作剧本'],
    ['scripts', Library, '剧本库'],
  ];
  const toolsNav = [
    ['skills', Sparkles, 'Skill 库'],
    ['apis', KeyRound, 'API 接口'],
    ['settings', Settings, '设置'],
  ];
  const directorNav = [
    ['director', Film, '导演工作台'],
    ...toolsNav,
  ];

  const navItems = role === 'director' ? directorNav : [...creatorNav, ...toolsNav];

  return (
    <div className="app v06-app">
      {/* 侧边导航栏 */}
      <nav className="sidebar">
        <BrandLogo compact />
        <div className="nav-label">{role === 'director' ? '导演' : '内容创作者'}</div>
        {navItems.map(([key, Icon, label]) => (
          <button key={key} className={nav === key ? 'active' : ''} onClick={() => setNav(key)}>
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
        <div className="side-bottom">
          <button onClick={() => { setRole(null); localStorage.removeItem('xz-role'); }}>
            <UserRound size={18} /> <span>切换身份</span>
          </button>
          <small>本地资料 · 1.2.4</small>
        </div>
      </nav>

      {/* 主内容区域 */}
      <section className="content">
        {/* 全局 AI 按钮 */}
        <button className="global-ai-launch" onClick={() => setAiOpen(true)}>
          <Bot /> <span>行舟 AI</span>
        </button>

        {nav === 'fruit' && <FruitLibrary state={state} setState={setState} api={api} />}
        {nav === 'studio' && <ScriptStudio state={state} setState={setState} api={api} />}
        {nav === 'scripts' && <ScriptLibrary state={state} setState={setState} />}
        {nav === 'skills' && <SkillLibrary state={state} setState={setState} />}
        {nav === 'apis' && <ApiLibrary state={state} setState={setState} />}
        {nav === 'settings' && <SettingsPage state={state} setState={setState} />}
        {nav === 'director' && (
          <DirectorWorkspace
            state={state}
            setState={setState}
            api={api}
            onAttach={(attachment) => { setAiAttachment(attachment); setAiOpen(true); }}
          />
        )}
      </section>

      {/* 全局 AI 持久会话抽屉 */}
      <PersistentChat
        open={aiOpen}
        onClose={() => { setAiOpen(false); setAiAttachment(null); }}
        state={state}
        setState={setState}
        api={api}
        attachment={aiAttachment}
      />
    </div>
  );
}

export default App;
