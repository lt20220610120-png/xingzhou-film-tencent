const cloudLocalId = (cloud) => `cloud-${cloud.id}`;

// ---------- 提示词双向合并（云文档语义） ----------
// 每集可携带 deletedPromptIds 墓碑，防止已删除的提示词在合并时复活。
const unionTombstones = (a = [], b = []) => [...new Set([...(a || []), ...(b || [])])].slice(-800);
const newerPrompt = (a, b) => {
  const ta = Date.parse(a?.editedAt || a?.edited_at || a?.createdAt || 0) || 0;
  const tb = Date.parse(b?.editedAt || b?.edited_at || b?.createdAt || 0) || 0;
  return tb > ta ? b : a;
};

// 合并本地与云端的分集：结构以云端为准，提示词按 id 取并集（同 id 取较新版本），
// 双方墓碑合并后过滤。本地独有的新分集保留。
export const mergeCloudEpisodes = (localEpisodes = [], cloudEpisodes = []) => {
  const localById = new Map((localEpisodes || []).map((ep) => [ep.id, ep]));
  const merged = (cloudEpisodes || []).map((cloudEp) => {
    const localEp = localById.get(cloudEp.id);
    if (!localEp) return cloudEp;
    const tombstones = unionTombstones(localEp.deletedPromptIds, cloudEp.deletedPromptIds);
    const byId = new Map();
    for (const prompt of [...(cloudEp.prompts || []), ...(localEp.prompts || [])]) {
      if (!prompt || !prompt.id || tombstones.includes(prompt.id)) continue;
      byId.set(prompt.id, byId.has(prompt.id) ? newerPrompt(byId.get(prompt.id), prompt) : prompt);
    }
    return {
      ...cloudEp,
      prompts: [...byId.values()],
      deletedPromptIds: tombstones,
      quickSceneEdits: { ...(cloudEp.quickSceneEdits || {}), ...(localEp.quickSceneEdits || {}) },
      sceneVisions: { ...(cloudEp.sceneVisions || {}), ...(localEp.sceneVisions || {}) },
    };
  });
  for (const ep of localEpisodes || []) {
    if (ep && !merged.some((item) => item.id === ep.id)) merged.push(ep);
  }
  return merged;
};

const fromCloud = (cloud, existing = {}) => ({
  ...existing,
  id: existing.id || cloudLocalId(cloud),
  name: cloud.name || existing.name || '未命名导演项目',
  sourceType: existing.sourceType || 'cloud',
  sourceId: existing.sourceId || cloud.analysis_output || null,
  cloudProjectId: cloud.id,
  cloudRole: cloud.myRole || 'collaborator',
  cloudLocked: Boolean(cloud.locked),
  groupId: 'director-cloud',
  masterScript: cloud.script || existing.masterScript || '',
  episodes: mergeCloudEpisodes(existing.episodes || [], Array.isArray(cloud.episodes) ? cloud.episodes : []),
  updatedAt: cloud.updated_at || existing.updatedAt || new Date().toISOString(),
});

export const reconcileDirectorCloudProjects = (localProjects = [], cloudProjects = []) => {
  const next = localProjects.map((project) => {
    const cloud = cloudProjects.find((item) => item.id === project.cloudProjectId || item.analysis_output === project.id);
    return cloud ? fromCloud(cloud, project) : project.cloudProjectId ? { ...project, groupId: 'director-cloud' } : project;
  });
  cloudProjects.forEach((cloud) => {
    const exists = next.some((project) => project.cloudProjectId === cloud.id || project.id === cloudLocalId(cloud));
    if (!exists) next.push(fromCloud(cloud));
  });
  return next;
};

export const removeDirectorCloudProjection = (localProjects = [], cloudProjectId) => localProjects
  .filter((project) => project.cloudProjectId !== cloudProjectId || project.sourceType !== 'cloud')
  .map((project) => {
    if (project.cloudProjectId !== cloudProjectId) return project;
    const { cloudProjectId: removedId, cloudRole, cloudLocked, ...localProject } = project;
    return localProject;
  });

export const canManageDirectorCollab = (project, accountIsProducer = false) => {
  if (project?.cloudProjectId || project?.sourceType === 'cloud') return project?.cloudRole === 'producer';
  return Boolean(accountIsProducer);
};
