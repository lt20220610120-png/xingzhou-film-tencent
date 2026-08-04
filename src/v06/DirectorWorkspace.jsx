import React, { useState, useRef, useCallback } from 'react';
import {
  ArrowLeft, Upload, FileText, BookOpen, Plus, Trash2, Sparkles,
  Save, Bot, X, Check, Pin, Copy, RefreshCw, Film, PencilLine
} from 'lucide-react';
import { DeleteConfirm } from './DeleteConfirm.jsx';
import { ProjectCardHub } from './ProjectCardHub.jsx';
import {
  importDirectorProject, deleteDirectorProject, updateDirectorProject,
  createDirectorGroup, renameDirectorGroup, deleteDirectorGroup,
  addDirectorPrompt, updateDirectorEpisode, updateDirectorPrompt,
  PROJECT_STYLES, PROJECT_RATIOS,
  setDirectorProjectStyle, setDirectorProjectRatio, buildProjectPreamble
} from '../../core/projectStore.js';
import { splitFullScript, parseDirectorScenes } from '../../core/scriptImport.js';
import { getSceneVision, buildScenePromptRecords, buildNumberedSceneTasks, promptsForScene, splitNumberedPromptOutput } from '../../core/directorCreative.js';
import { executeSkillWithAi } from '../../core/skillExecution.js';
import { buildSkillManifest } from '../../core/skillContext.js';

/* ================================================================
 * ProjectCards - 导演工作台项目选择页
 * ================================================================ */
function ProjectCards({ projects, groups, library, onOpen, onDelete, onRename, onMoveToGroup, onCreateGroup, onRenameGroup, onDeleteGroup, onImportLibrary, onUpload }) {
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
    />
  );
}

/* ================================================================
 * DirectorRail - 左侧分集导航
 * ================================================================ */
function DirectorRail({ project, active, setActive, onAdd, onBack, kind }) {
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
          <span className="rail-index">{String(idx + 1).padStart(2, '0')}</span>
          <span>
            {ep.title}
            <small>{ep.status || '待导演处理'}</small>
          </span>
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
      <div className="prompt-label">{prompt.label || `提示词 ${index + 1}`}</div>
      {editing ? (
        <textarea className="prompt-edit-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={`编辑提示词 ${prompt.label}`} />
      ) : (
        <div className="prompt-content">{prompt.content}</div>
      )}
      <div className="prompt-actions">
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
function EpisodeDirector({ project, episode, index, state, setState, api, onAttach }) {
  const [mode, setMode] = useState('creative'); // 'creative' | 'quick'
  const [selectedSkillId, setSelectedSkillId] = useState(() => {
    try {
      const lastId = localStorage.getItem('xz-last-used-skill');
      return state.skills?.some((skill) => skill.id === lastId) ? lastId : state.skills?.[0]?.id || '';
    } catch { return state.skills?.[0]?.id || ''; }
  });
  const [running, setRunning] = useState(false);
  const [sceneInputs, setSceneInputs] = useState({}); // 快速模式下各场景的编辑框
  // 快速模式下选中的场景
  const [activeScene, setActiveScene] = useState(null);

  const skills = state.skills || [];
  const savedPrompts = episode.prompts || [];
  const currentSkill = skills.find((s) => s.id === selectedSkillId);

  const segments = parseDirectorScenes(episode.content, index + 1);
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
        label: `${index + 1}-${part.label}`,
        content: part.content,
        skill: currentSkill?.name || '',
        createdAt: new Date().toISOString(),
      }));
      const updatedPrompts = [...(episode.prompts || []), ...newPrompts];
      setState((s) => updateDirectorEpisode(s, project.id, episode.id, {
        prompts: updatedPrompts,
        status: '已生成提示词',
      }));
    } catch (e) {
      console.error('Skill 运行失败:', e);
    } finally {
      setRunning(false);
    }
  };

  const runCreativeScene = async (sceneLabel) => {
    if (running || !currentSkill) return;
    const scene = segments.find((item) => item.label === sceneLabel);
    const vision = getSceneVision(episode, sceneLabel);
    if (!scene?.content?.trim() || !vision.trim()) return;
    setRunning(true);
    try {
      if (currentSkill.id) localStorage.setItem('xz-last-used-skill', currentSkill.id);
      const preamble = buildProjectPreamble(project);
      const sourceText = `${preamble ? `${preamble}\n\n` : ''}【剧本场景 ${sceneLabel}】\n${scene.content}\n\n【导演构想】\n${vision}`;
      const result = await executeSkillWithAi({ api, state, skillId: currentSkill.id, input: sourceText, assistantRole: '行舟影视导演提示词助手' });
      const outputParts = splitNumberedPromptOutput(result.output);
      const newPrompts = buildScenePromptRecords({
        sceneLabel,
        parts: outputParts,
        existing: episode.prompts || [],
        skill: currentSkill?.name || '',
        sourceText,
      });
      const updatedPrompts = [...(episode.prompts || []), ...newPrompts];
      setState((s) => updateDirectorEpisode(s, project.id, episode.id, {
        prompts: updatedPrompts,
        sceneVisions: episode.sceneVisions || {},
        status: '已生成提示词',
        lastUsedSkill: currentSkill?.name || '',
      }));
    } catch (error) {
      console.error('创造模式运行失败:', error);
    } finally {
      setRunning(false);
    }
  };

  // 快速模式：保存当前场景编辑并运行 Skill（同样先读取项目风格与画幅）
  const runQuickScene = async (sceneLabel) => {
    if (running || !currentSkill) return;
    const inputText = sceneInputs[sceneLabel] !== undefined
      ? sceneInputs[sceneLabel]
      : (episode.quickSceneEdits?.[sceneLabel] ?? segments.find((s) => s.label === sceneLabel)?.content);
    if (!inputText?.trim()) return;
    setRunning(true);
    try {
      const skillId = currentSkill?.id;
      if (skillId) localStorage.setItem('xz-last-used-skill', skillId);
      const preamble = buildProjectPreamble(project);
      const tasks = buildNumberedSceneTasks(inputText, sceneLabel);
      const generatedParts = [];
      for (const task of tasks) {
        const taskInput = preamble ? `${preamble}\n\n${task.input}` : task.input;
        const result = await executeSkillWithAi({ api, state, skillId, input: taskInput, assistantRole: '行舟影视导演提示词助手' });
        const parsed = splitNumberedPromptOutput(result.output);
        if (parsed.length === 1) {
          const rawContent = parsed[0].content || result.output;
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
      const updatedPrompts = [...(episode.prompts || []), ...newPrompts];
      setState((s) => updateDirectorEpisode(s, project.id, episode.id, {
        prompts: updatedPrompts,
        quickSceneEdits: { ...(episode.quickSceneEdits || {}), [sceneLabel]: inputText },
        status: '已生成提示词',
        lastUsedSkill: currentSkill?.name || '',
      }));
    } catch (e) {
      console.error('快速模式运行失败:', e);
    } finally {
      setRunning(false);
    }
  };

  const handleSavePrompt = (promptId) => {
    const filtered = savedPrompts.filter((p) => p.id !== promptId);
    setState((s) => updateDirectorEpisode(s, project.id, episode.id, {
      prompts: filtered,
    }));
  };

  const handleEditPrompt = (promptId, content) => {
    setState((s) => updateDirectorPrompt(s, project.id, episode.id, promptId, {
      content: content.trim(),
      editedAt: new Date().toISOString(),
    }));
  };

  // 获取当前选中场景的已生成提示词
  const scenePrompts = currentScene ? promptsForScene(savedPrompts, currentScene) : [];

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
              <button className="primary" onClick={() => runCreativeScene(currentScene)} disabled={running || !currentVision.trim() || !currentSkill}>
                <Sparkles size={16}/> {running ? '生成中…' : `生成场景 ${currentScene} 提示词`}
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
                      disabled={running || !currentSceneContent?.trim() || !currentSkill}
                    >
                      <Sparkles size={14} /> {running ? '生成中…' : '生成'}
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
            {scenePrompts.length > 0 ? (
              <div className="prompt-list compact">
                {scenePrompts.map((prompt, i) => (
                  <PromptCard key={prompt.id} prompt={prompt} index={i} onDelete={handleSavePrompt} onEdit={handleEditPrompt} />
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
    </main>
  );
}

/* ================================================================
 * DirectorWorkspace - 导演工作台主组件
 * ================================================================ */
export function DirectorWorkspace({ state, setState, api, onAttach }) {
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [activePane, setActivePane] = useState('master'); // 'master' | episodeId
  const [deleteTarget, setDeleteTarget] = useState(null);

  const directorProjects = state.directorProjects || [];
  const directorGroups = state.directorGroups || [];
  const scriptLibrary = state.scriptLibrary || [];
  const selectedProject = directorProjects.find((p) => p.id === selectedProjectId);
  const activeEpisode = selectedProject?.episodes?.find((ep) => ep.id === activePane);

  // 处理打开项目
  const handleOpenProject = (id) => {
    setSelectedProjectId(id);
    const project = directorProjects.find((p) => p.id === id);
    setActivePane(project?.episodes?.[0]?.id || 'master');
  };

  // 处理上传剧本
  const handleUpload = async () => {
    if (!api.importFullScript) return;
    try {
      const result = await api.importFullScript();
      if (!result) return;

      const parsed = splitFullScript(result.content);
      const episodes = parsed.episodes.map((ep, i) => ({
        id: `import-${Date.now()}-${i}`,
        title: ep.title,
        content: ep.content,
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
        directorProjects: [newProject, ...s.directorProjects],
      }));
      setSelectedProjectId(newProject.id);
      setActivePane(newProject.episodes[0]?.id || 'master');
      alert(parsed.detected ? `已识别并导入 ${episodes.length} 集。` : '未识别到明确分集标题，已作为第 1 集完整导入。');
    } catch (e) {
      alert(`导入失败：${e.message}`);
    }
  };

  // 处理从剧本库导入
  const handleImportLibrary = (libItem) => {
    const parsed = (() => {
      try {
        return splitFullScript(libItem.content);
      } catch {
        return { masterScript: libItem.content, detected: false, episodes: [{ title: '第 1 集', content: libItem.content }] };
      }
    })();

    const episodes = parsed.episodes.map((ep, i) => ({
      id: `lib-${Date.now()}-${i}`,
      title: ep.title,
      content: ep.content,
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
      directorProjects: [newProject, ...s.directorProjects.filter((p) => p.name !== libItem.name)],
    }));
    setSelectedProjectId(newProject.id);
    setActivePane(newProject.episodes[0]?.id || 'master');
  };

  // 处理添加分集
  const handleAddEpisode = () => {
    if (!selectedProject) return;
    const newEp = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title: `第 ${(selectedProject.episodes?.length || 0) + 1} 集`,
      content: '',
      prompts: [],
      status: '待导演处理',
    };
    setState((s) => {
      const updated = s.directorProjects.map((p) =>
        p.id === selectedProject.id
          ? { ...p, episodes: [...p.episodes, newEp], updatedAt: new Date().toISOString() }
          : p
      );
      return { ...s, directorProjects: updated };
    });
    setActivePane(newEp.id);
  };

  // 处理删除项目
  const handleDeleteProject = (id) => {
    setState((s) => ({
      ...s,
      directorProjects: s.directorProjects.filter((p) => p.id !== id),
    }));
    if (selectedProjectId === id) {
      setSelectedProjectId(null);
      setActivePane('master');
    }
  };

  // 如果没有选中项目，显示项目选择页
  if (!selectedProject) {
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
        />
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
        onAdd={handleAddEpisode}
        onBack={() => { setSelectedProjectId(null); setActivePane('master'); }}
        kind="导演项目"
      />

      {activePane === 'master' ? (
        <main className="director-master">
          <header>
            <div>
              <span>导演项目 · 总剧本</span>
              <h1>{selectedProject.name}</h1>
            </div>
            <button
              className="secondary"
              onClick={() => onAttach?.({ name: `《${selectedProject.name}》总剧本`, content: selectedProject.masterScript })}
            >
              <Bot size={16} /> 添加到 AI 对话
            </button>
          </header>
          <textarea
            className="master-editor"
            value={selectedProject.masterScript || ''}
            onChange={(e) => setState((s) => {
              const updated = s.directorProjects.map((p) =>
                p.id === selectedProject.id ? { ...p, masterScript: e.target.value } : p
              );
              return { ...s, directorProjects: updated };
            })}
            readOnly={false}
          />
        </main>
      ) : activeEpisode ? (
        <EpisodeDirector
          project={selectedProject}
          episode={activeEpisode}
          index={Math.max(0, selectedProject.episodes?.indexOf(activeEpisode) || 0)}
          state={state}
          setState={setState}
          api={api}
          onAttach={onAttach}
        />
      ) : null}

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
