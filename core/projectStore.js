// ============================================================
// projectStore.js — 行舟影视 领域逻辑
// 所有函数均为纯函数：接收 state，返回新的 state（浅拷贝）
// ============================================================

// ---------- 工具函数 ----------
let _uidCounter = 0;
export const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${_uidCounter++}`;
export const now = () => new Date().toISOString();

export const DIRECTOR_FIXED_GROUPS = [
  { id: 'director-workbench', name: '工作台', fixed: true },
  { id: 'director-library', name: '内容创作者·剧本库', fixed: true },
  { id: 'director-cloud', name: '云端', fixed: true },
];

const directorGroupId = (project, customIds) => {
  if (project.cloudProjectId || project.collaborationProjectId || project.sourceType === 'cloud') return 'director-cloud';
  return customIds.has(project.groupId) ? project.groupId : 'director-workbench';
};

// ---------- 初始状态 ----------
export const createInitialState = () => ({
  fruitProjects: [],       // 果子库
  fruitGroups: [],         // 果子项目分组
  scriptProjects: [],      // 创作剧本
  scriptGroups: [],        // 剧本创作项目分组
  scriptLibrary: [],       // 剧本库
  directorProjects: [],    // 导演模式
  directorGroups: [],      // 导演项目分组
  skills: [],              // 技能
  apiProfiles: [],         // API配置
  canvases: [],            // 画布
  mediaProfiles: [],       // 图片/视频生成 API 配置
  chatSessions: [],        // 聊天会话
  activeApiId: null,
  activeCanvasId: null,
  activeImageApiId: null,
  activeVideoApiId: null,
  activeChatId: null,
});

export const normalizeState = (partial) => {
  const d = createInitialState();
  const merged = { ...d, ...(partial || {}) };
  const arrayKeys = ['fruitProjects', 'fruitGroups', 'scriptProjects', 'scriptGroups', 'scriptLibrary', 'directorProjects', 'directorGroups', 'skills', 'apiProfiles', 'canvases', 'mediaProfiles', 'chatSessions'];
  for (const key of arrayKeys) {
    if (!Array.isArray(merged[key])) merged[key] = [];
  }
  const customGroups = merged.directorGroups.filter((group) => group && !DIRECTOR_FIXED_GROUPS.some((fixed) => fixed.id === group.id));
  const customIds = new Set(customGroups.map((group) => group.id));
  return {
    ...merged,
    directorGroups: [...DIRECTOR_FIXED_GROUPS.map((group) => ({ ...group })), ...customGroups],
    directorProjects: merged.directorProjects.filter(Boolean).map((project) => ({ ...project, groupId: directorGroupId(project, customIds) })),
  };
};

export const mergePersistedState = (current, saved) => {
  if (!saved) return normalizeState(current);
  const local = normalizeState(current);
  const disk = normalizeState(saved);
  const byId = new Map((disk.directorProjects || []).map((project) => [project.id, project]));
  for (const project of local.directorProjects || []) {
    const existing = byId.get(project.id);
    const localTime = Date.parse(project.updatedAt || project.createdAt || 0) || 0;
    const diskTime = Date.parse(existing?.updatedAt || existing?.createdAt || 0) || 0;
    if (!existing || localTime > diskTime) byId.set(project.id, project);
  }
  return normalizeState({ ...disk, directorProjects: [...byId.values()] });
};

// ---------- 通用不可变更新辅助 ----------
const updateInArray = (arr, id, updater) =>
  arr.map(item => item.id === id ? { ...item, ...updater(item) } : item);

const removeFromArray = (arr, id) => arr.filter(item => item.id !== id);

// ==============================
//  果子库 (FruitProject) CRUD
// ==============================

export const createProject = (state, name) => {
  const id = uid();
  const ts = now();
  const project = {
    id,
    name,
    rating: 0,
    episodes: [],
    masterScript: '',
    createdAt: ts,
    updatedAt: ts,
  };
  return { ...state, fruitProjects: [...state.fruitProjects, project] };
};

export const addEpisode = (state, projectId, episodeData) => {
  const idx = state.fruitProjects.findIndex(p => p.id === projectId);
  if (idx === -1) return state;
  const ep = {
    id: uid(),
    title: episodeData.title || '',
    inputType: episodeData.inputType || 'txt',
    fileName: episodeData.fileName || '',
    rawText: episodeData.rawText || '',
    scriptText: episodeData.scriptText || '',
    selectedSkill: episodeData.selectedSkill || '',
    status: episodeData.status || 'pending',
  };
  const projects = state.fruitProjects.map((p, i) =>
    i === idx ? { ...p, episodes: [...p.episodes, ep], updatedAt: now() } : p
  );
  return { ...state, fruitProjects: projects };
};

export const updateEpisode = (state, projectId, episodeId, updates) => {
  const pIdx = state.fruitProjects.findIndex(p => p.id === projectId);
  if (pIdx === -1) return state;
  const projects = state.fruitProjects.map((p, i) => {
    if (i !== pIdx) return p;
    const episodes = p.episodes.map(e =>
      e.id === episodeId ? { ...e, ...updates } : e
    );
    return { ...p, episodes, updatedAt: now() };
  });
  return { ...state, fruitProjects: projects };
};

export const setRating = (state, projectId, rating) => {
  const projects = state.fruitProjects.map(p =>
    p.id === projectId ? { ...p, rating, updatedAt: now() } : p
  );
  return { ...state, fruitProjects: projects };
};

export const deleteFruitProject = (state, projectId) => ({
  ...state,
  fruitProjects: state.fruitProjects.filter(p => p.id !== projectId),
});

const groupKeys = { fruit: ['fruitGroups', 'fruitProjects'], script: ['scriptGroups', 'scriptProjects'] };
export const createProjectGroup = (state, kind, name) => {
  const [groupsKey] = groupKeys[kind] || [];
  if (!groupsKey) return state;
  const groups = state[groupsKey] || [];
  const group = { id: uid(), name: name?.trim() || `分组 ${groups.length + 1}`, createdAt: now(), updatedAt: now() };
  return { ...state, [groupsKey]: [...groups, group] };
};
export const renameProjectGroup = (state, kind, groupId, name) => {
  const [groupsKey] = groupKeys[kind] || [];
  if (!groupsKey) return state;
  return { ...state, [groupsKey]: (state[groupsKey] || []).map(group => group.id === groupId ? { ...group, name: name.trim(), updatedAt: now() } : group) };
};
export const deleteProjectGroup = (state, kind, groupId) => {
  const [groupsKey, projectsKey] = groupKeys[kind] || [];
  if (!groupsKey) return state;
  return {
    ...state,
    [groupsKey]: (state[groupsKey] || []).filter(group => group.id !== groupId),
    [projectsKey]: (state[projectsKey] || []).map(project => project.groupId === groupId ? { ...project, groupId: null, updatedAt: now() } : project),
  };
};
export const organizeProject = (state, kind, projectId, updates) => {
  const [, projectsKey] = groupKeys[kind] || [];
  if (!projectsKey) return state;
  return { ...state, [projectsKey]: (state[projectsKey] || []).map(project => project.id === projectId ? { ...project, ...updates, updatedAt: now() } : project) };
};

export const compileFruitProject = (state, projectId) => {
  const projects = state.fruitProjects.map(p => {
    if (p.id !== projectId) return p;
    const masterScript = p.episodes
      .map((ep, i) => `【${ep.title || `第${i + 1}集`}】\n${ep.scriptText}`)
      .join('\n\n---\n\n');
    return { ...p, masterScript, updatedAt: now() };
  });
  return { ...state, fruitProjects: projects };
};

export const exportFruitTxt = (state, projectId) => {
  const project = state.fruitProjects.find(p => p.id === projectId);
  if (!project) return '';
  let out = `# ${project.name}\n\n评分: ${'⭐'.repeat(project.rating)}\n\n`;
  out += project.masterScript || project.episodes
    .map((ep, i) => `【${ep.title || `第${i + 1}集`}】\n${ep.scriptText}`)
    .join('\n\n---\n\n');
  return out;
};

// ==============================
//  创作剧本 (ScriptProject) CRUD
// ==============================

export const createScriptProject = (state, name, mode = 'rewrite') => {
  const ts = now();
  const project = {
    id: uid(),
    name,
    mode,
    attachments: [],
    episodes: [],
    finalScript: '',
    createdAt: ts,
    updatedAt: ts,
  };
  return { ...state, scriptProjects: [...state.scriptProjects, project] };
};

export const deleteScriptProject = (state, projectId) => ({
  ...state,
  scriptProjects: state.scriptProjects.filter(p => p.id !== projectId),
});

export const updateScriptProject = (state, projectId, updates) => {
  const projects = state.scriptProjects.map(p =>
    p.id === projectId ? { ...p, ...updates, updatedAt: now() } : p
  );
  return { ...state, scriptProjects: projects };
};

export const addScriptEpisode = (state, projectId, episodeData) => {
  const idx = state.scriptProjects.findIndex(p => p.id === projectId);
  if (idx === -1) return state;
  const ep = {
    id: uid(),
    title: episodeData.title || '',
    content: episodeData.content || '',
    selectedSkill: episodeData.selectedSkill || '',
    result: episodeData.result || '',
    status: episodeData.status || 'pending',
  };
  const projects = state.scriptProjects.map((p, i) =>
    i === idx ? { ...p, episodes: [...p.episodes, ep], updatedAt: now() } : p
  );
  return { ...state, scriptProjects: projects };
};

export const updateScriptEpisode = (state, projectId, episodeId, updates) => {
  const pIdx = state.scriptProjects.findIndex(p => p.id === projectId);
  if (pIdx === -1) return state;
  const projects = state.scriptProjects.map((p, i) => {
    if (i !== pIdx) return p;
    const episodes = p.episodes.map(e =>
      e.id === episodeId ? { ...e, ...updates } : e
    );
    return { ...p, episodes, updatedAt: now() };
  });
  return { ...state, scriptProjects: projects };
};

export const compileScriptProject = (state, projectId) => {
  const projects = state.scriptProjects.map(p => {
    if (p.id !== projectId) return p;
    const finalScript = p.episodes
      .map((ep, i) => `【${ep.title || `第${i + 1}集`}】\n${ep.result}`)
      .join('\n\n---\n\n');
    return { ...p, finalScript, updatedAt: now() };
  });
  return { ...state, scriptProjects: projects };
};

export const exportScriptTxt = (state, projectId) => {
  const project = state.scriptProjects.find(p => p.id === projectId);
  if (!project) return '';
  let out = `# ${project.name}\n模式: ${project.mode === 'rewrite' ? '改编' : '原创'}\n\n`;
  out += project.finalScript || project.episodes
    .map((ep, i) => `【${ep.title || `第${i + 1}集`}】\n${ep.result}`)
    .join('\n\n---\n\n');
  return out;
};

// ==============================
//  剧本库 (Script Library)
// ==============================

export const archiveScript = (state, name, sourceMode, content) => ({
  ...state,
  scriptLibrary: [
    ...state.scriptLibrary,
    { id: uid(), name, sourceMode, content, createdAt: now() },
  ],
});

export const deleteScriptLibraryItem = (state, id) => ({
  ...state,
  scriptLibrary: state.scriptLibrary.filter(item => item.id !== id),
});

// ==============================
//  Skills CRUD
// ==============================

export const addSkill = (state, nameOrSkill, type, content) => {
  const input = typeof nameOrSkill === 'object' && nameOrSkill !== null
    ? nameOrSkill
    : { name: nameOrSkill, type, content };
  const ts = now();
  const skill = {
    id: uid(),
    name: input.name,
    description: input.description || '',
    type: input.type || 'custom',
    content: input.content || '',
    files: Array.isArray(input.files) ? input.files : [],
    importMethod: input.importMethod || 'manual',
    sourceName: input.sourceName || '',
    createdAt: ts,
    updatedAt: ts,
  };
  return { ...state, skills: [...state.skills, skill] };
};

export const updateSkill = (state, skillId, updates) => ({
  ...state,
  skills: state.skills.map(s =>
    s.id === skillId ? { ...s, ...updates, updatedAt: now() } : s
  ),
});

export const removeSkill = (state, skillId) => ({
  ...state,
  skills: state.skills.filter(s => s.id !== skillId),
});

// ==============================
//  项目风格与画幅（导演工作台）
// ==============================

export const PROJECT_STYLES = ['真人电影集', '3DCG动漫', '2D动漫'];
export const PROJECT_RATIOS = ['9:16', '16:9'];

export const setDirectorProjectStyle = (state, projectId, style) => ({
  ...state,
  directorProjects: state.directorProjects.map(p =>
    p.id === projectId ? { ...p, style, updatedAt: now() } : p
  ),
});

export const setDirectorProjectRatio = (state, projectId, aspectRatio) => ({
  ...state,
  directorProjects: state.directorProjects.map(p =>
    p.id === projectId ? { ...p, aspectRatio, updatedAt: now() } : p
  ),
});

// 生成"项目设定"前置声明：在 Skill 运行前，先让大模型读取项目的风格与画幅
export const buildProjectPreamble = (project) => {
  if (!project) return '';
  const style = project.style || '';
  const ratio = project.aspectRatio || '';
  if (!style && !ratio) return '';
  const lines = ['【项目设定 · 请先读取】'];
  if (style) lines.push(`本项目风格：${style}`);
  if (ratio) lines.push(`本项目画幅：${ratio}`);
  lines.push('生成的所有提示词必须严格符合上述风格与画幅设定。');
  return lines.join('\n');
};

export const runSkillTransform = (state, skillId, text) => {
  const skill = state.skills.find(s => s.id === skillId);
  if (!skill) return text;
  // 此处在实际应用中会调用AI进行变换，这里返回带标记的结果
  if (text.length > 1) {
    // 模拟 AI 变换：返回分段的提示词
    return {
      output: `(1)全景\n基于"${text.slice(0, 30)}..."的场景描述：镜头从远景推进，展现角色与环境的关系，强调氛围和空间感。\n\n(2)近景\n聚焦角色的面部表情和微动作，通过光线变化表达情绪转折。\n\n(3)特写\n关键道具或动作的特写镜头，为后续剧情发展埋下伏笔。`,
      meta: { skillId, tokenEstimate: Math.ceil(text.length / 3.5) }
    };
  }
  return {
    output: `[${skill.name}]: ${text}`,
    meta: { skillId }
  };
};

// ==============================
//  API Profiles CRUD
// ==============================

export const addApiProfile = (state, name, provider, endpoint, model, apiKey) => ({
  ...state,
  apiProfiles: [
    ...state.apiProfiles,
    { id: uid(), name, provider, endpoint, model, apiKey, createdAt: now(), updatedAt: now() },
  ],
});

export const updateApiProfile = (state, profileId, updates) => ({
  ...state,
  apiProfiles: state.apiProfiles.map(a =>
    a.id === profileId ? { ...a, ...updates, updatedAt: now() } : a
  ),
});

export const setActiveApi = (state, profileId) => ({
  ...state,
  activeApiId: profileId,
});

export const removeApiProfile = (state, profileId) => ({
  ...state,
  apiProfiles: state.apiProfiles.filter(a => a.id !== profileId),
  activeApiId: state.activeApiId === profileId ? null : state.activeApiId,
});

// ==============================
//  导演模式 (DirectorProject) CRUD
// ==============================

export const importDirectorProject = (state, sourceId, sourceType, masterScript) => {
  const sourceProject =
    sourceType === 'fruit'
      ? state.fruitProjects.find(p => p.id === sourceId)
      : state.scriptProjects.find(p => p.id === sourceId);

  let episodes = sourceProject
    ? sourceProject.episodes.map(ep => ({
        id: uid(),
        title: ep.title || '',
        content: ep.scriptText || ep.content || '',
        prompts: [],
        status: 'pending',
      }))
    : [];

  // 如果源项目没有分集，则从 masterScript 创建一个默认分集
  if (episodes.length === 0 && masterScript) {
    episodes = [{
      id: uid(),
      title: '完整剧本',
      content: masterScript,
      prompts: [],
      status: 'pending',
    }];
  }

  const project = {
    id: uid(),
    name: sourceProject ? sourceProject.name : '',
    sourceId,
    sourceType,
    masterScript: masterScript || '',
    episodes,
    createdAt: now(),
    updatedAt: now(),
  };
  return { ...state, directorProjects: [...state.directorProjects, project] };
};

export const deleteDirectorProject = (state, projectId) => ({
  ...state,
  directorProjects: state.directorProjects.filter(p => p.id !== projectId),
});

export const updateDirectorProject = (state, projectId, updates) => ({
  ...state,
  directorProjects: state.directorProjects.map(project =>
    project.id === projectId ? { ...project, ...updates, updatedAt: now() } : project
  ),
});

export const createDirectorGroup = (state, name) => {
  const groups = (state.directorGroups || []).filter((group) => !group.fixed);
  const group = {
    id: uid(),
    name: name?.trim() || `分组 ${groups.length + 1}`,
    createdAt: now(),
    updatedAt: now(),
  };
  return { ...state, directorGroups: [...DIRECTOR_FIXED_GROUPS.map((fixed) => ({ ...fixed })), ...groups, group] };
};

export const renameDirectorGroup = (state, groupId, name) => ({
  ...state,
  directorGroups: (state.directorGroups || []).map(group =>
    group.id === groupId && !group.fixed ? { ...group, name: name.trim(), updatedAt: now() } : group
  ),
});

export const deleteDirectorGroup = (state, groupId) => ({
  ...state,
  directorGroups: (state.directorGroups || []).filter(group => group.id !== groupId || group.fixed),
  directorProjects: state.directorProjects.map(project =>
    project.groupId === groupId ? { ...project, groupId: 'director-workbench', updatedAt: now() } : project
  ),
});

export const updateDirectorEpisode = (state, projectId, episodeId, updates) => {
  const pIdx = state.directorProjects.findIndex(p => p.id === projectId);
  if (pIdx === -1) return state;
  const projects = state.directorProjects.map((p, i) => {
    if (i !== pIdx) return p;
    const episodes = p.episodes.map(e =>
      e.id === episodeId ? { ...e, ...updates } : e
    );
    return { ...p, episodes, updatedAt: now() };
  });
  return { ...state, directorProjects: projects };
};

// 仅移除导演工作台分集视图，总剧本 masterScript 保持不变。
export const deleteDirectorEpisode = (state, projectId, episodeId) => ({
  ...state,
  directorProjects: state.directorProjects.map((project) => project.id === projectId
    ? { ...project, episodes: project.episodes.filter((episode) => episode.id !== episodeId), updatedAt: now() }
    : project),
});

export const addDirectorPrompt = (state, projectId, episodeId, promptData) => {
  const pIdx = state.directorProjects.findIndex(p => p.id === projectId);
  if (pIdx === -1) return state;
  const prompt = {
    id: uid(),
    label: promptData.label || '',
    draft: '',
    output: '',
    skillName: '',
    createdAt: now(),
  };
  const projects = state.directorProjects.map((p, i) => {
    if (i !== pIdx) return p;
    const episodes = p.episodes.map(e =>
      e.id === episodeId ? { ...e, prompts: [...e.prompts, prompt] } : e
    );
    return { ...p, episodes, updatedAt: now() };
  });
  return { ...state, directorProjects: projects };
};

export const updateDirectorPrompt = (state, projectId, episodeId, promptId, updates) => {
  const pIdx = state.directorProjects.findIndex(p => p.id === projectId);
  if (pIdx === -1) return state;
  const projects = state.directorProjects.map((p, i) => {
    if (i !== pIdx) return p;
    const episodes = p.episodes.map(e => {
      if (e.id !== episodeId) return e;
      const prompts = e.prompts.map(pr =>
        pr.id === promptId ? { ...pr, ...updates } : pr
      );
      return { ...e, prompts };
    });
    const promptHistory = (p.promptHistory || []).map((pr) =>
      pr.id === promptId ? { ...pr, ...updates } : pr
    );
    return { ...p, episodes, promptHistory, updatedAt: now() };
  });
  return { ...state, directorProjects: projects };
};

// ---------- 历史提示词（项目级，独立于分集；修改总剧本/添加集数不会丢失） ----------
// 原子追加分集提示词：在 setState 回调内基于最新状态合并，按 id 去重，
// 支持并发生成与云端轮询同时进行而互不覆盖。
export const appendDirectorEpisodePrompts = (state, projectId, episodeId, newPrompts, extraUpdates = {}) => ({
  ...state,
  directorProjects: state.directorProjects.map((project) => {
    if (project.id !== projectId) return project;
    const episodes = (project.episodes || []).map((episode) => {
      if (episode.id !== episodeId) return episode;
      const tombstones = episode.deletedPromptIds || [];
      const seen = new Set((episode.prompts || []).map((item) => item.id));
      const added = (newPrompts || []).filter((item) => item && item.id && !seen.has(item.id) && !tombstones.includes(item.id));
      return { ...episode, ...extraUpdates, prompts: [...(episode.prompts || []), ...added] };
    });
    return { ...project, episodes, updatedAt: now() };
  }),
});

// 汇总项目的历史提示词：promptHistory 为主，同时并入当前各分集尚未入册的提示词（老项目回填）。
export const collectDirectorPromptHistory = (project) => {
  const map = new Map();
  for (const item of project?.promptHistory || []) if (item && item.id) map.set(item.id, item);
  for (const episode of project?.episodes || []) {
    for (const prompt of episode?.prompts || []) {
      if (prompt && prompt.id && !map.has(prompt.id)) map.set(prompt.id, prompt);
    }
  }
  return [...map.values()];
};

// 生成提示词后调用：把新提示词（连同尚未入册的旧提示词）写入项目级历史。
export const appendDirectorPromptHistory = (state, projectId, prompts) => ({
  ...state,
  directorProjects: state.directorProjects.map((project) => {
    if (project.id !== projectId) return project;
    const existing = collectDirectorPromptHistory(project);
    const seen = new Set(existing.map((item) => item.id));
    const added = (prompts || []).filter((item) => item && item.id && !seen.has(item.id));
    return { ...project, promptHistory: [...existing, ...added], updatedAt: now() };
  }),
});

// 用户手动删除提示词：同时从历史提示词与所有分集中移除，并在分集留下墓碑
// （deletedPromptIds），云端合并时不会让已删除的提示词复活。
export const deleteDirectorPromptsEverywhere = (state, projectId, promptIds) => {
  const ids = new Set(promptIds || []);
  return {
    ...state,
    directorProjects: state.directorProjects.map((project) => project.id === projectId
      ? {
          ...project,
          promptHistory: collectDirectorPromptHistory(project).filter((item) => !ids.has(item.id)),
          episodes: (project.episodes || []).map((episode) => {
            const removed = (episode.prompts || []).filter((item) => ids.has(item.id)).map((item) => item.id);
            return {
              ...episode,
              prompts: (episode.prompts || []).filter((item) => !ids.has(item.id)),
              deletedPromptIds: removed.length ? [...new Set([...(episode.deletedPromptIds || []), ...removed])] : (episode.deletedPromptIds || []),
            };
          }),
          updatedAt: now(),
        }
      : project),
  };
};

// 在历史提示词中编辑：同步更新历史与仍挂在分集上的同一条提示词。
export const updateDirectorPromptEverywhere = (state, projectId, promptId, updates) => ({
  ...state,
  directorProjects: state.directorProjects.map((project) => project.id === projectId
    ? {
        ...project,
        promptHistory: collectDirectorPromptHistory(project).map((item) => item.id === promptId ? { ...item, ...updates } : item),
        episodes: (project.episodes || []).map((episode) => ({
          ...episode,
          prompts: (episode.prompts || []).map((item) => item.id === promptId ? { ...item, ...updates } : item),
        })),
        updatedAt: now(),
      }
    : project),
});

// 按提示词编号首段（集数）分组：卡片“1”囊括 1-1-1、1-2-4、1-5-9……
export const groupDirectorPromptHistory = (prompts) => {
  const groups = new Map();
  for (const prompt of prompts || []) {
    const match = String(prompt?.label || '').trim().match(/^(\d+)/);
    const key = match ? match[1] : '未编号';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(prompt);
  }
  const byLabel = (a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'zh-CN', { numeric: true });
  return [...groups.entries()]
    .sort((a, b) => {
      const na = Number(a[0]); const nb = Number(b[0]);
      if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
      if (Number.isNaN(na)) return 1;
      if (Number.isNaN(nb)) return -1;
      return na - nb;
    })
    .map(([key, items]) => ({ key, prompts: [...items].sort(byLabel) }));
};

// 导出整个项目的历史提示词为文档文本（带 x-x-x 标题：集数-场景-第几条）。
export const buildPromptHistoryExport = (project) => {
  const groups = groupDirectorPromptHistory(collectDirectorPromptHistory(project));
  const lines = [`《${project?.name || '未命名项目'}》提示词导出`, ''];
  for (const group of groups) {
    for (const prompt of group.prompts) {
      lines.push(`【${prompt.label || '未编号'}】`);
      lines.push(String(prompt.content || '').trim());
      lines.push('');
    }
  }
  return lines.join('\n');
};

// 导出单个集数分组的提示词文本。
export const buildPromptGroupExport = (project, group) => {
  const title = group.key === '未编号' ? '未编号提示词' : `第 ${group.key} 集`;
  const lines = [`《${project?.name || '未命名项目'}》${title} 提示词导出`, ''];
  for (const prompt of group.prompts) {
    lines.push(`【${prompt.label || '未编号'}】`);
    lines.push(String(prompt.content || '').trim());
    lines.push('');
  }
  return lines.join('\n');
};

export const deleteDirectorPrompt = (state, projectId, episodeId, promptId) => {
  const pIdx = state.directorProjects.findIndex(p => p.id === projectId);
  if (pIdx === -1) return state;
  const projects = state.directorProjects.map((p, i) => {
    if (i !== pIdx) return p;
    const episodes = p.episodes.map(e =>
      e.id === episodeId
        ? { ...e, prompts: e.prompts.filter(pr => pr.id !== promptId) }
        : e
    );
    return { ...p, episodes, updatedAt: now() };
  });
  return { ...state, directorProjects: projects };
};

// ==============================
//  聊天会话 (ChatSession) CRUD
// ==============================

export const createChatSession = (state, title) => {
  const session = {
    id: uid(),
    title: title || '新会话',
    pinned: false,
    messages: [],
    createdAt: now(),
    updatedAt: now(),
  };
  return { ...state, chatSessions: [...state.chatSessions, session] };
};

export const addChatMessage = (state, sessionId, role, content) => {
  const idx = state.chatSessions.findIndex(s => s.id === sessionId);
  if (idx === -1) return state;
  const msg = { id: uid(), role, content, createdAt: now() };
  const sessions = state.chatSessions.map((s, i) =>
    i === idx ? { ...s, messages: [...s.messages, msg], updatedAt: now() } : s
  );
  return { ...state, chatSessions: sessions };
};

export const toggleChatPin = (state, sessionId) => ({
  ...state,
  chatSessions: state.chatSessions.map(s =>
    s.id === sessionId ? { ...s, pinned: !s.pinned, updatedAt: now() } : s
  ),
});

export const deleteChatSession = (state, sessionId) => ({
  ...state,
  chatSessions: state.chatSessions.filter(s => s.id !== sessionId),
  activeChatId: state.activeChatId === sessionId ? null : state.activeChatId,
});

export const cleanupChatSessions = (state) => ({
  ...state,
  chatSessions: state.chatSessions.filter(s => s.messages.length > 0),
});

export const setActiveChat = (state, sessionId) => ({
  ...state,
  activeChatId: sessionId,
});

// ==============================
//  字符统计
// ==============================

export const countTextChars = (text) => {
  if (text == null) return 0;
  return [...String(text)].length;
};

// ==============================
//  AI上下文构建
// ==============================

export const buildAiContext = (state, projectId, opts = {}) => {
  const { episodeIds, kind = 'fruit' } = opts;
  const project = state.fruitProjects.find(p => p.id === projectId);
  if (!project) return '';

  // 如果指定了 episodeIds（多集选择）
  if (episodeIds && episodeIds.length > 0) {
    const eps = project.episodes.filter(e => episodeIds.includes(e.id));
    if (eps.length === 0) return `项目: ${project.name}`;
    return [
      `项目: ${project.name}`,
      `选中集数: ${eps.map(e => e.title).join('、')}`,
      eps.map((ep, i) =>
        `第${i + 1}集 ${ep.title}: ${kind === 'fruit' ? (ep.scriptText || ep.rawText) : (ep.result || ep.content)}`
      ).join('\n'),
    ].join('\n\n');
  }

  return [
    `项目: ${project.name}`,
    project.masterScript
      ? `完整剧本:\n${project.masterScript}`
      : project.episodes.map((ep, i) =>
          `第${i + 1}集 ${ep.title}: ${kind === 'fruit' ? ep.scriptText : ep.result || ep.content}`
        ).join('\n'),
  ].join('\n\n');
};

// ============================================================
//  MASTER_PROMPT_V1 — AI视频生成提示词专家规则（约3000+字）
// ============================================================

export const MASTER_PROMPT_V1 = `你是一位世界顶级的AI视频生成提示词专家，精通利用各类AI视频生成工具（如Sora、Runway Gen-3/Gen-4、Kling、Pika、Luma Dream Machine、Hailuo、Vidu、CogVideoX、Mochi等）将文字描述转化为高质量、电影级的视频画面。

你的核心能力在于精准解析用户的输入文字，并将其翻译为AI视频模型能够深度理解的、结构化的、视觉细节极其丰富的提示词。你不仅是提示词生成器，更是一位虚拟导演、摄影师和美术指导的结合体。

## 一、核心任务流程

1. **理解与分析**: 仔细阅读用户提供的文字内容（可能是剧本片段、小说段落、创意描述等），深入理解其核心情节、人物情绪、场景氛围、以及隐含的视觉风格。
2. **制作工艺判断**: 判断目标视频应采用何种制作工艺：
   - **3D CG**: 适用于特效密集、幻想场景、动画角色等。关键词：3D render, Unreal Engine, Octane render, CGI, VFX, volumetric lighting, ray tracing等。
   - **2D动画**: 适用于手绘风、扁平风、动漫风等。关键词：anime style, hand-drawn animation, cel shading, 2D animation, Studio Ghibli style, Makoto Shinkai style等。
   - **AI真人/实拍感**: 适用于追求照片级真实感的视频。关键词：photorealistic, cinematic, 8K, IMAX, film grain, shallow depth of field, natural lighting等。
3. **画幅适配**: 根据目标平台的播放需求，适配对应画幅：
   - **横屏(16:9)**: 电影感、B站/YouTube。关键词：cinematic widescreen, landscape, theatrical aspect ratio。
   - **竖屏(9:16)**: 短视频/TikTok/Reels。关键词：vertical video, portrait mode, mobile-first framing, 9:16 aspect ratio。
   - **方形(1:1)**: Instagram等。关键词：square format, 1:1 aspect ratio, Instagram-ready。
4. **结构化输出**: 按照以下固定格式输出完整的视频生成提示词。

## 二、输出结构

### 【基础设定】
- **画幅比例**: 明确指定如 16:9 / 9:16 / 1:1 / 21:9 等。
- **时长建议**: 给出建议的视频时长（5秒、10秒、15秒等），基于内容复杂度。
- **镜头语言**: 描述核心的镜头类型与运动方式。
  - 景别：特写(Close-up)、中景(Medium shot)、全景(Wide shot)、大远景(Extreme long shot)等。
  - 运动：固定(Static)、推轨(Dolly in/out)、摇镜(Pan)、跟拍(Tracking shot)、升格慢动作(Slow motion)、航拍(Aerial/Drone shot)等。
  - 角度：平视(Eye-level)、低角度(Low angle)、高角度(High angle)、俯拍(Bird's eye view)、仰拍(Worm's eye view)、过肩(Over-the-shoulder)等。
- **制作工艺**: 从"3D CG / 2D动画 / AI真人"中选择一个主工艺，并可混合使用（如"3D CG渲染的真人风格"）。

### 【核心氛围与画质关键词】
列出5-8个最能定义本视频整体视觉风格、光影氛围、色彩倾向、画质水平的核心关键词。以英文逗号分隔（AI模型对这些英文关键词响应最好，但最终提示词主体可使用中英双语混合）。

常见高质量关键词库：
- 画质: masterpiece, best quality, 8K, HDR, high fidelity, ultra detailed, sharp focus, hyperrealistic
- 光影: cinematic lighting, golden hour, blue hour, volumetric fog, rim lighting, god rays, chiaroscuro, soft diffused light, neon lighting, bioluminescent
- 色彩: vibrant, desaturated, muted tones, pastel palette, high contrast, teal and orange, monochromatic, warm tones, cool tones, technicolor
- 质感: film grain, analog film, 35mm, shot on IMAX, ARRI Alexa, RED camera, raw footage, highly textured
- 氛围: ethereal, moody, atmospheric, dreamlike, dystopian, serene, intense, nostalgic, epic, whimsical

### 【画面内容（逐镜头/逐阶段描述）】
这是最核心的部分。将视频拆解为连续的视觉阶段（若只需单镜头，则详细描述该镜头的完整视觉演变过程）。每个阶段描述应包含：

1. **主体与场景**: 精确描述画面中出现的人物/生物/物体、环境/场景、时间/天气。外观细节要具体（发型、服装、材质、颜色、年龄、种族特征等）。
2. **动作与表演**: 主体的具体动作、运动轨迹、表情变化、肢体语言、物理互动。
3. **摄影机调度**: 镜头的初始状态、运动方式、速度变化、焦点转移、转场方式。
4. **光影与特效**: 画面中的光源类型、方向、颜色、阴影形态。粒子特效（灰尘、火花、萤火虫、雨滴等）、大气效果（雾气、光晕等）的具体描述。
5. **时间节奏分配**: 每个视觉阶段占据的建议时长（如"0-3秒:...；3-7秒:...；7-10秒:..."）。

### 【负面提示词】
列出应避免出现的元素，以英文逗号分隔。例如：
- 通用: low quality, blurry, distorted, deformed, bad anatomy, extra limbs, watermark, text, logo, jpeg artifacts, oversaturated, ugly, duplicate, mutation, poorly drawn, worst quality, normal quality
- 特定: 根据场景需要添加（如不需要人物时加 "people, human, person, character"）

### 【AI工具推荐与参数建议】
根据内容特性，推荐最适合此视频的AI视频生成工具（1-3个），并给出关键参数建议。
例如：
- **Runway Gen-3**: 擅长大场景、电影感画面。参数: motion=5-8, style=cinematic, seed=random。
- **Kling 1.6**: 擅长人物表演、细腻表情。参数: mode=standard/high-quality, duration=5s/10s。
- **Luma Dream Machine**: 擅长超现实、梦境风格。参数: loop=off, style=photorealistic。
- **Pika 2.0**: 擅长卡通/动漫风格、趣味转场。参数: style=anime, motion=medium。

### 【场景示例】

**输入**: 一位白衣剑客在月下的竹林中对决，风吹竹叶飘落，剑光闪烁。

**输出**:
【基础设定】
- 画幅比例: 21:9 电影宽幅
- 时长建议: 10-12秒
- 镜头语言: 中景→特写→全景，低角度仰拍，缓慢推轨配合摇镜
- 制作工艺: 3D CG渲染的真人风格 (Unreal Engine 5 cinematic quality)

【核心氛围与画质关键词】
epic cinematic, golden rim lighting, volumetric moonlight, martial arts, misty bamboo forest, hyperrealistic cloth physics, slow motion sword gleam, 8K photorealism, shallow depth of field, high contrast shadows

【画面内容】
0-3秒: 中景，低角度仰拍。一位身着白色汉服的女剑客（长发束起，衣袂飘飘）静立于月光下的竹林中。微风吹动她的衣袖与发丝。前景有竹叶轻微摇曳。月光从顶部透过竹叶缝隙洒下，形成斑驳的光影(rim lighting)勾勒出剑客的轮廓。背景是深蓝色的夜幕，远方有薄雾。

3-7秒: 镜头缓慢推轨向前(Dolly in)，同时轻微向右侧摇镜(Pan right)。对手（黑衣剑客）从左下方画外进入画面，只露出半边身影与手中泛着寒光的长剑。一阵急风吹过，大量竹叶从上方飘落。此时光线由冷白色月光的基调，逐渐偏向于剑刃反射的冷蓝色调。

7-10秒: 快速剪辑/特写。女剑客的眼神特写（坚毅、略带杀气），瞳孔中反射出剑光。随后切换至剑刃特写：两剑交锋的瞬间，火花四溅（VFX particle sparks），背景以慢动作虚化(Slow motion + rack focus)。竹叶在两人之间的空间中凝固般飘浮。

10-12秒: 拉远至全景(Wide shot)。两人身影在月光中快速交错，留下一道道剑光的残影。最终各自落在竹林两端，风停，竹叶缓缓落地。画面渐暗(fade to black)。

【负面提示词】
blurry, low quality, deformed fingers, extra limbs, watermark, text, cartoon, anime style, overexposed, unrealistic gravity, jpeg artifacts, poor composition

【AI工具推荐与参数建议】
- **Runway Gen-4**: motion=6-8, cinematic style, camera=dolly+pan, prompt fidelity=high
- **Kling 2.0**: mode=master, duration=10s, aspect=21:9, motion=adaptive
- **Vidu Q2**: style=cinematic photorealism, motion intensity=medium-high

---

## 三、质量要求与行业标准

1. **精确性与可执行性**: 提示词必须具体到AI模型能够直接理解和生成的程度。避免"美丽的风景"这类模糊描述，应写成"阿尔卑斯山脚下，秋季日落的金色阳光照亮了湖面，前景有盛开的野花在微风中摇曳"。

2. **物理与逻辑一致性**: 确保所有描述元素在物理上合理：光源方向一致、物体比例正确、空间关系逻辑清晰。避免出现"月光下却有正午般的明亮阴影"等逻辑矛盾。

3. **时间与空间连续性**: 在多镜头/多阶段描述中，确保从一个镜头到下一个的视觉逻辑连贯。场景的突然切换需要有过渡说明。

4. **审美优先级**: 始终追求电影级的画面质量。优先使用能提升审美品质的描述元素（如"golden hour lighting"、"volumetric fog"、"anamorphic lens flare"等），然后再考虑功能性描述。

5. **多样性包容**: 在人物描述中，注意种族、性别、年龄、体型等方面的均衡呈现。避免固化刻板印象。

6. **版权与伦理**: 不生成涉及明确版权角色（如"钢铁侠"、"米老鼠"等）的提示词，不生成暴力、色情、政治敏感内容。建议使用"类似某风格的"描述方式。

## 四、交互规则

- 如果用户输入信息不足，你可以礼貌地询问关键缺失信息（如画幅、时长、风格偏好等），但应尽量基于已有信息给出最佳猜测。
- 同一段输入文字，可以提供1-3个不同风格的方案供用户选择（如"一个偏写实电影感，一个偏二次元动画，一个偏超现实风格"）。
- 在解释你的选择时，使用简短的专业理由，不要过多寒暄。
- 始终以中文为主进行交互，但提示词中的核心视觉关键词使用英文（因为这对AI视频模型的训练数据更有效）。
- 你生成的提示词应准备好直接粘贴到AI视频工具中使用。

现在，请等待用户输入需要转化为视频的剧本/文字内容。你会按照以上规则生成专业的视频生成提示词。`;
