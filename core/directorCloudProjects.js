import {threeWayMerge} from './threeWayMerge.js';
import {parseDirectorScenes} from './scriptImport.js';
const cloudLocalId = (cloud) => `cloud-${cloud.id}`;

// ---------- 提示词双向合并（云文档语义） ----------
// 每集可携带 deletedPromptIds 墓碑，防止已删除的提示词在合并时复活。
const unionTombstones = (a = [], b = []) => [...new Set([...(a || []), ...(b || [])])];
const newerPrompt = (a, b) => {
  const ta = Date.parse(a?.editedAt || a?.edited_at || a?.createdAt || 0) || 0;
  const tb = Date.parse(b?.editedAt || b?.edited_at || b?.createdAt || 0) || 0;
  return tb > ta ? b : a;
};

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value==='object'
  ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
const same = (a,b) => JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

export function mergeQuickScenePlans(localEpisode={},cloudEpisode={},baseEpisode) {
  const byId=new Map(),conflicts=[];
  for(const plan of [...(baseEpisode?.quickScenePlans || []),...(localEpisode.quickScenePlans || []),...(cloudEpisode.quickScenePlans || [])]){
    if(!plan?.id)continue;
    const prior=byId.get(plan.id);
    if(prior && !same(prior,plan))conflicts.push({type:'plan-content',planId:plan.id,localPlan:prior,cloudPlan:plan,message:'同一分段计划编号包含不同内容，请核对双端版本'});
    else if(!prior)byId.set(plan.id,plan);
  }
  const local=localEpisode.activeQuickScenePlanIds || {},remote=cloudEpisode.activeQuickScenePlanIds || {},base=baseEpisode?.activeQuickScenePlanIds || {},activePlanIds={};
  for(const label of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
    // Missing the whole field means an older client, not a request to erase it.
    const l=Object.hasOwn(localEpisode,'activeQuickScenePlanIds')?local[label]:base[label];
    const r=Object.hasOwn(cloudEpisode,'activeQuickScenePlanIds')?remote[label]:l;
    let selected=l;
    if(l===r)selected=l;
    else if(baseEpisode && l===base[label])selected=r;
    else if(baseEpisode && r===base[label])selected=l;
    else if(l==null && !baseEpisode)selected=r;
    else if(r==null && !baseEpisode)selected=l;
    else conflicts.push({type:'active-plan',sceneLabel:label,localPlanId:l ?? null,cloudPlanId:r ?? null,message:`场景 ${label} 的活动分段计划在双端同时变化，请选择要使用的版本`});
    if(selected && byId.has(selected))activePlanIds[label]=selected;
    else if(selected)conflicts.push({type:'missing-plan',sceneLabel:label,planId:selected,message:'活动分段计划缺失，已停止使用该指针'});
  }
  return {plans:[...byId.values()],activePlanIds,conflicts};
}

const attachPlans = (episode,local={},cloud={},base) => {
  const merged=mergeQuickScenePlans(local,cloud,base),active={};
  for(const [label,id] of Object.entries(merged.activePlanIds)){
    const plan=merged.plans.find(plan=>plan.id===id);
    const scene=parseDirectorScenes(episode.content,Number(label.split('-')[0]) || 1).find(scene=>scene.label===label);
    const input=Object.hasOwn(episode.quickSceneEdits || {},label)?String(episode.quickSceneEdits[label] ?? ''):scene?.content;
    if(plan && scene && plan.sceneLabel===label && plan.sourceSnapshot===input)active[label]=id;
  }
  return {...episode,quickScenePlans:merged.plans,activeQuickScenePlanIds:active,quickScenePlanConflicts:merged.conflicts};
};

const withoutPlans = (document) => ({...document,episodes:(document?.episodes || []).map(episode=>{
  const {quickScenePlans,activeQuickScenePlanIds,quickScenePlanConflicts,...rest}=episode;return rest;
})});

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
    return attachPlans({
      ...cloudEp,
      prompts: [...byId.values()],
      deletedPromptIds: tombstones,
      quickSceneEdits: { ...(cloudEp.quickSceneEdits || {}), ...(localEp.quickSceneEdits || {}) },
      sceneVisions: { ...(cloudEp.sceneVisions || {}), ...(localEp.sceneVisions || {}) },
    },localEp,cloudEp);
  });
  for (const ep of localEpisodes || []) {
    if (ep && !merged.some((item) => item.id === ep.id)) merged.push(ep);
  }
  return merged;
};

const fromCloud = (cloud, existing = {}) => {
 const remote={name:cloud.name,script:cloud.script||'',episodes:cloud.episodes||[]};
 let merged=remote,conflict='';
 const local={name:existing.name,script:existing.masterScript||'',episodes:existing.episodes||[]};
 if(existing.cloudBase)try{merged=threeWayMerge(withoutPlans(existing.cloudBase),withoutPlans(local),withoutPlans(remote));}catch(error){merged=local;conflict=error.message;}
 let episodes=existing.cloudBase ? (merged.episodes || []).map(episode=>{
   const localEp=local.episodes.find(ep=>ep.id===episode.id) || {},cloudEp=remote.episodes.find(ep=>ep.id===episode.id) || {},baseEp=existing.cloudBase.episodes?.find(ep=>ep.id===episode.id);
   const tombstones=unionTombstones(unionTombstones(localEp.deletedPromptIds,cloudEp.deletedPromptIds),existing.deletedPromptIds);
   return attachPlans({...episode,deletedPromptIds:tombstones,prompts:(episode.prompts || []).filter(prompt=>!tombstones.includes(prompt.id))},localEp,cloudEp,baseEp);
 }) : mergeCloudEpisodes(existing.episodes || [],remote.episodes);
 const quickScenePlanConflicts=episodes.flatMap(ep=>(ep.quickScenePlanConflicts || []).map(item=>({...item,episodeId:ep.id})));
 if(quickScenePlanConflicts.length)conflict=[conflict,...new Set(quickScenePlanConflicts.map(item=>item.message))].filter(Boolean).join('；');
 const globalTombstones=new Set([...(existing.deletedPromptIds || []),...episodes.flatMap(ep=>ep.deletedPromptIds || [])]);
  episodes=episodes.map(ep=>({...ep,deletedPromptIds:unionTombstones(ep.deletedPromptIds,[...globalTombstones]),prompts:(ep.prompts || []).filter(pr=>!globalTombstones.has(pr.id))}));
 const history=new Map((existing.promptHistory || []).filter(pr=>pr?.id && !globalTombstones.has(pr.id)).map(pr=>[pr.id,pr]));
 for(const prompt of episodes.flatMap(ep=>ep.prompts || []))if(prompt?.id)history.set(prompt.id,history.has(prompt.id)?newerPrompt(history.get(prompt.id),prompt):prompt);
 return ({
  ...existing,
  id: existing.id || cloudLocalId(cloud),
  name: merged.name || existing.name || '未命名导演项目',
  cloudBase:conflict?existing.cloudBase:remote,cloudConflict:conflict,cloudRemote:remote,
  cloudSyncError:!conflict&&/同时被修改|协作冲突|版本.*不一致/.test(existing.cloudSyncError||'')?'':existing.cloudSyncError||'',
  sourceType: existing.sourceType || 'cloud',
  sourceId: existing.sourceId || cloud.analysis_output || null,
  cloudProjectId: cloud.id,
  cloudRole: cloud.myRole || existing.cloudRole || 'collaborator',
  cloudLocked: Boolean(cloud.locked ?? existing.cloudLocked),
  groupId: 'director-cloud',
  masterScript: merged.script || '',
  episodes,quickScenePlanConflicts,
  promptHistory:[...history.values()],
  updatedAt: cloud.updated_at || existing.updatedAt || new Date().toISOString(),
});
};

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
    // Called only after the authoritative cloud delete succeeds. The server has
    // already checked live and recoverable collaboration references.
    const { cloudProjectId: removedId, cloudRole, cloudLocked, collaborationProjectId, ...localProject } = project;
    return {...localProject,groupId:localProject.groupId==='director-cloud'?'director-workbench':localProject.groupId};
  });

export const canManageDirectorCollab = (project, accountIsProducer = false) => {
  if (project?.cloudProjectId || project?.sourceType === 'cloud') return project?.cloudRole === 'producer';
  return Boolean(accountIsProducer);
};

// Acknowledging our own write uses the submitted snapshot as the merge baseline.
// Edits made while the request was in flight remain local changes.
export const acknowledgeDirectorCloudSave = (projects, cloud, submitted) => projects.map(project =>
  project.cloudProjectId === cloud.id ? fromCloud(cloud, {...project, cloudBase:submitted}) : project);
