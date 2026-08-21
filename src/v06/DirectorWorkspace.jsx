import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Upload, FileText, BookOpen, Plus, Trash2, Sparkles,
  Save, Bot, X, Check, Pin, Copy, RefreshCw, Film, PencilLine, Users, Lock, Unlock, Cloud
} from 'lucide-react';
import { DeleteConfirm } from './DeleteConfirm.jsx';
import { ProjectCardHub } from './ProjectCardHub.jsx';
import {
  importDirectorProject, deleteDirectorProject, updateDirectorProject,
  createDirectorGroup, renameDirectorGroup, deleteDirectorGroup,
  addDirectorPrompt, updateDirectorEpisode, updateDirectorPrompt, deleteDirectorEpisode,
  appendDirectorPromptHistory, collectDirectorPromptHistory, groupDirectorPromptHistory,
  deleteDirectorPromptsEverywhere, updateDirectorPromptEverywhere, buildPromptHistoryExport,
  appendDirectorEpisodePrompts, buildPromptGroupExport,
  PROJECT_STYLES, PROJECT_RATIOS,
  setDirectorProjectStyle, setDirectorProjectRatio, buildProjectPreamble
} from '../../core/projectStore.js';
import { splitFullScript, parseMasterScript, parseDirectorScenes, replaceMasterSetting } from '../../core/scriptImport.js';
import { getSceneVision, buildScenePromptRecords, buildNumberedSceneTasks, promptsForScene, splitNumberedPromptOutput } from '../../core/directorCreative.js';
import { executeSkillWithAi } from '../../core/skillExecution.js';
import { buildSkillManifest } from '../../core/skillContext.js';
import { reconcileDirectorCloudProjects, removeDirectorCloudProjection, canManageDirectorCollab, mergeCloudEpisodes } from '../../core/directorCloudProjects.js';

/* ================================================================
 * ProjectCards - 导演工作台项目选择页
 * ================================================================ */
function ProjectCards({ projects, groups, library, onOpen, onDelete, onRename, onMoveToGroup, onCreateGroup, onRenameGroup, onDeleteGroup, onImportLibrary, onUpload, onManageCollab, canManageCollab, canDeleteProject, onOpenCloudManager }) {
  return (
    <ProjectCardHub
      title="选择一部剧本开始导演创作"
      subtitle="可以使用内容创作者完成的剧本，也可以从电脑上传完整剧本文档。"
      projects={projects}
      groups={groups}
      library={library}
      kind="director"
      onOpen={onOpen}
      onDelete={onDelete}
      onRename={onRename}
      onMoveToGroup={onMoveToGroup}
      onCreateGroup={onCreateGroup}
      onRenameGroup={onRenameGroup}
      onDeleteGroup={onDeleteGroup}
      onImportLibrary={onImportLibrary}
      onUpload={onUpload}
      onCreate={() => {}}
      onManageCollab={onManageCollab}
      canManageCollab={canManageCollab}
      canDeleteProject={canDeleteProject}
      headerExtra={onOpenCloudManager ? <button className="secondary director-cloud-manager-button" onClick={onOpenCloudManager}><Cloud size={16}/> 云端管理</button> : null}
    />
  );
}

function DirectorCollabDialog({ project, cloudProject, canManage, api, onClose, onChanged }) {
  const [members, setMembers] = useState([]); const [username, setUsername] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async () => { if (!cloudProject?.id) return; try { setMembers(await api.directorListMembers({ projectId: cloudProject.id }) || []); } catch (e) { setError(e.message); } }, [cloudProject?.id]);
  React.useEffect(() => { load(); }, [load]);
  const invite = async () => { if (!username.trim()) return; setBusy(true); try { await api.directorAddMember({ projectId: cloudProject.id, username }); setUsername(''); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return createPortal(<div className="veil director-collab-veil"><div className="modal director-collab-dialog"><h2>{cloudProject ? '管理导演协作' : '开启导演协作'}</h2><p>《{project.name}》是独立的云端导演文档，不会出现在“项目协作”列表。</p>{cloudProject ? <><div className={`collab-lock-state ${cloudProject.locked ? 'locked' : ''}`}>{cloudProject.locked ? <Lock size={16}/> : <Unlock size={16}/>} {cloudProject.locked ? '项目已锁定，所有人均不可编辑' : '项目允许协作者共同编辑'}</div>{canManage && <button className="secondary" onClick={async () => { setBusy(true); try { await api.directorCollabSetLocked({ projectId: cloudProject.id, locked: !cloudProject.locked }); await onChanged(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>{cloudProject.locked ? '解除锁定' : '锁住整个项目'}</button>}<div className="director-collab-invite"><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="输入已注册用户的账号" disabled={!canManage}/><button className="primary" onClick={invite} disabled={!canManage || busy || !username.trim()}><Users size={14}/>邀请协作者</button></div><div className="director-collab-members">{members.map((m) => <div key={m.id}><span>{m.display_name || m.username} · {m.role === 'producer' ? '制片' : '协作者'}</span>{canManage && m.role !== 'producer' && <button className="danger" onClick={async () => { await api.directorRemoveMember({ projectId: cloudProject.id, memberId: m.id }); await load(); }}>踢出</button>}</div>)}</div></> : <p>{canManage ? '开启后可持续邀请多人，已有成员不会被重置。' : '只有管理员授予制片身份后，才能开启导演协作。'}</p>}{error && <div className="collab-error">{error}</div>}<div className="modal-actions"><button className="ghost" onClick={onClose}>关闭</button>{!cloudProject && canManage && <button className="primary" disabled={busy} onClick={async () => { setBusy(true); try { await onChanged('create'); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>开启导演协作</button>}</div></div></div>, document.body);
}

function DirectorCloudManager({ projects, onBack, onDelete }) {
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');
  const owned = projects.filter((project) => project.myRole === 'producer');
  return <main className="director-cloud-manager">
    <header><div><span className="eyebrow">导演工作台 · 独立云端</span><h1>云端管理</h1><p>管理已开启导演协作的云端项目。项目协作仍在读取的项目需先到项目协作删除。</p></div><button className="secondary" onClick={onBack}><ArrowLeft size={16}/> 返回导演工作台</button></header>
    {error && <div className="collab-error">{error}</div>}
    <section className="director-cloud-list">
      {owned.map((project) => {
        const collaborationLinked = Boolean(project.collaborationLinked);
        return <article key={project.id} className={`director-cloud-row${collaborationLinked ? ' linked' : ''}`}>
          <div className="director-cloud-row-icon"><Cloud size={22}/></div>
          <div><h3>{project.name}</h3><p>{(project.episodes || []).length} 集 · 最近更新 {project.updated_at ? new Date(project.updated_at).toLocaleString('zh-CN', { hour12: false }) : '—'}</p>{collaborationLinked && <small>项目协作正在单向读取此项目，请先到“项目协作”删除对应项目</small>}</div>
          <button className="danger" disabled={collaborationLinked} onClick={() => { setError(''); setDeleteTarget(project); }}><Trash2 size={15}/> {collaborationLinked ? '项目协作使用中' : '删除云端项目'}</button>
        </article>;
      })}
      {!owned.length && <div className="collab-empty"><Cloud size={30}/><p>导演工作台暂无已上传的云端项目。</p></div>}
    </section>
    <DeleteConfirm open={Boolean(deleteTarget)} title="删除导演云端项目" name={deleteTarget?.name} detail="只删除导演工作台云端文档，不删除本地项目。删除后不可恢复。" onCancel={() => setDeleteTarget(null)} onConfirm={async () => { if (!deleteTarget) return; try { await onDelete(deleteTarget); setDeleteTarget(null); } catch (e) { const message = String(e?.message || '网络连接异常'); setError(message.includes('director_project_in_use') ? '该项目仍被项目协作读取，请先到项目协作删除对应项目。' : message.includes('director_project_not_found') ? '该云端项目已不存在，已刷新本地状态。' : `删除失败：${message}`); setDeleteTarget(null); } }}/>
  </main>;
}

/* ================================================================
 * DirectorRail - 左侧分集导航
 * ================================================================ */
function DirectorRail({ project, active, setActive, onAdd, onDeleteEpisode, onBack, kind }) {
  const episodeNumberAt = (index) => project.episodes.slice(0, index + 1).filter((episode) => episode.kind !== 'setting' && episode.title !== '设定和小传').length;
  return (
    <aside className="director-rail">
      <button onClick={onBack}><ArrowLeft size={16} /> 所有导演项目</button>
      <h2>{project.name}</h2>
      <div className="rail-label">总剧本</div>
      <button
        className={active === 'master' ? 'active' : ''}
        onClick={() => setActive('master')}
      >
        <FileText size={17} />
        <span>总剧本编辑</span>
      </button>

      <div className="rail-label">分集</div>
      {project.episodes?.map((ep, idx) => (
        <button
          key={ep.id}
          className={active === ep.id ? 'active' : ''}
          onClick={() => setActive(ep.id)}
        >
          <span className="rail-index">{ep.kind === 'setting' || ep.title === '设定和小传' ? '序' : String(episodeNumberAt(idx)).padStart(2, '0')}</span>
          <span>
            {ep.title}
            <small>{ep.status || '待导演处理'}</small>
          </span>
          <span className="rail-episode-delete" onClick={(event) => { event.stopPropagation(); onDeleteEpisode?.(ep.id); }}>删除</span>
        </button>
      ))}

      <button className="add-episode" onClick={onAdd}>
        <Plus size={16} /> 添加集数
      </button>
    </aside>
  );
}

/* ================================================================
 * PromptCard - 单条提示词卡片
 * ================================================================ */
function PromptCard({ prompt, index, onDelete, onCopy, onEdit }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(prompt.content || '');

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    onCopy?.(prompt);
  };

  const cancelEdit = () => {
    setDraft(prompt.content || '');
    setEditing(false);
  };

  const saveEdit = () => {
    if (!draft.trim()) return;
    onEdit?.(prompt.id, draft);
    setEditing(false);
  };

  return (
    <div className="prompt-card">
      <div className="prompt-card-head">
        <div className="prompt-label">{prompt.label || `提示词 ${index + 1}`}</div>
        <div className="prompt-actions top">
          {editing ? (
            <div className="prompt-edit-actions">
              <button className="ghost" onClick={cancelEdit}><X size={14} /> 取消</button>
              <button className="primary" onClick={saveEdit} disabled={!draft.trim()}><Save size={14} /> 保存修改</button>
            </div>
          ) : (
            <>
              <button className="ghost" onClick={handleCopy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? '已复制' : '复制'}
              </button>
              <button className="ghost prompt-edit-button" onClick={() => setEditing(true)}><PencilLine size={14} /> 编辑</button>
            </>
          )}
          {onDelete && !editing && (
            <button className="prompt-delete" onClick={() => onDelete(prompt.id)}>
              <Trash2 size={14} /> 删除
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <textarea className="prompt-edit-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={`编辑提示词 ${prompt.label}`} />
      ) : (
        <div className="prompt-content">{prompt.content}</div>
      )}
    </div>
  );
}

/* ================================================================
 * parseSegments - 通过 (1)(2) 分割段落/场景
 * ================================================================ */
function parseSegments(text) {
  if (!text) return [];
  const parts = text.split(/(?=\(\d+\))/g).filter(Boolean);
  if (parts.length === 0 && text.trim()) return [{ label: '全文', content: text.trim() }];
  return parts.map((part, i) => {
    const match = part.match(/^\((\d+)\)/);
    const num = match ? match[1] : String(i + 1);
    return { label: num, content: part.replace(/^\(\d+\)\s*/, '').trim() };
  });
}

/* ================================================================
 * EpisodeDirector - 逐集导演编辑（支持 creative/quick 模式）
 * ================================================================ */
function EpisodeDirector({ project, episode, episodeNumber, state, setState, api, onAttach, onRefreshCloud, refreshingCloud, cloudRefreshNotice }) {
  const [mode, setMode] = useState('creative'); // 'creative' | 'quick'
  const [selectedSkillId, setSelectedSkillId] = useState(() => {
    try {
      const lastId = localStorage.getItem('xz-last-used-skill');
      return state.skills?.some((skill) => skill.id === lastId) ? lastId : state.skills?.[0]?.id || '';
    } catch { return state.skills?.[0]?.id || ''; }
  });
  const [running, setRunning] = useState(false);
  // 并发生成：每个场景独立的运行状态，可同时对多个场景发起生成
  const [runningScenes, setRunningScenes] = useState(() => new Set());
  const markSceneRunning = (label, on) => setRunningScenes((current) => {
    const next = new Set(current);
    if (on) next.add(label); else next.delete(label);
    return next;
  });
  const isSceneRunning = (label) => runningScenes.has(label);
  const [sceneInputs, setSceneInputs] = useState({}); // 快速模式下各场景的编辑框
  // 快速模式下选中的场景
  const [activeScene, setActiveScene] = useState(null);
  const promptCardRefs = useRef({});
  const [promptSelectionOpen, setPromptSelectionOpen] = useState(false);
  const [selectedPromptIds, setSelectedPromptIds] = useState(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const skills = state.skills || [];
  const savedPrompts = episode.prompts || [];
  const currentSkill = skills.find((s) => s.id === selectedSkillId);

  const segments = parseDirectorScenes(episode.content, episodeNumber);
  // 快速模式自动选中第一个场景
  const currentScene = activeScene || (segments.length > 0 ? segments[0].label : null);
  const currentSceneContent = currentScene
    ? (sceneInputs[currentScene] !== undefined
      ? sceneInputs[currentScene]
      : (episode.quickSceneEdits?.[currentScene] ?? segments.find((s) => s.label === currentScene)?.content ?? ''))
    : '';
  const currentVision = currentScene ? getSceneVision(episode, currentScene) : '';

  const saveSceneVision = (sceneLabel, content) => {
    setState((s) => updateDirectorEpisode(s, project.id, episode.id, {
      sceneVisions: { ...(episode.sceneVisions || {}), [sceneLabel]: content },
      status: content.trim() ? '导演构想中' : episode.status,
    }));
  };

  // 运行 Skill 生成提示词（大模型先读取项目风格与画幅，再执行 Skill）
  const runSkill = async (inputText, title) => {
    if (!inputText?.trim() || running || !currentSkill) return;
    setRunning(true);
    try {
      const skillId = currentSkill?.id;
      if (skillId) localStorage.setItem('xz-last-used-skill', skillId);
      const preamble = buildProjectPreamble(project);
      const finalInput = preamble ? `${preamble}\n\n${inputText}` : inputText;
      const result = await executeSkillWithAi({ api, state, skillId, input: finalInput, assistantRole: '行舟影视导演提示词助手' });
      const outputParts = splitNumberedPromptOutput(result.output);
      const newPrompts = outputParts.map((part, i) => ({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        label: `${episodeNumber}-${part.label}`,
        content: part.content,
        skill: currentSkill?.name || '',
        createdAt: new Date().toISOString(),
      }));
      // 在 setState 回调中基于最新状态追加，避免并发生成/云端轮询相互覆盖
      setState((s) => appendDirectorPromptHistory(appendDirectorEpisodePrompts(s, project.id, episode.id, newPrompts, {
        status: '已生成提示词',
      }), project.id, newPrompts));
    } catch (e) {
      console.error('Skill 运行失败:', e);
    } finally {
      setRunning(false);
    }
  };

  const runCreativeScene = async (sceneLabel) => {
    if (isSceneRunning(sceneLabel) || !currentSkill) return;
    const scene = segments.find((item) => item.label === sceneLabel);
    const vision = getSceneVision(episode, sceneLabel);
    // 创造模式只依据可编辑的“导演构想”生成，不读取左侧只读剧本展示框。
    if (!vision.trim()) return;
    markSceneRunning(sceneLabel, true);
    try {
      if (currentSkill.id) localStorage.setItem('xz-last-used-skill', currentSkill.id);
      const preamble = buildProjectPreamble(project);
      const sourceText = `${preamble ? `${preamble}\n\n` : ''}【导演构想】\n${vision}`;
      const result = await executeSkillWithAi({ api, state, skillId: currentSkill.id, input: sourceText, assistantRole: '行舟影视导演提示词助手' });
      const outputParts = splitNumberedPromptOutput(result.output);
      const newPrompts = buildScenePromptRecords({
        sceneLabel,
        parts: outputParts,
        existing: episode.prompts || [],
        skill: currentSkill?.name || '',
        sourceText,
      });
      setState((s) => appendDirectorPromptHistory(appendDirectorEpisodePrompts(s, project.id, episode.id, newPrompts, {
        status: '已生成提示词',
        lastUsedSkill: currentSkill?.name || '',
      }), project.id, newPrompts));
    } catch (error) {
      console.error('创造模式运行失败:', error);
    } finally {
      markSceneRunning(sceneLabel, false);
    }
  };

  // 快速模式：保存当前场景编辑并运行 Skill（同样先读取项目风格与画幅）
  const runQuickScene = async (sceneLabel) => {
    if (isSceneRunning(sceneLabel) || !currentSkill) return;
    const inputText = sceneInputs[sceneLabel] !== undefined
      ? sceneInputs[sceneLabel]
      : (episode.quickSceneEdits?.[sceneLabel] ?? segments.find((s) => s.label === sceneLabel)?.content);
    if (!inputText?.trim()) return;
    markSceneRunning(sceneLabel, true);
    try {
      const skillId = currentSkill?.id;
      if (skillId) localStorage.setItem('xz-last-used-skill', skillId);
      const preamble = buildProjectPreamble(project);
      const tasks = buildNumberedSceneTasks(inputText, sceneLabel);
      // 并发向大模型发起各分段请求，读取输出后按编号排序
      const results = await Promise.all(tasks.map(async (task) => {
        const taskInput = preamble ? `${preamble}\n\n${task.input}` : task.input;
        const result = await executeSkillWithAi({ api, state, skillId, input: taskInput, assistantRole: '行舟影视导演提示词助手' });
        return { task, output: result.output };
      }));
      const generatedParts = [];
      for (const { task, output } of results) {
        const parsed = splitNumberedPromptOutput(output);
        if (parsed.length === 1) {
          const rawContent = parsed[0].content || output;
          const firstLine = rawContent.split('\n', 1)[0];
          const hasCanonicalLabel = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\d+-\d+-\d+(?:\*\*|__)?\s*$/.test(firstLine);
          const content = hasCanonicalLabel
            ? rawContent
            : `${task.label}\n${rawContent}`;
          generatedParts.push({ label: task.label, content });
        } else {
          generatedParts.push(...parsed);
        }
      }
      const sourceText = preamble ? `${preamble}\n\n${inputText}` : inputText;
      const newPrompts = buildScenePromptRecords({
        sceneLabel,
        parts: generatedParts,
        existing: episode.prompts || [],
        skill: currentSkill?.name || '',
        sourceText,
      });
      setState((s) => appendDirectorPromptHistory(appendDirectorEpisodePrompts(s, project.id, episode.id, newPrompts, {
        quickSceneEdits: { ...(episode.quickSceneEdits || {}), [sceneLabel]: inputText },
        status: '已生成提示词',
        lastUsedSkill: currentSkill?.name || '',
      }), project.id, newPrompts));
    } catch (e) {
      console.error('快速模式运行失败:', e);
    } finally {
      markSceneRunning(sceneLabel, false);
    }
  };

  const handleSavePrompt = (promptId) => {
    setState((s) => deleteDirectorPromptsEverywhere(s, project.id, [promptId]));
  };

  const handleEditPrompt = (promptId, content) => {
    setState((s) => updateDirectorPromptEverywhere(s, project.id, promptId, {
      content: content.trim(),
      editedAt: new Date().toISOString(),
    }));
  };

  // 获取当前选中场景的已生成提示词
  const scenePrompts = currentScene ? promptsForScene(savedPrompts, currentScene) : [];
  const togglePromptSelection = (promptId) => setSelectedPromptIds((current) => {
    const next = new Set(current);
    if (next.has(promptId)) next.delete(promptId); else next.add(promptId);
    return next;
  });
  const closePromptSelection = () => { setPromptSelectionOpen(false); setSelectedPromptIds(new Set()); };
  useEffect(() => {
    setPromptSelectionOpen(false);
    setSelectedPromptIds(new Set());
    setBulkDeleteOpen(false);
  }, [episode.id, currentScene, mode]);
  const confirmBulkDelete = () => {
    setState((s) => deleteDirectorPromptsEverywhere(s, project.id, [...selectedPromptIds]));
    setBulkDeleteOpen(false);
    closePromptSelection();
  };

  const buildAiContextForEpisode = () => {
    const prompts = episode.prompts || [];
    const promptsText = prompts.map((p) => `【${p.label}】\n${p.content}`).join('\n\n');
    return {
      name: `${project.name} - ${episode.title}`,
      content: `项目：《${project.name}》\n分集：${episode.title}\n\n剧本内容：\n${episode.content}\n\n已生成提示词：\n${promptsText}`,
    };
  };

  return (
    <main className="director-stage">
      {/* 头部 */}
      <header>
        <div className="eyebrow">
          <span>导演项目 · {episode.title}</span>
          <div className="mode-switch">
            <button
              className={mode === 'creative' ? 'active' : ''}
              onClick={() => setMode('creative')}
            >
              创造模式
            </button>
            <button
              className={mode === 'quick' ? 'active' : ''}
              onClick={() => setMode('quick')}
            >
              快速模式
            </button>
            <button
              className={mode === 'history' ? 'active' : ''}
              onClick={() => setMode('history')}
            >
              历史提示词
            </button>
            {project.cloudProjectId && <button className="director-cloud-refresh" onClick={onRefreshCloud} disabled={refreshingCloud}><RefreshCw size={15} className={refreshingCloud ? 'spin' : ''}/> {refreshingCloud ? '刷新中…' : '刷新云端'}</button>}
            {cloudRefreshNotice && <span className="director-refresh-notice">{cloudRefreshNotice}</span>}
          </div>
        </div>
        <div className="editor-head-actions">
          <button
            className="secondary ai-button"
            onClick={() => onAttach?.(buildAiContextForEpisode())}
          >
            <Bot size={17} /> 添加到 AI 对话
          </button>
        </div>
      </header>

      {/* 项目设定功能区：风格与画幅（创造/快速模式共用，运行 Skill 前优先注入给大模型） */}
      <div className="project-style-bar">
        <div className="style-bar-label"><Film size={15} /> 项目设定</div>
        <div className="style-bar-group">
          <span>风格</span>
          {PROJECT_STYLES.map((s) => (
            <button
              key={s}
              className={`style-chip ${(project.style || '') === s ? 'active' : ''}`}
              onClick={() => setState((st) => setDirectorProjectStyle(st, project.id, project.style === s ? '' : s))}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="style-bar-group">
          <span>画幅</span>
          {PROJECT_RATIOS.map((r) => (
            <button
              key={r}
              className={`style-chip ${(project.aspectRatio || '') === r ? 'active' : ''}`}
              onClick={() => setState((st) => setDirectorProjectRatio(st, project.id, project.aspectRatio === r ? '' : r))}
            >
              {r}
            </button>
          ))}
        </div>
        <small className="style-bar-hint">
          {project.style || project.aspectRatio
            ? `已设定：${[project.style, project.aspectRatio].filter(Boolean).join(' · ')}，运行 Skill 时大模型会优先读取`
            : '选择后运行 Skill，大模型会先读取风格与画幅再生成提示词'}
        </small>
      </div>

      {/* 创造模式：逐场景阅读剧本、记录导演构想，再生成提示词 */}
      {mode === 'creative' && (
        <div className="creative-mode-container">
          <nav className="creative-scene-rail">
            <div className="creative-panel-title">本集场景</div>
            {segments.map((seg) => (
              <button key={seg.label} className={currentScene === seg.label ? 'active' : ''} onClick={() => setActiveScene(seg.label)}>
                <strong>场景 {seg.label}</strong>
                <small>{seg.content.split('\n').filter(Boolean).slice(0, 2).join(' · ').slice(0, 62)}</small>
                {getSceneVision(episode, seg.label) && <span>已有导演构想</span>}
              </button>
            ))}
          </nav>

          <section className="creative-scene-workspace">
            <div className="creative-dual-panels">
              <article className="creative-script-panel">
                <div className="creative-panel-title"><BookOpen size={16}/> 场景 {currentScene} · 剧本内容 <span className="readonly-badge">只读</span></div>
                <textarea value={currentSceneContent} readOnly aria-label="当前场景剧本内容" />
              </article>
              <article className="creative-vision-panel">
                <div className="creative-panel-title"><Sparkles size={16}/> 场景 {currentScene} · 导演构想</div>
                <textarea
                  value={currentVision}
                  onChange={(event) => saveSceneVision(currentScene, event.target.value)}
                  aria-label="导演构想"
                  placeholder={'阅读左侧剧本，在这里记录脑海中的画面。\n\n光影：\n运镜：\n人物动作：\n拍摄角度：\n构图：\n色彩与氛围：\n节奏与转场：'}
                />
                <small>按场景自动保存，可随时切换场景继续创作。</small>
              </article>
            </div>
            <div className="creative-generation-controls">
              <label className="mode-skill-picker">
                <Sparkles size={16}/><span>选择 Skill</span>
                <select value={selectedSkillId} onChange={(event) => {
                  setSelectedSkillId(event.target.value);
                  localStorage.setItem('xz-last-used-skill', event.target.value);
                }}>
                  {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
                </select>
                {currentSkill && <small className="skill-file-count">完整 Skill · {buildSkillManifest(currentSkill).totalFiles} 个文件已附上</small>}
              </label>
              <button className="primary" onClick={() => runCreativeScene(currentScene)} disabled={isSceneRunning(currentScene) || !currentVision.trim() || !currentSkill}>
                <Sparkles size={16}/> {isSceneRunning(currentScene) ? '生成中…' : `生成场景 ${currentScene} 提示词`}
              </button>
            </div>
            <section className="creative-prompt-results">
              <div className="prompt-list-title"><Save size={16}/> 场景 {currentScene} 提示词（{scenePrompts.length} 条）</div>
              {scenePrompts.length ? scenePrompts.map((prompt, i) => <PromptCard key={prompt.id} prompt={prompt} index={i} onDelete={handleSavePrompt} onEdit={handleEditPrompt}/>) : (
                <div className="no-prompts"><Bot size={30}/><p>填写导演构想并运行 Skill，生成结果会按 {currentScene}-1、{currentScene}-2… 命名。</p></div>
              )}
            </section>
          </section>
        </div>
      )}

      {/* 快速模式：三栏布局 — 场景列表 | 场景编辑 | 提示词结果 */}
      {mode === 'quick' && (
        <div className="quick-mode-container">
          {/* 左栏：场景列表 */}
          <nav className="quick-scene-rail">
            <div className="quick-scene-rail-title">场景列表</div>
            {segments.map((seg) => (
              <button
                key={seg.label}
                className={`quick-scene-item ${currentScene === seg.label ? 'active' : ''}`}
                onClick={() => setActiveScene(seg.label)}
              >
                <span className="scene-item-label">场景 {seg.label}</span>
                <small>{seg.content.split('\n').filter(line => line.trim() && !/^【[^】]+】$/.test(line.trim())).slice(0, 2).join(' · ').slice(0, 56) || seg.content.slice(0, 56)}{seg.content.length > 56 ? '…' : ''}</small>
              </button>
            ))}
            {segments.length === 0 && (
              <div className="quick-scene-empty">未检测到 (1)(2) 分段标记</div>
            )}
          </nav>

          {/* 中栏：选中场景的可编辑卡片 */}
          <section className="quick-scene-editor">
            {currentScene ? (
              <div className="quick-scene-card">
                <div className="quick-scene-card-head">
                  <span className="scene-card-badge">场景 {currentScene}</span>
                  <div className="quick-generation-controls">
                    <label className="mode-skill-picker compact">
                      <span>Skill</span>
                      <select value={selectedSkillId} onChange={(event) => {
                        setSelectedSkillId(event.target.value);
                        localStorage.setItem('xz-last-used-skill', event.target.value);
                      }}>
                        {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
                      </select>
                      {currentSkill && <small className="skill-file-count">完整 Skill · {buildSkillManifest(currentSkill).totalFiles} 个文件已附上</small>}
                    </label>
                    <button
                      className="primary compact"
                      onClick={() => runQuickScene(currentScene)}
                      disabled={isSceneRunning(currentScene) || !currentSceneContent?.trim() || !currentSkill}
                    >
                      <Sparkles size={14} /> {isSceneRunning(currentScene) ? '生成中…' : '生成'}
                    </button>
                  </div>
                </div>
                <textarea
                  className="quick-scene-textarea"
                  value={currentSceneContent}
                  onChange={(e) => setSceneInputs((prev) => ({ ...prev, [currentScene]: e.target.value }))}
                  placeholder={`编辑场景 ${currentScene} 的剧本内容……`}
                />
                <div className="quick-scene-info">
                  <small>场景描述 · 可用（1）（2）（3）……划分，Skill 输出会按相同编号自动拆成独立提示词框</small>
                </div>
              </div>
            ) : (
              <div className="quick-scene-empty">
                <p>请从左侧选择一个场景</p>
              </div>
            )}
          </section>

          {/* 右栏：当前场景生成的提示词结果 */}
          <section className="quick-scene-prompts">
            <div className="quick-scene-prompts-title">
              <Sparkles size={15} /> {currentScene ? `场景 ${currentScene} 提示词` : '提示词结果'}
            </div>
            {scenePrompts.length > 0 && <div className="prompt-locator-toolbar"><nav className="prompt-locator" aria-label="提示词快速定位">{scenePrompts.map((prompt, index) => <button key={prompt.id} onClick={() => promptCardRefs.current[prompt.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{index + 1}</button>)}</nav><div className="prompt-bulk-actions">{promptSelectionOpen ? <><button className="ghost" onClick={() => setSelectedPromptIds(new Set(scenePrompts.map((prompt) => prompt.id)))}>全选</button><button className="danger" disabled={!selectedPromptIds.size} onClick={() => setBulkDeleteOpen(true)}>删除选中（{selectedPromptIds.size}）</button><button className="ghost" onClick={closePromptSelection}>取消</button></> : <button className="ghost" onClick={() => setPromptSelectionOpen(true)}><Trash2 size={14}/>选择删除</button>}</div></div>}
            {scenePrompts.length > 0 ? (
              <div className="prompt-list compact">
                {scenePrompts.map((prompt, i) => (
                  <div key={prompt.id} className={`prompt-select-wrapper${selectedPromptIds.has(prompt.id) ? ' selected' : ''}`} ref={(node) => { if (node) promptCardRefs.current[prompt.id] = node; else delete promptCardRefs.current[prompt.id]; }}>{promptSelectionOpen && <label className="prompt-select-check"><input type="checkbox" checked={selectedPromptIds.has(prompt.id)} onChange={() => togglePromptSelection(prompt.id)}/>选择 {prompt.label}</label>}<PromptCard prompt={prompt} index={i} onDelete={handleSavePrompt} onEdit={handleEditPrompt} /></div>
                ))}
              </div>
            ) : (
              <div className="quick-scene-no-prompts">
                <small>选中场景并点击"生成"，提示词会显示在这里</small>
              </div>
            )}
            {scenePrompts.length === 0 && savedPrompts.length === 0 && (
              <div className="no-prompts compact">
                <Bot size={24} />
                <p>选择 Skill 并运行，生成的提示词会出现在这里。</p>
              </div>
            )}
          </section>
        </div>
      )}
      <DeleteConfirm open={bulkDeleteOpen} title="删除选中的提示词" name={`${selectedPromptIds.size} 条提示词`} detail="确定后会从当前导演项目中删除所选提示词，此操作无法恢复。" onCancel={() => setBulkDeleteOpen(false)} onConfirm={confirmBulkDelete}/>

      {/* 历史提示词：项目级永久保留，按集数分卡片，可导出文档 */}
      {mode === 'history' && (
        <PromptHistoryPanel project={project} api={api} onDeletePrompt={handleSavePrompt} onEditPrompt={handleEditPrompt} />
      )}
    </main>
  );
}

/* ================================================================
 * PromptHistoryPanel - 历史提示词（项目级，永不因剧本变动丢失）
 * ================================================================ */
function PromptHistoryPanel({ project, api, onDeletePrompt, onEditPrompt }) {
  const [openGroup, setOpenGroup] = useState(null);
  const [exportNotice, setExportNotice] = useState('');
  const [exportMode, setExportMode] = useState(false); // 选集导出模式
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const allPrompts = collectDirectorPromptHistory(project);
  const groups = groupDirectorPromptHistory(allPrompts);
  const activeGroup = groups.find((group) => group.key === openGroup);

  const notice = (message) => { setExportNotice(message); setTimeout(() => setExportNotice(''), 5000); };
  const groupTitle = (group) => group.key === '未编号' ? '未编号提示词' : `第${group.key}集提示词`;
  const toggleKey = (key) => setSelectedKeys((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const pickedGroups = groups.filter((group) => selectedKeys.has(group.key));

  // 全部导出为一个文档
  const exportAllSingle = async () => {
    try {
      const saved = await api.saveTxt?.({ name: `《${project.name}》提示词全集`, content: buildPromptHistoryExport(project) });
      notice(saved ? `已导出：${saved}` : '');
    } catch (e) { notice(`导出失败：${e.message}`); }
  };
  // 全部导出：每集一个文档，放进同一个文件夹
  const exportAllSplit = async () => {
    try {
      const files = groups.map((group) => ({ name: groupTitle(group), content: buildPromptGroupExport(project, group) }));
      const dir = await api.saveTxtBatch?.({ folderName: `《${project.name}》提示词`, files });
      notice(dir ? `已导出 ${files.length} 个文档到：${dir}` : '');
    } catch (e) { notice(`导出失败：${e.message}`); }
  };
  // 选中的集数：每集一个文档，放进同一个文件夹
  const exportPickedSplit = async () => {
    if (!pickedGroups.length) return;
    try {
      const files = pickedGroups.map((group) => ({ name: groupTitle(group), content: buildPromptGroupExport(project, group) }));
      const dir = await api.saveTxtBatch?.({ folderName: `《${project.name}》提示词选集`, files });
      if (dir) { notice(`已导出 ${files.length} 个文档到：${dir}`); setExportMode(false); setSelectedKeys(new Set()); }
    } catch (e) { notice(`导出失败：${e.message}`); }
  };
  // 选中的集数：汇总为一个文档
  const exportPickedMerged = async () => {
    if (!pickedGroups.length) return;
    try {
      const content = [`《${project.name}》提示词选集`, '', ...pickedGroups.map((group) => buildPromptGroupExport(project, group))].join('\n');
      const saved = await api.saveTxt?.({ name: `《${project.name}》提示词选集`, content });
      if (saved) { notice(`已导出：${saved}`); setExportMode(false); setSelectedKeys(new Set()); }
    } catch (e) { notice(`导出失败：${e.message}`); }
  };

  return (
    <div className="prompt-history-container">
      <div className="prompt-history-toolbar">
        <div className="prompt-history-title"><Save size={16}/> 历史提示词 · 共 {allPrompts.length} 条（除手动删除外永久保留，修改总剧本或添加集数都不会丢失）</div>
        <div className="prompt-history-export-actions">
          {exportMode ? (
            <>
              <button className="ghost" onClick={() => setSelectedKeys(new Set(groups.map((group) => group.key)))}>全选</button>
              <button className="secondary" onClick={exportPickedSplit} disabled={!pickedGroups.length}><Upload size={14}/> 分开导出（{pickedGroups.length}）</button>
              <button className="secondary" onClick={exportPickedMerged} disabled={!pickedGroups.length}><Upload size={14}/> 汇总一个文档</button>
              <button className="ghost" onClick={() => { setExportMode(false); setSelectedKeys(new Set()); }}>取消</button>
            </>
          ) : (
            <>
              <button className="secondary" onClick={() => setExportMode(true)} disabled={!allPrompts.length}><Check size={14}/> 选集导出</button>
              <button className="secondary" onClick={exportAllSplit} disabled={!allPrompts.length}><Upload size={14}/> 全部分开导出</button>
              <button className="secondary" onClick={exportAllSingle} disabled={!allPrompts.length}><Upload size={14}/> 全部汇总导出</button>
            </>
          )}
        </div>
      </div>
      {exportNotice && <div className="collab-notice">{exportNotice}</div>}
      {!allPrompts.length && <div className="no-prompts"><Bot size={30}/><p>项目还没有生成过提示词。生成后会自动记录到这里。</p></div>}
      {!activeGroup && (
        <div className="prompt-history-grid">
          {groups.map((group) => (
            <button key={group.key} className={`prompt-history-card${exportMode && selectedKeys.has(group.key) ? ' selected' : ''}`} onClick={() => exportMode ? toggleKey(group.key) : setOpenGroup(group.key)}>
              {exportMode && <span className="prompt-history-check">{selectedKeys.has(group.key) ? '✓ 已选' : '点击选择'}</span>}
              <strong>{group.key === '未编号' ? '未编号' : `第 ${group.key} 集`}</strong>
              <span>{group.prompts.length} 条提示词</span>
              <small>{group.prompts.slice(0, 3).map((prompt) => prompt.label).join('、')}{group.prompts.length > 3 ? '…' : ''}</small>
            </button>
          ))}
        </div>
      )}
      {activeGroup && !exportMode && (
        <div className="prompt-history-detail">
          <div className="prompt-history-detail-head">
            <button className="ghost" onClick={() => setOpenGroup(null)}><ArrowLeft size={15}/> 返回全部集数</button>
            <span>{activeGroup.key === '未编号' ? '未编号提示词' : `第 ${activeGroup.key} 集提示词`}（{activeGroup.prompts.length} 条）</span>
          </div>
          <div className="prompt-list">
            {activeGroup.prompts.map((prompt, i) => (
              <PromptCard key={prompt.id} prompt={prompt} index={i} onDelete={onDeletePrompt} onEdit={onEditPrompt}/>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingEditor({ project, episode, setState }) {
  const [draft, setDraft] = useState(episode.content || '');
  React.useEffect(() => setDraft(episode.content || ''), [episode.id, episode.content]);
  const save = () => setState((state) => updateDirectorProject(state, project.id, {
    masterScript: replaceMasterSetting(project.masterScript || '', draft),
    episodes: (project.episodes || []).map((item) => item.id === episode.id ? { ...item, content: draft, kind: 'setting', status: draft.trim() ? '已保存设定' : '设定为空' } : item),
  }));
  return <main className="director-stage setting-editor"><header><div><span>导演项目 · 剧本前置资料</span><h1>设定和小传</h1></div><button className="primary" onClick={save}><Save size={16}/> 保存设定</button></header><p>这里仅展示并编辑“第一集”标题之前的内容，不进行场景划分。</p><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="剧本第一集之前没有内容时，这里保持为空。" /></main>;
}

/* ================================================================
 * DirectorWorkspace - 主组件
 * ================================================================ */
export function DirectorWorkspace({ state, setState, api, onAttach }) {
  // 记住上次打开的项目与面板：离开导演工作台再回来时不再退回主页面。
  const [selectedProjectId, setSelectedProjectId] = useState(() => localStorage.getItem('xz-director-last-project') || null);
  const [activePane, setActivePane] = useState(() => localStorage.getItem('xz-director-last-pane') || 'master'); // 'master' | episodeId
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [cloudProjects, setCloudProjects] = useState([]);
  const [collaborationProjects, setCollaborationProjects] = useState([]);
  const [cloudManagerOpen, setCloudManagerOpen] = useState(false);
  const [isProducer, setIsProducer] = useState(false);
  const [collabTarget, setCollabTarget] = useState(null);
  const [masterDraft, setMasterDraft] = useState('');
  const [masterSaving, setMasterSaving] = useState(false);
  const [masterNotice, setMasterNotice] = useState('');
  const [addEpisodeOpen, setAddEpisodeOpen] = useState(false);
  const [newEpisodeContent, setNewEpisodeContent] = useState('');
  const [refreshingCloud, setRefreshingCloud] = useState(false);
  const [cloudRefreshNotice, setCloudRefreshNotice] = useState('');

  const directorProjects = (state.directorProjects || []).filter((project, index, projects) => projects.findIndex((candidate) => candidate.id === project.id || (project.cloudProjectId && candidate.cloudProjectId === project.cloudProjectId)) === index);
  const directorGroups = state.directorGroups || [];
  const scriptLibrary = state.scriptLibrary || [];
  const selectedProject = directorProjects.find((p) => p.id === selectedProjectId);

  // 记忆持久化：选中项目/面板变化时写入，项目已不存在时清理记忆避免卡在空白页。
  React.useEffect(() => {
    if (selectedProjectId && selectedProject) localStorage.setItem('xz-director-last-project', selectedProjectId);
    if (!selectedProjectId) localStorage.removeItem('xz-director-last-project');
  }, [selectedProjectId, selectedProject]);
  React.useEffect(() => {
    if (activePane) localStorage.setItem('xz-director-last-pane', activePane);
  }, [activePane]);
  React.useEffect(() => {
    if (selectedProjectId && directorProjects.length && !selectedProject) {
      localStorage.removeItem('xz-director-last-project');
      setSelectedProjectId(null);
    }
  }, [selectedProjectId, selectedProject, directorProjects.length]);
  const activeEpisode = selectedProject?.episodes?.find((ep) => ep.id === activePane);

  const loadCloudProjects = useCallback(async () => {
    try {
      const [rows, collaborationRows, producer] = await Promise.all([
        api.directorCollabListProjects(),
        api.collabListProjects?.() || Promise.resolve([]),
        api.collabIsProducer(),
      ]);
      setCloudProjects(rows || []);
      setCollaborationProjects((collaborationRows || []).filter((project) => !project.deleted_at));
      setIsProducer(producer);
    } catch { /* 网络短暂失败时保留现有云项目与本地投影 */ }
  }, [api]);
  React.useEffect(() => { loadCloudProjects(); }, [loadCloudProjects]);
  React.useEffect(() => { setState((s) => ({ ...s, directorProjects: reconcileDirectorCloudProjects(s.directorProjects || [], cloudProjects) })); }, [cloudProjects]);
  React.useEffect(() => {
    if (!collaborationProjects.length) return;
    const linked = new Map(collaborationProjects
      .filter((project) => project.director_project_id)
      .map((project) => [project.director_project_id, project.id]));
    setState((current) => ({
      ...current,
      directorProjects: (current.directorProjects || []).map((project) => linked.has(project.id)
        ? { ...project, collaborationProjectId: linked.get(project.id), groupId: 'director-cloud' }
        : project),
    }));
  }, [collaborationProjects]);
  const cloudForProject = (project) => cloudProjects.find((p) => p.id === project.cloudProjectId || p.analysis_output === project.id);
  const changeCollab = async (mode) => { if (!collabTarget) return; if (mode === 'create') { const dp = collabTarget.project; const episodes = dp.episodes || []; const cloud = await api.directorCollabCreateProject({ name: dp.name, directorProjectId: dp.id, script: dp.masterScript || '', episodes }); setState((s) => updateDirectorProject(s, dp.id, { cloudProjectId: cloud.id, cloudRole: 'producer' })); setCollabTarget({ project: { ...dp, cloudProjectId: cloud.id }, cloud: { ...cloud, locked: false } }); } await loadCloudProjects(); };
  React.useEffect(() => { if (!selectedProject?.cloudProjectId || selectedProject.cloudLocked) return; const timer = setTimeout(() => { api.directorCollabUpdateProject({ projectId: selectedProject.cloudProjectId, updates: { name: selectedProject.name, script: selectedProject.masterScript || '', episodes: selectedProject.episodes || [] } }).catch(() => {}); }, 900); return () => clearTimeout(timer); }, [selectedProject]);
  React.useEffect(() => { const timer = setInterval(loadCloudProjects, 12000); return () => clearInterval(timer); }, [loadCloudProjects]);
  const refreshDirectorCloud = async () => {
    if (!selectedProject?.cloudProjectId || refreshingCloud) return;
    setRefreshingCloud(true); setCloudRefreshNotice('');
    try {
      await loadCloudProjects();
      const cloud = await api.directorCollabGetProject({ projectId: selectedProject.cloudProjectId });
      // 双向合并：结构以云端为准，提示词按 id 取并集（对方生成的、我生成的都保留）
      const mergedEpisodes = mergeCloudEpisodes(selectedProject.episodes || [], cloud.episodes || []);
      setState((s) => updateDirectorProject(s, selectedProject.id, { name: cloud.name, masterScript: cloud.script || '', episodes: mergedEpisodes, cloudLocked: cloud.locked, cloudRole: cloud.myRole }));
      // 把合并结果推回云端，让双方看到同一份数据（锁定项目除外）
      if (!cloud.locked) await api.directorCollabUpdateProject({ projectId: selectedProject.cloudProjectId, updates: { episodes: mergedEpisodes } }).catch(() => {});
      setMasterDraft(cloud.script || ''); setMasterNotice('已刷新并合并云端项目'); setCloudRefreshNotice('已刷新并合并云端项目');
      setTimeout(() => setCloudRefreshNotice(''), 2400);
    } catch (error) {
      setCloudRefreshNotice(`刷新失败：${error.message || '网络连接异常'}`);
      setTimeout(() => setCloudRefreshNotice(''), 3600);
    } finally { setRefreshingCloud(false); }
  };

  // 处理打开项目
  const handleOpenProject = (id) => {
    setSelectedProjectId(id);
    const project = directorProjects.find((p) => p.id === id);
    setActivePane(project?.episodes?.[0]?.id || 'master');
    setMasterDraft(project?.masterScript || '');
  };

  const saveMasterScript = async () => {
    if (!selectedProject || masterSaving) return;
    setMasterSaving(true); setMasterNotice('');
    try {
      const sourceDraft = masterDraft.trim() ? masterDraft : selectedProject.masterScript || '';
      if (!sourceDraft.trim()) throw new Error('总剧本内容为空，未执行保存，原内容已保留。');
      const parsed = parseMasterScript(sourceDraft);
      const episodes = (parsed.episodes.length ? parsed.episodes : splitFullScript(sourceDraft).episodes).map((ep, i) => ({ id: selectedProject.episodes?.[i]?.id || `master-${Date.now()}-${i}`, title: ep.title, content: ep.content, kind: ep.kind || 'episode', prompts: selectedProject.episodes?.[i]?.prompts || [], status: selectedProject.episodes?.[i]?.status || (ep.kind === 'setting' ? '设定资料' : '待导演处理') }));
      setState((s) => updateDirectorProject(s, selectedProject.id, { masterScript: sourceDraft, episodes }));
      if (selectedProject.cloudProjectId) await api.directorCollabUpdateProject({ projectId: selectedProject.cloudProjectId, updates: { script: sourceDraft, episodes } });
      setMasterNotice(`已保存并重新识别 ${episodes.length} 集`);
    } catch (e) { setMasterNotice(`保存失败：${e.message}`); } finally { setMasterSaving(false); }
  };

  const addEpisodeFromDialog = async () => {
    if (!selectedProject || !newEpisodeContent.trim()) return;
    const number = (selectedProject.episodes || []).filter((episode) => episode.kind !== 'setting' && episode.title !== '设定和小传').length + 1;
    const baseScript = masterDraft.trim() ? masterDraft : (selectedProject.masterScript || '');
    const nextScript = `${baseScript.trim()}\n\n第 ${number} 集\n${newEpisodeContent.trim()}`.trim();
    setMasterDraft(nextScript); setAddEpisodeOpen(false); setNewEpisodeContent('');
    const parsed = parseMasterScript(nextScript);
    const episodes = (parsed.episodes.length ? parsed.episodes : splitFullScript(nextScript).episodes).map((ep, i) => ({ id: selectedProject.episodes?.[i]?.id || `master-${Date.now()}-${i}`, title: ep.title, content: ep.content, kind: ep.kind || 'episode', prompts: selectedProject.episodes?.[i]?.prompts || [], status: selectedProject.episodes?.[i]?.status || (ep.kind === 'setting' ? '设定资料' : '待导演处理') }));
    setState((s) => updateDirectorProject(s, selectedProject.id, { masterScript: nextScript, episodes }));
    if (selectedProject.cloudProjectId) await api.directorCollabUpdateProject({ projectId: selectedProject.cloudProjectId, updates: { script: nextScript, episodes } });
    setMasterNotice(`已添加并识别第 ${number} 集，共 ${episodes.length} 集`);
    setActivePane(episodes[episodes.length - 1]?.id || 'master');
  };

  // 处理上传剧本
  const handleUpload = async () => {
    if (!api.importFullScript) return;
    try {
      const result = await api.importFullScript();
      if (!result) return;

      const parsed = { ...parseMasterScript(result.content), masterScript: result.content, detected: true };
      const episodes = parsed.episodes.map((ep, i) => ({
        id: `import-${Date.now()}-${i}`,
        title: ep.title,
        content: ep.content,
        kind: ep.kind || 'episode',
        prompts: [],
        status: '待导演处理',
      }));

      const newProject = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: result.fileName.replace(/\.[^.]+$/, ''),
        sourceId: null,
        sourceType: 'upload',
        masterScript: parsed.masterScript,
        episodes,
        lastUsedSkill: '大师级提示词1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setState((s) => ({
        ...s,
        directorProjects: [{ ...newProject, groupId: 'director-workbench' }, ...s.directorProjects],
      }));
      setSelectedProjectId(newProject.id);
      setActivePane(newProject.episodes[0]?.id || 'master');
      setMasterDraft(newProject.masterScript || '');
      alert(parsed.detected ? `已识别并导入 ${episodes.length} 集。` : '未识别到明确分集标题，已作为第 1 集完整导入。');
    } catch (e) {
      alert(`导入失败：${e.message}`);
    }
  };

  // 处理从剧本库导入
  const handleImportLibrary = (libItem) => {
    const parsed = (() => {
      try {
        return { ...parseMasterScript(libItem.content), masterScript: libItem.content, detected: true };
      } catch {
        return { masterScript: libItem.content, detected: false, episodes: [{ title: '第 1 集', content: libItem.content }] };
      }
    })();

    const episodes = parsed.episodes.map((ep, i) => ({
      id: `lib-${Date.now()}-${i}`,
      title: ep.title,
      content: ep.content,
      kind: ep.kind || 'episode',
      prompts: [],
      status: '待导演处理',
    }));

    const newProject = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: libItem.name,
      sourceId: libItem.id,
      sourceType: 'library',
      masterScript: parsed.masterScript,
      episodes,
      lastUsedSkill: '大师级提示词1.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setState((s) => ({
      ...s,
      directorProjects: [{ ...newProject, groupId: 'director-workbench' }, ...s.directorProjects.filter((p) => p.name !== libItem.name)],
    }));
    setSelectedProjectId(newProject.id);
    setActivePane(newProject.episodes[0]?.id || 'master');
    setMasterDraft(newProject.masterScript || '');
  };

  // 处理添加分集
  const handleAddEpisode = () => {
    if (!selectedProject) return;
    setNewEpisodeContent(''); setAddEpisodeOpen(true);
  };

  // 处理删除项目
  const handleDeleteProject = async (id) => {
    const target = directorProjects.find((project) => project.id === id);
    if (target?.cloudProjectId) {
      try {
        await api.directorCollabDeleteProject({ projectId: target.cloudProjectId });
        setCloudProjects((rows) => rows.filter((row) => row.id !== target.cloudProjectId));
      } catch (error) {
        alert(`删除云端导演项目失败：${error.message || '网络连接异常'}`);
        return;
      }
    }
    setState((s) => ({
      ...s,
      directorProjects: s.directorProjects.filter((p) => p.id !== id && (!target?.cloudProjectId || p.cloudProjectId !== target.cloudProjectId)),
    }));
    if (selectedProjectId === id) {
      setSelectedProjectId(null);
      setActivePane('master');
    }
  };

  const handleDeleteCloudProject = async (cloudProject) => {
    try {
      await api.directorCollabDeleteProject({ projectId: cloudProject.id });
    } catch (error) {
      if (!String(error?.message || '').includes('director_project_not_found')) throw error;
    }
    setCloudProjects((rows) => rows.filter((row) => row.id !== cloudProject.id));
    setState((current) => ({ ...current, directorProjects: removeDirectorCloudProjection(current.directorProjects || [], cloudProject.id) }));
  };

  // 如果没有选中项目，显示项目选择页
  if (!selectedProject) {
    if (cloudManagerOpen) return <div className="director-shell"><DirectorCloudManager projects={cloudProjects} onBack={() => setCloudManagerOpen(false)} onDelete={handleDeleteCloudProject}/></div>;
    return (
      <div className="director-shell">
        <ProjectCards
          projects={directorProjects}
          groups={directorGroups}
          library={scriptLibrary}
          onOpen={handleOpenProject}
          onDelete={handleDeleteProject}
          onRename={(id, name) => setState((s) => updateDirectorProject(s, id, { name }))}
          onMoveToGroup={(id, groupId) => setState((s) => updateDirectorProject(s, id, { groupId }))}
          onCreateGroup={(name) => setState((s) => createDirectorGroup(s, name))}
          onRenameGroup={(id, name) => setState((s) => renameDirectorGroup(s, id, name))}
          onDeleteGroup={(id) => setState((s) => deleteDirectorGroup(s, id))}
          onImportLibrary={handleImportLibrary}
          onUpload={handleUpload}
          onManageCollab={(project) => setCollabTarget({ project, cloud: cloudForProject(project) })}
          canManageCollab={(project) => canManageDirectorCollab(project, isProducer)}
          canDeleteProject={(project) => !project.cloudProjectId}
          onOpenCloudManager={isProducer ? () => setCloudManagerOpen(true) : null}
        />
        {collabTarget && <DirectorCollabDialog project={collabTarget.project} cloudProject={collabTarget.cloud} canManage={isProducer && (!collabTarget.cloud || collabTarget.cloud.myRole === 'producer')} api={api} onClose={() => setCollabTarget(null)} onChanged={changeCollab} />}
      </div>
    );
  }

  // 渲染项目编辑视图
  return (
    <div className="director-shell">
      <DirectorRail
        project={selectedProject}
        active={activePane}
        setActive={setActivePane}
        onAdd={selectedProject.cloudLocked ? () => {} : handleAddEpisode}
        onDeleteEpisode={(episodeId) => setState((s) => deleteDirectorEpisode(s, selectedProject.id, episodeId))}
        onBack={() => { setSelectedProjectId(null); setActivePane('master'); }}
        kind="导演项目"
      />
      {activePane === 'master' ? (
        <main className={`director-master${selectedProject.cloudLocked ? ' cloud-project-locked' : ''}`}>
          {selectedProject.cloudLocked && <div className="cloud-project-lock-banner"><Lock size={16}/> 制片已锁定整个项目，当前仅可查看</div>}
          <header>
            <div className="master-title-tools">
              <span>导演项目 · 总剧本</span>
              <div><h1>{selectedProject.name}</h1>{selectedProject.cloudProjectId && <button className="director-cloud-refresh" onClick={refreshDirectorCloud} disabled={refreshingCloud}><RefreshCw size={15} className={refreshingCloud ? 'spin' : ''}/> {refreshingCloud ? '刷新中…' : '刷新云端'}</button>}{cloudRefreshNotice && <span className="director-refresh-notice">{cloudRefreshNotice}</span>}</div>
            </div>
            <div className="master-editor-toolbar"><button className="primary" onClick={saveMasterScript} disabled={selectedProject.cloudLocked || masterSaving}><Save size={16}/> {masterSaving ? '保存中…' : '保存总剧本'}</button><button className="secondary" onClick={() => onAttach?.({ name: `《${selectedProject.name}》总剧本`, content: masterDraft })}><Bot size={16} /> 添加到 AI 对话</button></div>
          </header>
          <textarea
            className="master-editor"
            value={masterDraft !== '' ? masterDraft : selectedProject.masterScript || ''}
            onChange={(e) => setMasterDraft(e.target.value)}
            readOnly={Boolean(selectedProject.cloudLocked)}
          />
          {masterNotice && <div className="collab-notice">{masterNotice}</div>}
        </main>
      ) : activeEpisode && (activeEpisode.kind === 'setting' || activeEpisode.title === '设定和小传') ? (
        <SettingEditor project={selectedProject} episode={activeEpisode} setState={setState}/>
      ) : activeEpisode ? (
        <EpisodeDirector
          project={selectedProject}
          episode={activeEpisode}
          episodeNumber={Math.max(1, (selectedProject.episodes || []).filter((episode) => episode.kind !== 'setting' && episode.title !== '设定和小传').findIndex((episode) => episode.id === activeEpisode.id) + 1)}
          state={state}
          setState={setState}
          api={api}
          onAttach={onAttach}
          onRefreshCloud={refreshDirectorCloud}
          refreshingCloud={refreshingCloud}
          cloudRefreshNotice={cloudRefreshNotice}
        />
      ) : null}

      {/* 添加集数弹窗：任何页面（总剧本/分集）点击“添加集数”都能立即弹出 */}
      {addEpisodeOpen && createPortal(<div className="veil"><div className="modal add-episode-dialog"><h2>添加第 {(selectedProject.episodes?.length || 0) + 1} 集</h2><p>填写本集内容，确认后会同步到总剧本并重新划分场景。</p><textarea value={newEpisodeContent} onChange={(e) => setNewEpisodeContent(e.target.value)} placeholder="请输入本集剧本内容…"/><div className="modal-actions"><button className="ghost" onClick={() => setAddEpisodeOpen(false)}>取消</button><button className="primary" disabled={!newEpisodeContent.trim()} onClick={addEpisodeFromDialog}>确定并识别</button></div></div></div>, document.body)}

      {/* 删除确认 */}
      <DeleteConfirm
        open={!!deleteTarget}
        title="删除导演项目"
        name={deleteTarget?.name}
        detail="项目中的分集和全部导演提示词都会删除。"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          handleDeleteProject(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

export default DirectorWorkspace;
