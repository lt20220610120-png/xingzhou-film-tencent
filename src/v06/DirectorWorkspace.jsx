import {ModelSelect,useWindowModel} from './ModelSelect.jsx';
import {Dialog} from './GlobalTools.jsx';
import {threeWayMerge} from '../../core/threeWayMerge.js';
import React, { useState, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import { directorJobs } from '../../core/backgroundJobs.js';
import { createPortal } from 'react-dom';
import { readRemembered, useRememberedState } from '../useRememberedState.js';
import {
  ArrowLeft, Upload, FileText, BookOpen, Plus, Trash2, Sparkles,
  Save, Bot, X, Check, Pin, Copy, RefreshCw, Film, PencilLine, Users, Lock, Unlock, Cloud, AlertTriangle
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
  setDirectorProjectStyle, setDirectorProjectRatio, buildProjectPreamble, displayProjectStyle
} from '../../core/projectStore.js';
import { splitFullScript, parseMasterScript, parseDirectorScenes, replaceMasterSetting } from '../../core/scriptImport.js';
import { getSceneVision, buildScenePromptRecords, buildNumberedSceneTasks, buildWholeSceneSubmission, promptsForScene, creativePromptsForScene, splitNumberedPromptOutput } from '../../core/directorCreative.js';
import { executeSkillWithAi } from '../../core/skillExecution.js';
import { buildSkillManifest } from '../../core/skillContext.js';
import { reconcileDirectorCloudProjects, removeDirectorCloudProjection, canManageDirectorCollab, mergeCloudEpisodes } from '../../core/directorCloudProjects.js';
import { DirectorQuickControls, DirectorQuickProgress } from './DirectorQuickControls.jsx';
import { DirectorBatchPanel } from './DirectorBatchPanel.jsx';
import { renderNumberedScene } from '../../core/directorSegmentation.js';
import { isQuickRunActive } from '../../core/directorQuickGeneration.js';
import { reconcileDirectorEpisodes } from '../../core/directorEpisodeReconcile.js';
import { directorSettingsHash } from '../../core/directorQuickStore.js';

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
      <div className="project-directory-fixed">
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

      </div>
      <div className="project-directory-scroll">
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
      </div>
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
        <div className="prompt-identity"><div className="prompt-label">{prompt.label || `提示词 ${index + 1}`}</div>
          {prompt.recommendedDurationSeconds&&<span className={`prompt-duration${prompt.durationStatus==='needs-review'?' needs-review':''}`} title={prompt.durationCompression ? '整场自然表演预计略超过30秒，按紧凑节奏生成30秒视频，保留完整剧情和台词。' : '按当前内容估算；实际生成请结合所选视频模型的可选时长。'}>建议生成时长 {prompt.recommendedDurationSeconds} 秒{prompt.durationStatus==='needs-review'?' · 时长待复核':''}</span>}
          {prompt.durationCompression&&Number.isFinite(prompt.naturalEstimatedSeconds)&&<small className="prompt-duration-compression">自然预计 {Math.round(prompt.naturalEstimatedSeconds*10)/10} 秒 · 紧凑节奏</small>}
          {prompt.generationRunId&&<small className="prompt-generation-batch">{new Date(prompt.createdAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} 批次</small>}
          {prompt.sceneAuditStatus==='pending'&&<small className="prompt-generation-batch">已保存 · 整场核对中</small>}
          {prompt.sceneAuditStatus==='warning'&&<small className="prompt-generation-batch prompt-audit-warning">已保存 · 整场核对有提醒</small>}
        </div>
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
      {prompt.sceneAuditStatus==='warning'&&<details className="quick-run-warning"><summary>查看核对提醒 · 提示词已保留</summary>{(prompt.sceneAuditWarnings||[]).map((item,i)=><div key={i}><p>{item.segmentIndex?`第 ${item.segmentIndex} 条：`:''}{item.message}</p>{Array.isArray(item.evidence?.expected)&&Array.isArray(item.evidence?.actual)&&<div className="prompt-review-comparison"><small>原文台词</small><pre>{item.evidence.expected.join('\n')}</pre><small>生成台词</small><pre>{item.evidence.actual.join('\n')}</pre></div>}</div>)}</details>}
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
function DirectorCloudNotice({ notice }) {
  if (!notice) return null;
  const raw = String(notice);
  const conflict = /冲突|同时被修改|版本.*不一致/i.test(raw);
  const failure = conflict || /error|失败|异常|无法|denied|forbidden/i.test(raw);
  const withoutInvocation = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '');
  const message = conflict
    ? '剧本在本机和云端都被修改，本地草稿已保留。请刷新云端并核对版本。'
    : /[\u3400-\u9fff]/.test(withoutInvocation)
      ? withoutInvocation.replace(/文档\/script/g, '剧本文档')
      : failure ? '云端同步未完成，请刷新云端后重试。' : raw;
  return <section className={`director-cloud-notice ${failure ? 'warning' : 'success'}`} role={failure ? 'alert' : 'status'}>
    {failure ? <AlertTriangle size={16}/> : <Cloud size={16}/>}
    <div><strong>{conflict ? '云端同步存在冲突' : failure ? '云端同步未完成' : '云端同步'}</strong><p>{message}</p>
      {failure && <details><summary>技术详情</summary><pre>{raw}</pre></details>}
    </div>
  </section>;
}

function EpisodeDirector({ project, episode, episodeNumber, state, setState, api, onAttach, onRefreshCloud, refreshingCloud, cloudRefreshNotice, accountId, quickGeneration,onJumpToScene }) {
  const [directorModelId,setDirectorModelId,directorProfile]=useWindowModel(`director-model:${accountId}:${project.id}:${episode.id}`,state.apiProfiles||[],state.activeApiId);
  const [savedMode, setMode] = useRememberedState(`xz-director-mode:${accountId}:${project.id}`, readRemembered('xz-director-mode', 'creative'));
  const mode = ['creative', 'quick', 'history'].includes(savedMode) ? savedMode : 'creative';
  const [selectedSkillId, setSelectedSkillId] = useState(() => {
    try {
      const lastId = localStorage.getItem('xz-last-used-skill');
      return state.skills?.some((skill) => skill.id === lastId) ? lastId : state.skills?.[0]?.id || '';
    } catch { return state.skills?.[0]?.id || ''; }
  });
  useSyncExternalStore(directorJobs.subscribe, directorJobs.snapshot);
  const jobPrefix = JSON.stringify([accountId,project.id,episode.id]);
  const jobKey = label => `${jobPrefix}:${label}`;
  const running = directorJobs.get(jobKey('whole'))?.status === 'running';
  const setRunning = on => on ? directorJobs.start(jobKey('whole')) : directorJobs.get(jobKey('whole'))?.status === 'running' && directorJobs.finish(jobKey('whole'));
  // 并发生成：每个场景独立的运行状态，可同时对多个场景发起生成
  const runningScenes = new Set(directorJobs.entries().filter(([key,job])=>key.startsWith(jobPrefix+':')&&job.status==='running').map(([key])=>key.slice(jobPrefix.length+1)));
  const markSceneRunning = (label,on) => on ? directorJobs.start(jobKey(label),{model:directorProfile?.model}) : directorJobs.get(jobKey(label))?.status === 'running' && directorJobs.finish(jobKey(label));
  const isSceneRunning = label => directorJobs.get(jobKey(label))?.status === 'running';
  const generationErrors = directorJobs.entries().filter(([key,job])=>key.startsWith(jobPrefix+':')&&job.status==='failed');
  const sceneInputs = episode.quickSceneEdits || {};
  const saveQuickScene = (sceneLabel, content) => setState((s) => updateDirectorEpisode(s, project.id, episode.id, (current) => ({
    quickSceneEdits: { ...(current.quickSceneEdits || {}), [sceneLabel]: content },
  })));
  // 快速模式下选中的场景
  const [activeScene, setActiveScene] = useRememberedState(`xz-director-scene:${accountId}:${project.id}:${episode.id}`, null);
  const promptCardRefs = useRef({});
  const [promptSelectionOpen, setPromptSelectionOpen] = useState(false);
  const [selectedPromptIds, setSelectedPromptIds] = useState(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const skills = state.skills || [];
  const savedPrompts = episode.prompts || [];
  const currentSkill = skills.find((s) => s.id === selectedSkillId);

  const segments = parseDirectorScenes(episode.content, episodeNumber);
  // 快速模式自动选中第一个场景
  const currentScene = segments.some((scene) => scene.label === activeScene) ? activeScene : segments[0]?.label || null;
  const currentSceneContent = currentScene
    ? (sceneInputs[currentScene] !== undefined
      ? sceneInputs[currentScene]
      : (episode.quickSceneEdits?.[currentScene] ?? segments.find((s) => s.label === currentScene)?.content ?? ''))
    : '';
  const currentVision = currentScene ? getSceneVision(episode, currentScene) : '';
  const [settingsJson,setSettingsJson]=useRememberedState(`xz-director-quick-settings:${accountId}:${project.id}`,JSON.stringify({segmentationMode:'manual',maxDurationSeconds:30}));
  let quickSettings;try{quickSettings=JSON.parse(settingsJson);}catch{quickSettings={};}
  quickSettings={segmentationMode:quickSettings.segmentationMode==='auto'?'auto':'manual',maxDurationSeconds:Number.isInteger(quickSettings.maxDurationSeconds)&&quickSettings.maxDurationSeconds>=0&&quickSettings.maxDurationSeconds<=35?quickSettings.maxDurationSeconds:30};
  const [sourceView,setSourceView]=useState('source');
  const manualOutputKey = sceneLabel => `xz-director-manual-output:${accountId}:${project.id}:${episode.id}:${sceneLabel}`;
  const [manualOutputRevision,setManualOutputRevision]=useState(0);
  const manualOutputs=(()=>{try{return JSON.parse(localStorage.getItem(manualOutputKey(currentScene))||'[]');}catch{return [];}})();
  const [autoError,setAutoError]=useState('');
  const localRun=quickGeneration?.getSceneRun(project.id,episode.id,currentScene);
  const savedPlan=episode.quickScenePlans?.find(p=>p.id===episode.activeQuickScenePlanIds?.[currentScene]);
  const autoRun=localRun||(savedPlan?{id:savedPlan.id,phase:'completed',plan:savedPlan,segmentDrafts:{}}:null);
  const autoBusy=isQuickRunActive(localRun);
  const batchBusy=quickGeneration?.isProjectBatchActive(project.id);
  const autoStale=Boolean(autoRun?.plan&&(autoRun.plan.sourceSnapshot!==currentSceneContent||autoRun.plan.settingsHash!==directorSettingsHash({project,episode,maxDurationSeconds:autoRun.plan.maxDurationSeconds})));
  const autoSceneText=autoRun?.plan?renderNumberedScene(autoRun.plan,{sceneHeader:autoRun.plan.sceneHeader,sourceText:autoRun.plan.sourceText}):'';
  const runAutoScene=async()=>{
    setAutoError('');
    try{
      if(!quickGeneration||!directorProfile||!currentSkill)throw new Error('请先选择有效的模型和 Skill');
      if(isSceneRunning(currentScene))throw new Error('当前场景正在生成，请等待完成');
      await quickGeneration.startScene({project,episode,sceneLabel:currentScene,inputText:currentSceneContent,maxDurationSeconds:quickSettings.maxDurationSeconds,skill:currentSkill,profile:directorProfile});
    }catch(e){setAutoError(e.message);}
  };
  const resumeAutoScene=async()=>{setAutoError('');try{await quickGeneration.resume(localRun.id);}catch(e){setAutoError(e.message);}};
  useEffect(()=>{setSourceView('source');setAutoError('');},[currentScene]);

  const saveSceneVision = (sceneLabel, content) => {
    setState((s) => updateDirectorEpisode(s, project.id, episode.id, {
      sceneVisions: { ...(episode.sceneVisions || {}), [sceneLabel]: content },
      status: content.trim() ? '导演构想中' : episode.status,
    }));
  };

  // 运行 Skill 生成提示词（大模型先读取项目风格与画幅，再执行 Skill）
  const runSkill = async (inputText, title) => {
    if (!inputText?.trim() || directorJobs.get(jobKey('whole'))?.status === 'running' || !currentSkill) return;
    setRunning(true);
    try {
      const skillId = currentSkill?.id;
      if (skillId) localStorage.setItem('xz-last-used-skill', skillId);
      const preamble = buildProjectPreamble(project);
      const finalInput = preamble ? `${preamble}\n\n${inputText}` : inputText;
      const result = await executeSkillWithAi({ api, state, profile:directorProfile||{}, skillId, input: finalInput, assistantRole: '行舟影视导演提示词助手' });
      const outputParts = splitNumberedPromptOutput(result.output);
      const newPrompts = outputParts.map((part, i) => ({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        label: `${episodeNumber}-${part.label}`,
        content: part.content,
        skill: currentSkill?.name || '',
        generationMode: 'quick',
        createdAt: new Date().toISOString(),
      }));
      // 在 setState 回调中基于最新状态追加，避免并发生成/云端轮询相互覆盖
      setState((s) => appendDirectorPromptHistory(appendDirectorEpisodePrompts(s, project.id, episode.id, newPrompts, {
        status: '已生成提示词',
      }), project.id, newPrompts));
    } catch (e) {
      directorJobs.finish(jobKey('whole'),e.message || '生成失败');
      console.error('Skill 运行失败:', e);
    } finally {
      setRunning(false);
    }
  };

  const runCreativeScene = async (sceneLabel) => {
    if (isSceneRunning(sceneLabel) || isQuickRunActive(quickGeneration?.getSceneRun(project.id,episode.id,sceneLabel)) || !currentSkill) return;
    const scene = segments.find((item) => item.label === sceneLabel);
    const vision = getSceneVision(episode, sceneLabel);
    // 创造模式只依据可编辑的“导演构想”生成，不读取左侧只读剧本展示框。
    if (!vision.trim()) return;
    markSceneRunning(sceneLabel, true);
    try {
      if (currentSkill.id) localStorage.setItem('xz-last-used-skill', currentSkill.id);
      const preamble = buildProjectPreamble(project);
      const sourceText = `${preamble ? `${preamble}\n\n` : ''}【导演构想】\n${vision}`;
      const result = await executeSkillWithAi({ api, state, profile:directorProfile||{}, skillId: currentSkill.id, input: sourceText, assistantRole: '行舟影视导演提示词助手' });
      const outputParts = splitNumberedPromptOutput(result.output);
      const newPrompts = buildScenePromptRecords({
        sceneLabel,
        parts: outputParts,
        generationMode: 'creative',
        existing: episode.prompts || [],
        skill: currentSkill?.name || '',
        sourceText,
      });
      setState((s) => appendDirectorPromptHistory(appendDirectorEpisodePrompts(s, project.id, episode.id, newPrompts, {
        status: '已生成提示词',
        lastUsedSkill: currentSkill?.name || '',
      }), project.id, newPrompts));
    } catch (error) {
      directorJobs.finish(jobKey(sceneLabel),error.message || '生成失败');
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
      const sourceText = preamble ? `${preamble}\n\n${inputText}` : inputText;
      // 括号划分提交时段；整场一次预演与一次输出，不拆成独立请求。
      const result = await executeSkillWithAi({ api, state, profile:directorProfile||{}, skillId,
        input: buildWholeSceneSubmission({ sourceText, expectedLabels: tasks.map(task => task.label) }),
        assistantRole: '行舟影视导演提示词助手', requestOptions: {maxOutputTokens:32768} });
      // Keep the paid whole-scene reply even when its numbering needs review.
      const replyKey=manualOutputKey(sceneLabel);
      const replies=JSON.parse(localStorage.getItem(replyKey)||'[]');
      localStorage.setItem(replyKey,JSON.stringify([...replies,{output:result.output,sourceText,skillId,profileId:directorProfile?.id,createdAt:new Date().toISOString()}]));
      setManualOutputRevision(value=>value+1);
      const parsed = splitNumberedPromptOutput(result.output);
      if (parsed.length !== tasks.length) throw new Error(`整场应输出 ${tasks.length} 条提示词，接口返回 ${parsed.length} 条，请检查完整回包后重试。`);
      const generatedParts = parsed.map((part,index)=>{
        const label=tasks[index].label;
        if (/^\d+-\d+-\d+$/.test(part.label)&&part.label!==label) throw new Error(`整场输出编号 ${part.label} 与原分段 ${label} 不一致`);
        if (!/^\d+-\d+-\d+$/.test(part.label)&&part.label!==label.split('-').at(-1)) throw new Error(`整场括号编号 ${part.label} 与原分段 ${label} 不一致`);
        const hasCanonicalLabel=/^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\d+-\d+-\d+(?:\*\*|__)?\s*$/.test(part.content.split('\n',1)[0]);
        return {label,content:hasCanonicalLabel?part.content:`${label}\n${part.content}`};
      });
      const newPrompts = buildScenePromptRecords({
        sceneLabel,
        parts: generatedParts,
        generationMode: 'quick',
        existing: episode.prompts || [],
        skill: currentSkill?.name || '',
        sourceText,
      });
      setState((s) => appendDirectorPromptHistory(appendDirectorEpisodePrompts(s, project.id, episode.id, newPrompts, {
        status: '已生成提示词',
        lastUsedSkill: currentSkill?.name || '',
      }), project.id, newPrompts));
    } catch (e) {
      directorJobs.finish(jobKey(sceneLabel),e.message || '生成失败');
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
  const creativeScenePrompts = currentScene ? creativePromptsForScene(savedPrompts, currentScene) : [];
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
      {runningScenes.size>0&&<div className="collab-notice" role="status">本集有 {runningScenes.size} 个任务正在生成，切换分集或工作台后会继续，结果自动保存。</div>}
      {generationErrors.map(([key,job])=><div key={key} className="collab-error" role="alert">{key.slice(jobPrefix.length+1)}：{job.error}</div>)}
      {/* 头部 */}
      <header className="director-workspace-header">
        <p className="director-episode-caption">导演项目 · {episode.title}</p>
        <div className="director-workspace-toolbar">
          <div className="mode-switch" aria-label="导演模式">
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
          </div>
          <div className="editor-head-actions">
            {project.cloudProjectId && <button className="secondary director-cloud-refresh" onClick={onRefreshCloud} disabled={refreshingCloud}><RefreshCw size={15} className={refreshingCloud ? 'spin' : ''}/> {refreshingCloud ? '刷新中…' : '刷新云端'}</button>}
          <button
            className="secondary ai-button"
            onClick={() => onAttach?.(buildAiContextForEpisode())}
          >
            <Bot size={17} /> 添加到 AI 对话
          </button>
          </div>
        </div>
      </header>
      <DirectorCloudNotice notice={cloudRefreshNotice}/>

      <section className="director-config-rack" aria-label="提示词模型与项目设定">
      <ModelSelect profiles={state.apiProfiles||[]} value={directorModelId} onChange={setDirectorModelId} label="本集提示词模型"/>
      {/* 项目设定功能区：风格与画幅（创造/快速模式共用，运行 Skill 前优先注入给大模型） */}
      <div className="project-style-bar">
        <div className="style-bar-label"><Film size={15} /> 项目设定</div>
        <div className="style-bar-group">
          <span>风格</span>
          {PROJECT_STYLES.map((s) => (
            <button
              key={s}
              className={`style-chip ${displayProjectStyle(project.style) === s ? 'active' : ''}`}
              aria-pressed={displayProjectStyle(project.style) === s}
              onClick={() => setState((st) => setDirectorProjectStyle(st, project.id, displayProjectStyle(project.style) === s ? '' : s))}
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
              aria-pressed={(project.aspectRatio || '') === r}
              onClick={() => setState((st) => setDirectorProjectRatio(st, project.id, project.aspectRatio === r ? '' : r))}
            >
              {r}
            </button>
          ))}
        </div>
        <small className="style-bar-hint">
          {project.style || project.aspectRatio
            ? `已设定：${[displayProjectStyle(project.style), project.aspectRatio].filter(Boolean).join(' · ')}。生成前优先读取项目设定。`
            : '生成前优先读取项目风格与画幅。'}
        </small>
      </div>
      </section>

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
              <div className="prompt-list-title"><Save size={16}/> 场景 {currentScene} · 创造模式提示词（{creativeScenePrompts.length} 条）</div>
              {creativeScenePrompts.length ? <div className="director-prompt-grid">{creativeScenePrompts.map((prompt, i) => <PromptCard key={prompt.id} prompt={prompt} index={i} onDelete={handleSavePrompt} onEdit={handleEditPrompt}/>)}</div> : (
                <div className="no-prompts"><Bot size={30}/><p>填写导演构想并运行 Skill，生成结果会按 {currentScene}-1、{currentScene}-2… 命名。</p></div>
              )}
            </section>
          </section>
        </div>
      )}

      {/* 快速模式：场景导航下方，原文与提示词使用等高双栏。 */}
      {mode === 'quick' && (
        <div className="quick-mode-container">
          {quickSettings.segmentationMode==='auto'&&<DirectorBatchPanel key={`${accountId}:${project.id}`} project={project} accountId={accountId} skill={currentSkill} profile={directorProfile} maxDurationSeconds={quickSettings.maxDurationSeconds} quickGeneration={quickGeneration} disabled={Boolean(project.cloudLocked)||project.canWrite===false} onJump={(episodeId,sceneLabel)=>{if(episodeId===episode.id)setActiveScene(sceneLabel);else onJumpToScene?.(episodeId,sceneLabel);}}/>}
          {/* 左栏：场景列表 */}
          <nav className="quick-scene-rail">
            <div className="quick-scene-rail-title">本集场景 <span>{segments.length} 场</span></div>
            <div className="director-scene-strip">
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
            </div>
          </nav>

          {/* 中栏：选中场景的可编辑卡片 */}
          <section className="quick-scene-editor">
            {currentScene ? (
              <div className="quick-scene-card">
                <div className="quick-scene-card-head">
                  <span className="scene-card-badge">场景 {currentScene}</span>
                  <DirectorQuickControls settings={quickSettings} onSettingsChange={value=>{setSettingsJson(JSON.stringify(value));setSourceView('source');}} />
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
                      onClick={() => quickSettings.segmentationMode==='auto'?runAutoScene():runQuickScene(currentScene)}
                      disabled={isSceneRunning(currentScene) || autoBusy || batchBusy || !currentSceneContent?.trim() || !currentSkill || Boolean(project.cloudLocked)}
                    >
                      <Sparkles size={14} /> {isSceneRunning(currentScene)||autoBusy ? '生成中…' : '生成'}
                    </button>
                  </div>
                </div>
                {quickSettings.segmentationMode==='auto'&&<DirectorQuickProgress run={autoRun} onStop={()=>quickGeneration.stop(localRun.id).catch(e=>setAutoError(e.message))} onResume={resumeAutoScene} sourceView={sourceView} onSourceViewChange={setSourceView} stale={autoStale} error={autoError||quickGeneration?.restoreError} />}
                {quickSettings.segmentationMode==='manual'&&manualOutputs.length>0&&<details className="quick-draft-preview quick-manual-replies" key={`${currentScene}:${manualOutputRevision}`}><summary>查看已保存的整场原始回包（{manualOutputs.length} 次）</summary>{manualOutputs.map((reply,index)=><pre key={index}>{reply.output}</pre>)}</details>}
                <textarea
                  className="quick-scene-textarea"
                  value={quickSettings.segmentationMode==='auto'&&sourceView==='plan'?autoSceneText:currentSceneContent}
                  readOnly={Boolean(project.cloudLocked)||(quickSettings.segmentationMode==='auto'&&sourceView==='plan')}
                  onChange={(e) => saveQuickScene(currentScene, e.target.value)}
                  placeholder={`编辑场景 ${currentScene} 的剧本内容……`}
                />
                <div className="quick-scene-info">
                  <small>{quickSettings.segmentationMode==='auto'?'原文修改自动保存 · 自动分段稿另存，建议时长按内容估算。':'修改自动保存 · 切换场景或功能区后继续编辑。可用（1）（2）（3）划分提示词。'}</small>
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
            <div className="quick-prompts-info"><small>{scenePrompts.length?`已保存 ${scenePrompts.length} 条提示词 · 切换场景后可继续查看。`:'生成的提示词会先保存并展示在此处，核对结果另作提醒。'}</small></div>
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
          <div className="prompt-list director-prompt-grid">
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
export function DirectorWorkspace({ state, setState, api, onAttach, accountId = 'local', quickGeneration, active = true }) {
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
  const cloudActiveRef = useRef(active), cloudRequestRef = useRef(0);
  cloudActiveRef.current = active;

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
    if (selectedProjectId && activePane) localStorage.setItem(`xz-director-pane:${accountId}:${selectedProjectId}`, activePane);
  }, [activePane, selectedProjectId, accountId]);
  React.useEffect(() => {
    if (selectedProjectId && directorProjects.length && !selectedProject) {
      localStorage.removeItem('xz-director-last-project');
      setSelectedProjectId(null);
    }
  }, [selectedProjectId, selectedProject, directorProjects.length]);
  const activeEpisode = selectedProject?.episodes?.find((ep) => ep.id === activePane);

  const loadCloudProjects = useCallback(async () => {
    if (!cloudActiveRef.current) return;
    const requestId = ++cloudRequestRef.current;
    try {
      const [rows, collaborationRows, producer] = await Promise.all([
        api.directorCollabListProjects(),
        api.collabListProjects?.() || Promise.resolve([]),
        api.collabIsProducer(),
      ]);
      if (!cloudActiveRef.current || requestId !== cloudRequestRef.current) return;
      setCloudProjects(rows || []);
      setCollaborationProjects((collaborationRows || []).filter((project) => !project.deleted_at));
      setIsProducer(producer);
    } catch { /* 网络短暂失败时保留现有云项目与本地投影 */ }
  }, [api]);
  React.useEffect(() => {
    if (!active) return;
    loadCloudProjects();
    const timer = setInterval(loadCloudProjects, 12000);
    return () => { clearInterval(timer); cloudRequestRef.current += 1; };
  }, [active, loadCloudProjects]);
  React.useEffect(() => { if(quickGeneration?.isCloudSaving())return; setState((s) => ({ ...s, directorProjects: reconcileDirectorCloudProjects(s.directorProjects || [], cloudProjects) })); }, [cloudProjects]);
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
  const refreshDirectorCloud = async () => {
    if (!selectedProject?.cloudProjectId || refreshingCloud) return;
    setRefreshingCloud(true); setCloudRefreshNotice('');
    try {
      await loadCloudProjects();
      const cloud = await api.directorCollabGetProject({ projectId: selectedProject.cloudProjectId });
      setState(current=>({...current,directorProjects:reconcileDirectorCloudProjects(current.directorProjects||[],[cloud])}));
      setCloudRefreshNotice('已读取云端更新，本地未保存的修改已保留。');
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
    const lastPane = readRemembered(`xz-director-pane:${accountId}:${id}`, null);
    setActivePane(lastPane === 'master' || project?.episodes?.some((ep) => ep.id === lastPane) ? lastPane : project?.episodes?.[0]?.id || 'master');
    setMasterDraft(project?.masterScript || '');
  };

  const saveMasterScript = async () => {
    if (!selectedProject || masterSaving) return;
    setMasterSaving(true); setMasterNotice('');
    try {
      const sourceDraft = masterDraft.trim() ? masterDraft : selectedProject.masterScript || '';
      if (!sourceDraft.trim()) throw new Error('总剧本内容为空，未执行保存，原内容已保留。');
      const parsed = parseMasterScript(sourceDraft);
      const {episodes} = reconcileDirectorEpisodes(selectedProject.episodes||[],parsed.episodes.length?parsed.episodes:splitFullScript(sourceDraft).episodes);
      setState((s) => updateDirectorProject(s, selectedProject.id, { masterScript: sourceDraft, episodes }));
      // The shared autosave acknowledges this snapshot and preserves subsequent edits.
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
    const {episodes} = reconcileDirectorEpisodes(selectedProject.episodes||[],parsed.episodes.length?parsed.episodes:splitFullScript(nextScript).episodes);
    setState((s) => updateDirectorProject(s, selectedProject.id, { masterScript: nextScript, episodes }));
    // Cloud synchronization uses the same serialized autosave as prompt editing.
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

  const resolveCloudConflict=choice=>{
    const remote=selectedProject.cloudRemote;
    const local={name:selectedProject.name,script:selectedProject.masterScript||'',episodes:selectedProject.episodes||[]};
    localStorage.setItem(`xz-director-conflict-backup:${selectedProject.id}`,JSON.stringify(local));
    const merged=threeWayMerge(selectedProject.cloudBase,local,remote,'文档',choice);
    setState(current=>updateDirectorProject(current,selectedProject.id,{name:merged.name,masterScript:merged.script,episodes:merged.episodes,cloudBase:remote,cloudConflict:''}));
    setMasterDraft(merged.script);
  };
  // 渲染项目编辑视图
  return (
    <div className="director-shell">
      {selectedProject.cloudConflict&&<Dialog open title="导演项目存在协作冲突" onClose={()=>{}}><p>{selectedProject.cloudConflict}</p><p>本地版本已保留；其他不冲突的修改会自动合并。</p><details><summary>查看云端文档</summary><textarea readOnly value={JSON.stringify(selectedProject.cloudRemote,null,2)}/></details><button className="secondary" onClick={()=>resolveCloudConflict('remote')}>冲突处采用云端内容</button><button className="primary" onClick={()=>resolveCloudConflict('local')}>冲突处保留我的内容</button></Dialog>}
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
          key={`${selectedProject.id}:${activeEpisode.id}`}
          accountId={accountId}
          quickGeneration={quickGeneration}
          onJumpToScene={(episodeId,sceneLabel)=>{localStorage.setItem(`xz-director-scene:${accountId}:${selectedProject.id}:${episodeId}`,sceneLabel);setActivePane(episodeId);}}
          project={selectedProject}
          episode={activeEpisode}
          episodeNumber={Math.max(1, (selectedProject.episodes || []).filter((episode) => episode.kind !== 'setting' && episode.title !== '设定和小传').findIndex((episode) => episode.id === activeEpisode.id) + 1)}
          state={state}
          setState={setState}
          api={api}
          onAttach={onAttach}
          onRefreshCloud={refreshDirectorCloud}
          refreshingCloud={refreshingCloud}
          cloudRefreshNotice={cloudRefreshNotice||selectedProject.cloudSyncError}
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
