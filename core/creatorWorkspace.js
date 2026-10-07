import {readRewriteOutline,validateRewriteOutline,rewriteOutlineText,copyOutlineGroups} from './rewriteOutline.js';
import {readRewriteMainline,validateRewriteMainline,rewriteMainlineText} from './rewriteMainline.js';
import {rewriteWorldInput} from './rewriteWorld.js';
import {rewriteStoryInput,mergeRewriteStory} from './rewriteStory.js';
import { splitFullScript } from './scriptImport.js';
import { formatIPScriptText } from './ipScenes.js';
import { normalizeFrameworkProject, applyFrameworkCommand } from './frameworkWorkflow.js';
import { isFrameworkTask, frameworkInputFingerprint, applyFrameworkProjectRecord } from './frameworkAi.js';

// Persist only JSON data. This module deliberately does not import projectStore:
// projectStore calls this normalizer while loading existing projects.
const SCHEMA_VERSION = 1;
let sequence = 0;
const uid = () => `creator_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${sequence++}`;
const now = () => new Date().toISOString();
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const text = value => typeof value === 'string' ? value : '';
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const projectKey = kind => kind === 'fruit' ? 'fruitProjects' : kind === 'script' ? 'scriptProjects' : fail('CREATOR_INVALID_KIND', '未知创作项目类型。');
const sideField = (kind, side) => {
  if (side !== 'input' && side !== 'output') fail('CREATOR_INVALID_SIDE', '请选择原稿或成果。');
  return kind === 'fruit' ? (side === 'input' ? 'rawText' : 'scriptText') : (side === 'input' ? 'content' : 'result');
};

export const CREATOR_FRAMEWORK_STAGES = [
  { key: 'inspiration', label: '灵感' }, { key: 'settings', label: '设定' },
  { key: 'events', label: '事件' }, { key: 'timeline', label: '时间线' },
  { key: 'outline', label: '大纲' }, { key: 'skeleton', label: '骨架' },
  { key: 'characters', label: '人物' }, { key: 'experience', label: '经验提炼' },
  { key: 'simulation', label: '世界模拟' }, { key: 'detail', label: '细纲' },
  { key: 'episodeOutline', label: '分集大纲' },
];
export const CREATOR_REWRITE_SECTIONS = [
  { key: 'settings', label: '设定' }, {key:'macroOutline',label:'大纲'}, { key: 'outline', label: '大纲' },
  { key: 'detail', label: '细纲' }, { key: 'events', label: '事件' },
  { key: 'characters', label: '人物' }, { key: 'timeline', label: '人物线与时间线' },
];
const sectionLabels = Object.fromEntries([...CREATOR_FRAMEWORK_STAGES, ...CREATOR_REWRITE_SECTIONS].map(stage => [stage.key, stage.label]));
const resolveMode = (p, kind) => kind === 'fruit' ? (p.creator?.mode === 'ip' ? 'ip' : 'fruit') : ['rewrite', 'free', 'framework'].includes(p.creator?.mode)
  ? p.creator.mode : p.mode === 'rewrite' ? 'rewrite' : p.mode === 'framework' ? 'framework' : 'free';
export function filterCreatorProjects(projects,{kind='script',channel='rewrite',originalFilter='all'}={}) {
 return projects.filter(project=>{
  const mode=resolveMode(project,kind);
  if(kind==='fruit')return mode!=='ip';
  return channel==='rewrite'?mode==='rewrite':mode!=='rewrite'&&(originalFilter==='all'||mode===originalFilter);
 });
}
const normalizeSection = section => ({ input: '', output: '', accepted: false, locked: false, stale: false, ...clone(section || {}) });
const refIds = value => Array.isArray(value) ? [...new Set(value)] : [];
const normalizeStoryCharacter = (item, id) => ({ ...clone(item || {}), id: item?.id || id,
  name: text(item?.name), description: text(item?.description), start: String(item?.start ?? ''), end: String(item?.end ?? ''), accepted: Boolean(item?.accepted),
});
const normalizeStoryEvent = (item, id, order) => ({ ...clone(item || {}), id: item?.id || id,
  title: text(item?.title), content: text(item?.content), result: text(item?.result),
  characterIds: refIds(item?.characterIds), predecessorIds: refIds(item?.predecessorIds), parentEventId: item?.parentEventId || null,
  episodeIds: refIds(item?.episodeIds), actualTime: String(item?.actualTime ?? ''), order: Number.isFinite(item?.order) ? item.order : order,
  accepted: Boolean(item?.accepted),
});
const normalizeStory = (story, projectId) => ({ ...clone(story || {}),
  events: (Array.isArray(story?.events) ? story.events : []).filter(Boolean).map((item, index) => normalizeStoryEvent(item, `${projectId || 'legacy'}_event_${index + 1}`, index)),
  characters: (Array.isArray(story?.characters) ? story.characters : []).filter(Boolean).map((item, index) => normalizeStoryCharacter(item, `${projectId || 'legacy'}_character_${index + 1}`)),
});
const adoptedStory = project => ({
  characters: project.creator.story.characters.filter(item => item.accepted).map(({ id, name, description, start, end }) => ({ id, name, description, start, end })),
  // Candidate placement does not change the relative chronology of adopted events.
  events: project.creator.story.events.filter(item => item.accepted).map(({ id, title, content, result, characterIds, predecessorIds, parentEventId, episodeIds, actualTime, isMajor }, order) =>
    ({ id, title, content, result, characterIds, predecessorIds, parentEventId, episodeIds, actualTime, isMajor: Boolean(isMajor), order })),
  necessaryReferences: (() => {
    const events=project.creator.story.events.filter(item=>item.accepted);
    const characterIds=new Set(events.flatMap(item=>item.characterIds));
    const eventIds=new Set(events.flatMap(item=>[...item.predecessorIds,item.parentEventId].filter(Boolean)));
    return {characters:project.creator.story.characters.filter(item=>!item.accepted&&characterIds.has(item.id)).map(({id,name})=>({id,name,accepted:false})),
      events:project.creator.story.events.filter(item=>!item.accepted&&eventIds.has(item.id)).map(({id,title})=>({id,title,accepted:false}))};
  })(),
});
const normalizeEpisode = (episode, kind, id) => ({
  ...clone(episode || {}), id: episode?.id || id, title: text(episode?.title),
  type: episode?.type || (episode?.kind === 'setting' ? 'settings' : 'episode'),
  [sideField(kind, 'input')]: text(episode?.[sideField(kind, 'input')]),
  [sideField(kind, 'output')]: text(episode?.[sideField(kind, 'output')]),
  sourceEpisodeIds: Array.isArray(episode?.sourceEpisodeIds) ? [...episode.sourceEpisodeIds] : [],
  generationVersion: Number(episode?.generationVersion) || 0,
  generationVersions: Array.isArray(episode?.generationVersions) ? clone(episode.generationVersions) : [],
  finalConfirmed: Boolean(episode?.finalConfirmed), stale: Boolean(episode?.stale),
});
const episodeBlocks = (episodes, kind, side) => {
  const field = sideField(kind, side);
  let episodeNumber = 0;
  return episodes.map(episode => {
    if (episode.type === 'episode') episodeNumber++;
    const title = episode.title || (episode.type === 'episode' ? `第${episodeNumber}集` : episode.type === 'settings' ? '设定' : '自定义内容');
    return text(episode[field]).trim() ? `【${title}】\n${text(episode[field]).trim()}` : '';
  }).filter(Boolean).join('\n\n');
};

/** Idempotent, lossless migration. Old master strings are recovery material only. */
export const normalizeCreatorProject = (project, kind = 'script') => {
  if (!project || typeof project !== 'object') return project;
  projectKey(kind);
  const initialMigration = project.creator?.schemaVersion !== SCHEMA_VERSION;
  const previous = project.creator || {};
  const sections = Object.fromEntries(Object.keys(sectionLabels).map(key => [key, normalizeSection(previous.sections?.[key])]));
  for (const [key, value] of Object.entries(previous.sections || {})) sections[key] = normalizeSection(value);
  let episodes = (Array.isArray(project.episodes) ? project.episodes : []).filter(Boolean)
    .map((episode, index) => normalizeEpisode(episode, kind, `${project.id || 'legacy'}_episode_${index + 1}`));
  // A legacy project with only a master needs a readable node. A project whose
  // episodes exist must retain those episodes even when their chosen side is blank.
  const aggregate = kind === 'fruit' ? text(project.masterScript) : text(project.finalScript) || text(project.masterScript);
  if (initialMigration && !episodes.length && aggregate.trim()) {
    episodes = [normalizeEpisode({ title: '完整剧本', [sideField(kind, 'output')]: aggregate }, kind, `${project.id || 'legacy'}_master`)];
  }
  const legacy = clone(previous.legacy || {});
  for (const key of ['masterScript', 'finalScript']) {
    if (initialMigration && text(project[key]).trim() && text(project[key]).trim() !== episodeBlocks(episodes, kind, 'output')) {
      legacy[key] = project[key];
    }
  }
  const source = previous.source ? clone(previous.source) : null;
  if (source) {
    source.id ||= `${project.id || 'legacy'}_source`;
    source.name = text(source.name);
    source.content = text(source.content);
    source.episodes = (Array.isArray(source.episodes) ? source.episodes : []).map((episode, index) => ({
      ...episode, id: episode.id || `${source.id}_episode_${index + 1}`, title: text(episode.title), content: text(episode.content),
    }));
  }
  const records = (Array.isArray(previous.records) ? previous.records : []).filter(Boolean).map(record => clone(record));
  const normalized = {
    ...project, episodes,
    creator: {
      ...clone(previous), schemaVersion: SCHEMA_VERSION, mode: resolveMode(project, kind),
      sections, source, references: Array.isArray(previous.references) ? clone(previous.references) : [],
      records, chat: Array.isArray(previous.chat) ? clone(previous.chat) : [], legacy,
      story: normalizeStory(previous.story, project.id),
    },
  };
  return kind === 'script' && normalized.creator.mode === 'framework' ? normalizeFrameworkProject(normalized) : normalized;
};

/** Call once after reading persisted state at startup, never during rendering or
 * ordinary normalization. A saved running task cannot resume its old request.
 */
export const recoverCreatorTasks = state => {
  if (!state || typeof state !== 'object') return state;
  let recovered = state;
  const timestamp = now();
  for (const key of ['fruitProjects', 'scriptProjects']) {
    if (!Array.isArray(state[key])) continue;
    let changed = false;
    const projects = state[key].map(project => {
      if (!project?.creator?.records?.some(record => record?.status === 'running')) return project;
      changed = true;
      const records = project.creator.records.map(record => record?.status === 'running' ? {
        ...record, status: 'interrupted', error: '上次运行因程序关闭或重启而中断。已保存内容仍保留，请重新运行任务。',
        interruptedAt: timestamp, finishedAt: timestamp,
      } : record);
      return { ...project, creator: { ...project.creator, records } };
    });
    if (changed) recovered = { ...recovered, [key]: projects };
  }
  return recovered;
};

const mutateProject = (state, kind, id, mutate) => {
  const key = projectKey(kind), projects = state[key] || [];
  if (!projects.some(project => project?.id === id)) return state;
  return { ...state, [key]: projects.map(project => {
    if (project?.id !== id) return project;
    const before = normalizeCreatorProject(project, kind);
    let next = mutate(before);
    if(before.creator.framework?.activePlanId===next.creator.framework?.activePlanId)next = markFollowingEpisodesStale(before, next, kind);
    if(next.creator.mode==='framework'&&next.creator.framework?.activePlanId){
      const f=next.creator.framework;
      next={...next,creator:{...next.creator,framework:{...f,plans:f.plans.map(plan=>plan.id===f.activePlanId?{...plan,episodes:clone(next.episodes)}:plan)}}};
    }
    if (JSON.stringify(adoptedStory(before)) !== JSON.stringify(adoptedStory(next))) next = markDerivedSectionsStale(staleEpisodes(next, kind), ['skeleton','timeline','detail','episodeOutline','simulation']);
    const fingerprints = new Map();
    const records = next.creator.records.map(record => {
      if (!record.inputFingerprint || !['candidate', 'pending', 'running', 'completed', 'success'].includes(record.status)) return record;
      const key = JSON.stringify(record.target || {});
      if (!fingerprints.has(key)) fingerprints.set(key, creatorInputFingerprint(next, record.target));
      return { ...record, stale: record.inputFingerprint !== fingerprints.get(key) };
    });
    return { ...next, creator: { ...next.creator, records }, updatedAt: now() };
  }) };
};
const staleEpisodes = (project, kind, predicate = () => true) => ({ ...project,
  episodes: project.episodes.map((episode, index) => predicate(episode, index) && text(episode[sideField(kind, 'output')]).trim()
    ? { ...episode, stale: true } : episode),
});
const markDerivedSectionsStale=(project,keys)=>({...project,creator:{...project.creator,sections:Object.fromEntries(Object.entries(project.creator.sections).map(([key,value])=>[key,keys.includes(key)&&text(value.output).trim()?{...value,stale:true}:value]))}});
const SECTION_DEPENDENCIES={
 inspiration:['settings','outline','skeleton','characters','timeline','detail','episodeOutline','simulation'],
 macroOutline:['outline','characters','skeleton','timeline','detail','episodeOutline','simulation'],
 settings:['macroOutline','outline','skeleton','characters','timeline','detail','episodeOutline','simulation'],
 outline:['skeleton','detail','episodeOutline','simulation'],skeleton:['detail','episodeOutline','simulation'],
 events:['timeline','detail','episodeOutline','simulation'],characters:['timeline','detail','episodeOutline','simulation'],
 timeline:['detail','episodeOutline','simulation'],experience:['simulation'],simulation:['detail','episodeOutline'],detail:['episodeOutline'],
};
const markFollowingEpisodesStale = (before, after, kind) => {
  let affectedFrom = Infinity;
  const previousById = new Map(before.episodes.map(episode => [episode.id, episode]));
  const inputField = sideField(kind, 'input'), outputField = sideField(kind, 'output');
  // Inserting, removing, or moving a node changes the chronology from that point.
  for (let index = 0; index < Math.max(before.episodes.length, after.episodes.length); index++) {
    if (before.episodes[index]?.id !== after.episodes[index]?.id) {
      affectedFrom = Math.min(affectedFrom, index);
      break;
    }
  }
  after.episodes.forEach((episode, index) => {
    const previous = previousById.get(episode.id);
    if (previous && (previous.title !== episode.title || previous.type !== episode.type
      || text(previous[inputField]) !== text(episode[inputField]) || text(previous[outputField]) !== text(episode[outputField]))) {
      affectedFrom = Math.min(affectedFrom, index + 1);
    }
  });
  return affectedFrom === Infinity ? after : staleEpisodes(after, kind, (_episode, index) => index >= affectedFrom);
};
const adoptedSections = project => Object.fromEntries(Object.entries(project.creator.sections)
  .filter(([, section]) => section.accepted&&(!section.stale||section.locked)).map(([key, section]) => [key, { output: text(section.output), locked: Boolean(section.locked) }]));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

/** Captures active source, adopted constraints, and all nodes the task reads.
 * Pending candidates, chat, timestamps and generation histories cannot stale a run.
 */
export const creatorInputFingerprint = (project, target = {}) => {
  const kind = project.creator?.mode === 'fruit' || (!project.mode && project.episodes?.some(e => own(e, 'rawText'))) ? 'fruit' : 'script';
  const p = normalizeCreatorProject(project, kind), activeTarget = { ...target, side: target.side || 'output', scope: target.scope === 'current' ? 'current' : 'project' };
  if (p.creator.mode === 'framework' && isFrameworkTask(target)) return frameworkInputFingerprint(p, target);
  const node = target.episodeId ? p.episodes.find(episode => episode.id === target.episodeId) : p.creator.sections[target.section];
  const selected = target.episodeId ? (node ? {
    id: node.id, title: node.title, type: node.type, input: node[sideField(kind, 'input')],
    output: node[sideField(kind, 'output')], sourceEpisodeIds: node.sourceEpisodeIds,
  } : null) : node ? { input: node.input, output: node.output } : null;
  const source = p.creator.source ? {
    id: p.creator.source.id, content: p.creator.source.content,
    episodes: p.creator.source.episodes.map(episode => ({ id: episode.id, title: episode.title, content: episode.content })),
  } : null;
  const episodeContext = activeTarget.scope === 'current' ? [] : p.episodes
    .map((episode, position) => ({ id: episode.id, position, title: episode.title, finalConfirmed: episode.finalConfirmed,
      ...(kind === 'fruit' ? { scriptText: episode.scriptText } : { content: episode.content, result: episode.result }),
    })).filter(episode => episode.id !== target.episodeId);
  const referenceKey=target.section||'episode',referenceIds=p.creator.rewrite?.selections?.[referenceKey]||[];
  const analysisSource = [p.creator.source,...p.creator.references].find(book => book?.id === target.sourceId);
  const serialized = JSON.stringify(canonical(target.task==='rewriteStory'||target.format==='rewriteStory'?{projectId:p.id,target:activeTarget,input:rewriteStoryInput(p,target),selected}:target.task==='rewriteWorldSim'?{projectId:p.id,target:activeTarget,input:rewriteWorldInput(p,target)}:target.task === 'rewriteAnalyze' ? {projectId:p.id,target:activeTarget,source:analysisSource?{id:analysisSource.id,name:analysisSource.name,content:analysisSource.content,...(target.analysisStage==='outline'?{macroOutline:analysisSource.analysis?.macroOutline}: {})}:null} : { projectId: p.id, mode: p.creator.mode, target: activeTarget, selected,
    sections: adoptedSections(p), story: adoptedStory(p), source, episodeContext,
    referenceAnalyses:activeTarget.scope==='project'&&p.creator.mode==='rewrite'?Object.fromEntries(Object.entries(p.creator.sections).filter(([,value])=>value.input.trim()&&!value.inputStale).map(([key,value])=>[key,value.input])):{},
    rewrite: p.creator.mode==='rewrite' ? {selections:{[referenceKey]:referenceIds},activeVersionId:p.creator.rewrite?.activeVersionId||null} : null, sourceAnalyses: p.creator.mode!=='rewrite'||referenceIds.includes(p.creator.source?.id)?p.creator.source?.analysis||null:null,
    references: p.creator.references.filter(reference => reference.enabled !== false).map(reference => ({ id: reference.id, content: reference.content, analysis: p.creator.mode!=='rewrite'||referenceIds.includes(reference.id)?reference.analysis:undefined })),
  }));
  let hash = 2166136261;
  for (let i = 0; i < serialized.length; i++) hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619);
  return `creator-v1-${(hash >>> 0).toString(16).padStart(8, '0')}-${serialized.length}`;
};

export const createCreatorProject = (state, { name, mode = 'free', groupId = null } = {}) => {
  if (!['fruit', 'rewrite', 'free', 'framework'].includes(mode)) fail('CREATOR_INVALID_MODE', '未知创作模式。');
  const kind = mode === 'fruit' ? 'fruit' : 'script', key = projectKey(kind), timestamp = now(), id = uid();
  const p = normalizeCreatorProject({ id, name: text(name).trim() || '未命名作品', groupId,
    ...(kind === 'script' ? { mode: mode === 'rewrite' ? 'rewrite' : 'original', attachments: [], finalScript: '' } : { rating: 0, masterScript: '' }),
    episodes: mode === 'fruit' || mode === 'free' ? [{ id: uid(), title: '第1集', type: 'episode' }] : [],
    creator: { schemaVersion: SCHEMA_VERSION, mode }, createdAt: timestamp, updatedAt: timestamp,
  }, kind);
  return { ...state, [key]: [...(state[key] || []), p] };
};

const patchSection = (project, kind, key, patch) => {
  const previous = project.creator.sections[key] || normalizeSection();
  if (previous.locked && patch.locked !== false && (own(patch, 'input') || own(patch, 'output') || patch.accepted === false)) {
    fail('CREATOR_LOCKED', '该成果已锁定，请明确解锁后修改。');
  }
  const next = normalizeSection({ ...previous, ...clone(patch) });
  if(own(patch,'input')&&!own(patch,'inputStale'))next.inputStale=false;
  if(patch.accepted===true&&!own(patch,'stale'))next.stale=false;
  if (next.locked && (!next.accepted || !text(next.output).trim())) fail('CREATOR_LOCKED', '请先采用非空成果，再锁定该内容。');
  let updated = { ...project, creator: { ...project.creator, sections: { ...project.creator.sections, [key]: next } } };
  if(project.creator.mode==='rewrite'&&key==='macroOutline'&&own(patch,'output')&&project.creator.rewrite?.eventReferences){
    try{
      const before=new Map(readRewriteOutline(previous.output).groups.flatMap(g=>g.events.map(e=>[e.id,e.references])));
      const overrides={...project.creator.rewrite.eventReferences};
      for(const e of readRewriteOutline(next.output).groups.flatMap(g=>g.events)){
        if(Array.isArray(e.references)&&JSON.stringify(e.references)!==JSON.stringify(before.get(e.id)))delete overrides[e.id];
      }
      updated={...updated,creator:{...updated.creator,rewrite:{...updated.creator.rewrite,eventReferences:overrides}}};
    }catch{/* An unfinished manual JSON edit must not discard existing reference choices. */}
  }
  if (JSON.stringify(adoptedSections(project)) !== JSON.stringify(adoptedSections(updated))) updated = markDerivedSectionsStale(staleEpisodes(updated, kind), [...(SECTION_DEPENDENCIES[key]||[]),...(project.creator.mode==='rewrite'&&key==='outline'&&!next.output.includes('\"story-v1\"')?['characters']:[])]);
  return updated;
};

const preserveManualHistory = (before, after, target, changes, extras = {}) => {
  const records = [...after.creator.records];
  for (const [side, change] of Object.entries(changes)) {
    const oldText = text(change.previous);
    if (!oldText || text(change.next) === oldText) continue;
    // One full snapshot per thirty-second manual editing session and side.
    const latest = records.findLast(record => record.type === 'history' && record.source === 'manual'
      && record.target?.episodeId === target.episodeId && record.target?.section === target.section && record.target?.side === side);
    if (!latest || Date.now() - Date.parse(latest.createdAt) > 30000) {
      records.push(historyRecord(before, { ...target, side }, oldText, { ...extras, source: 'manual' }));
    }
  }
  return { ...after, creator: { ...after.creator, records } };
};
const patchManualSection = (project, kind, key, patch) => {
  const previous = project.creator.sections[key] || normalizeSection(), next = patchSection(project, kind, key, patch);
  const changes = Object.fromEntries(['input', 'output'].filter(side => own(patch, side))
    .map(side => [side, { previous: previous[side], next: patch[side] }]));
  return preserveManualHistory(project, next, { section: key }, changes,
    { previousAccepted: previous.accepted, previousLocked: previous.locked });
};

/** Patch creator fields only; the project wrapper and other sections survive. */
export const updateCreatorProject = (state, kind, id, patch = {}) => mutateProject(state, kind, id, p => {
  const creatorPatch = clone(patch.creator || patch), sectionPatch = creatorPatch.sections;
  delete creatorPatch.sections;
  let next = { ...p, creator: { ...p.creator, ...creatorPatch, schemaVersion: SCHEMA_VERSION } };
  if (own(creatorPatch, 'story')) {
    next.creator.story = normalizeStory({ ...p.creator.story, ...creatorPatch.story }, p.id);
    validateStory(next, next.creator.story);
  }
  for (const [key, value] of Object.entries(sectionPatch || {})) next = patchManualSection(next, kind, key, value);
  if (own(creatorPatch, 'source') && JSON.stringify(p.creator.source) !== JSON.stringify(next.creator.source)) next = staleEpisodes(next, kind);
  return next;
});
export const updateCreatorSection = (state, kind, id, key, patch = {}) => mutateProject(state, kind, id, p => patchManualSection(p, kind, key, patch));

const patchEpisode = (p, kind, episodeId, patch) => {
  const inputField = sideField(kind, 'input'), outputField = sideField(kind, 'output');
  return { ...p, episodes: p.episodes.map(episode => {
    if (episode.id !== episodeId) return episode;
    const next = { ...episode, ...clone(patch), id: episode.id };
    if (own(patch, outputField) && next[outputField] !== episode[outputField]) {
      next.stale = own(patch, 'stale') ? Boolean(patch.stale) : false;
      next.finalConfirmed = own(patch, 'finalConfirmed') ? Boolean(patch.finalConfirmed) : false;
    }
    if (own(patch, inputField) && next[inputField] !== episode[inputField] && text(next[outputField]).trim() && !own(patch, outputField)) next.stale = true;
    return next;
  }) };
};
export const updateCreatorEpisode = (state, kind, id, episodeId, patch = {}) => mutateProject(state, kind, id, p => {
  const activePlan=p.creator.framework?.plans.find(plan=>plan.id===p.creator.framework.activePlanId);
  const next = p.creator.mode==='framework'&&activePlan&&!activePlan.legacy
    ? applyFrameworkCommand(p,{type:'episode.update',planId:activePlan.id,episodeId,patch})
    : patchEpisode(p, kind, episodeId, patch);
  const previous = p.episodes.find(episode => episode.id === episodeId);
  if (!previous) return next;
  const changes = Object.fromEntries(['input', 'output'].filter(side => own(patch, sideField(kind, side)))
    .map(side => [side, { previous: previous[sideField(kind, side)], next: patch[sideField(kind, side)] }]));
  return preserveManualHistory(p, next, { episodeId }, changes);
});
export const addCreatorEpisode = (state, kind, id, { title, type = 'episode' } = {}) => mutateProject(state, kind, id, p => {
  if (!['episode', 'settings', 'custom'].includes(type)) fail('CREATOR_INVALID_NODE_TYPE', '未知内容节点类型。');
  const number = p.episodes.filter(episode => episode.type === 'episode').length + 1;
  const node = normalizeEpisode({ id: uid(), title: text(title).trim() || (type === 'episode' ? `第${number}集` : type === 'settings' ? '设定' : '自定义内容'), type }, kind);
  return { ...p, episodes: [...p.episodes, node] };
});

const historyRecord = (project, target, output, extras = {}) => ({
  id: uid(), projectId: project.id, type: 'history', target: clone(target), output,
  inputFingerprint: creatorInputFingerprint(project, target), status: 'replaced', createdAt: now(), ...extras,
});
export const removeCreatorNode = (state, kind, id, nodeId) => mutateProject(state, kind, id, p => {
  const index = p.episodes.findIndex(episode => episode.id === nodeId);
  if (index < 0) return p;
  const node = p.episodes[index];
  const record = historyRecord(p, { episodeId: node.id }, node[sideField(kind, 'output')], { type: 'deleted-node', status: 'deleted', node: clone(node), index,
    assignedEventIds: p.creator.story.events.filter(event => event.episodeIds.includes(node.id)).map(event => event.id),
  });
  const story = { ...p.creator.story, events: p.creator.story.events.map(event => ({ ...event, episodeIds: event.episodeIds.filter(episodeId => episodeId !== nodeId) })) };
  return { ...p, episodes: p.episodes.filter(episode => episode.id !== nodeId), creator: { ...p.creator, story, records: [...p.creator.records, record] } };
});

const storyKey = type => type === 'event' || type === 'events' ? 'events' : type === 'character' || type === 'characters' ? 'characters'
  : fail('CREATOR_STORY_INVALID_TYPE', '请选择事件或人物条目。');
const validateStory = (project, story) => {
  const eventIds = new Set(story.events.map(item => item.id)), characterIds = new Set(story.characters.map(item => item.id));
  if (eventIds.size !== story.events.length || characterIds.size !== story.characters.length) fail('CREATOR_STORY_DUPLICATE_ID', '条目 ID 重复，请重新整理。');
  const episodeIds = new Set(project.episodes.filter(episode => episode.type === 'episode').map(episode => episode.id));
  for (const event of story.events) {
    for (const [refs, available] of [[event.characterIds, characterIds], [event.predecessorIds, eventIds], [event.episodeIds, episodeIds], [event.parentEventId ? [event.parentEventId] : [], eventIds]]) {
      if (refs.some(id => !available.has(id))) fail('CREATOR_STORY_REFERENCE_MISSING', '关联条目或分集不存在，请先修正引用。');
    }
  }
  const events = new Map(story.events.map(item => [item.id, item]));
  const assertAcyclic = (links, code, message) => {
    const visiting = new Set(), complete = new Set();
    const visit = id => {
      if (visiting.has(id)) fail(code, message);
      if (complete.has(id)) return;
      visiting.add(id);
      for (const next of links(events.get(id))) visit(next);
      visiting.delete(id); complete.add(id);
    };
    for (const id of eventIds) visit(id);
  };
  assertAcyclic(item => item.predecessorIds, 'CREATOR_CAUSAL_CYCLE', '前置事件不能引用自身或形成因果循环。');
  assertAcyclic(item => item.parentEventId ? [item.parentEventId] : [], 'CREATOR_PARENT_CYCLE', '所属大事件不能引用自身或形成层级循环。');
};
const storyHistoryRecord = (project, operation, itemType, items = []) => ({
  ...historyRecord(project, { section: storyKey(itemType) }, JSON.stringify(project.creator.story, null, 2)),
  type: 'story-history', operation, itemType: storyKey(itemType), items: clone(items), storySnapshot: clone(project.creator.story),
});
const applyStory = (project, story, history) => {
  validateStory(project, story);
  return { ...project, creator: { ...project.creator, story,
    records: history ? [...project.creator.records, history] : project.creator.records,
  } };
};
const assertEventPatchRefs = patch => {
  for (const key of ['characterIds', 'predecessorIds', 'episodeIds']) {
    if (own(patch, key) && !Array.isArray(patch[key])) fail('CREATOR_STORY_INVALID_REFERENCE', '关联必须是条目 ID 列表。');
  }
};
export const upsertCreatorStoryItem = (state, kind, id, itemType, patch = {}) => mutateProject(state, kind, id, p => {
  const key = storyKey(itemType), previous = patch.id ? p.creator.story[key].find(item => item.id === patch.id) : null;
  if (key === 'events') assertEventPatchRefs(patch);
  const itemId = previous?.id || patch.id || uid();
  const item = key === 'events' ? normalizeStoryEvent({ ...previous, ...clone(patch), id: itemId }, itemId, p.creator.story.events.length)
    : normalizeStoryCharacter({ ...previous, ...clone(patch), id: itemId }, itemId);
  const items = previous ? p.creator.story[key].map(old => old.id === itemId ? item : old) : [...p.creator.story[key], item];
  let history;
  if(previous&&JSON.stringify(previous)!==JSON.stringify(item)){
    const latest=p.creator.records.findLast(record=>record.type==='story-history'&&record.operation==='edit'&&record.items?.[0]?.id===previous.id);
    if(!latest||Date.now()-Date.parse(latest.createdAt)>30000)history=storyHistoryRecord(p,'edit',itemType,[previous]);
  }
  return applyStory(p, { ...p.creator.story, [key]: items },history);
});
export const removeCreatorStoryItem = (state, kind, id, itemType, itemId) => mutateProject(state, kind, id, p => {
  const key = storyKey(itemType), item = p.creator.story[key].find(old => old.id === itemId);
  if (!item) return p;
  const story = { ...p.creator.story, [key]: p.creator.story[key].filter(old => old.id !== itemId) };
  story.events = story.events.map((event, order) => ({ ...event, order,
    ...(key === 'characters' ? { characterIds: event.characterIds.filter(characterId => characterId !== itemId) }
      : { predecessorIds: event.predecessorIds.filter(eventId => eventId !== itemId), parentEventId: event.parentEventId === itemId ? null : event.parentEventId }),
  }));
  return applyStory(p, story, storyHistoryRecord(p, 'delete', itemType, [item]));
});
export const reorderCreatorStoryItems = (state, kind, id, itemType, itemIds) => mutateProject(state, kind, id, p => {
  const key = storyKey(itemType), byId = new Map(p.creator.story[key].map(item => [item.id, item]));
  if (!Array.isArray(itemIds) || itemIds.length !== byId.size || new Set(itemIds).size !== byId.size || itemIds.some(itemId => !byId.has(itemId))) {
    fail('CREATOR_STORY_INVALID_ORDER', '排序必须包含每个现有条目且不能重复。');
  }
  const items = itemIds.map((itemId, order) => key === 'events' ? { ...byId.get(itemId), order } : byId.get(itemId));
  return applyStory(p, { ...p.creator.story, [key]: items });
});
export const splitCreatorEvent = (state, kind, id, eventId, children) => mutateProject(state, kind, id, p => {
  const parent = p.creator.story.events.find(item => item.id === eventId);
  if (!parent) fail('CREATOR_STORY_REFERENCE_MISSING', '要拆分的事件不存在。');
  if (!Array.isArray(children) || children.length < 2) fail('CREATOR_STORY_INVALID_SPLIT', '拆分至少需要两个子事件。');
  const existingIds = new Set(p.creator.story.events.map(item => item.id));
  const childIds = children.map(child => child?.id || uid());
  if (new Set(childIds).size !== childIds.length || childIds.some(childId => existingIds.has(childId))) fail('CREATOR_STORY_DUPLICATE_ID', '新子事件需要独立且不重复的 ID。');
  const nodes = children.map((child, index) => {
    assertEventPatchRefs(child || {});
    return normalizeStoryEvent({ characterIds: parent.characterIds, episodeIds: parent.episodeIds,
      actualTime: parent.actualTime, accepted: parent.accepted, title: `${parent.title || '事件'}·${index + 1}`,
      predecessorIds: index ? [childIds[index - 1]] : parent.predecessorIds, ...clone(child || {}), id: childIds[index], parentEventId: parent.id,
    }, childIds[index], index);
  });
  const events = p.creator.story.events.flatMap(event => event.id === parent.id ? [{ ...event, isMajor: true }, ...nodes] : [event])
    .map((event, order) => ({ ...event, order }));
  return applyStory(p, { ...p.creator.story, events }, storyHistoryRecord(p, 'split', 'event', [parent]));
});
export const mergeCreatorEvents = (state, kind, id, eventIds, patch = {}) => mutateProject(state, kind, id, p => {
  if (!Array.isArray(eventIds) || eventIds.length < 2 || new Set(eventIds).size !== eventIds.length) fail('CREATOR_STORY_INVALID_MERGE', '合并至少需要两个不同事件。');
  const selectedIds = new Set(eventIds), selected = p.creator.story.events.filter(event => selectedIds.has(event.id));
  if (selected.length !== eventIds.length) fail('CREATOR_STORY_REFERENCE_MISSING', '要合并的事件不存在。');
  assertEventPatchRefs(patch);
  const mergedId = patch.id || uid();
  if (p.creator.story.events.some(event => event.id === mergedId)) fail('CREATOR_STORY_DUPLICATE_ID', '合并事件需要新的独立 ID。');
  const union = key => [...new Set(selected.flatMap(event => event[key]))];
  const parentIds = new Set(selected.map(event => event.parentEventId).filter(parentId => parentId && !selectedIds.has(parentId)));
  const merged = normalizeStoryEvent({ title: selected.map(event => event.title).filter(Boolean).join('＋'),
    content: selected.map(event => event.content ? `【${event.title || '事件'}】\n${event.content}` : '').filter(Boolean).join('\n\n'),
    result: selected.map(event => event.result ? `【${event.title || '事件'}】\n${event.result}` : '').filter(Boolean).join('\n\n'),
    characterIds: union('characterIds'), episodeIds: union('episodeIds'), predecessorIds: union('predecessorIds').filter(eventId => !selectedIds.has(eventId)),
    parentEventId: parentIds.size === 1 ? [...parentIds][0] : null, actualTime: selected.map(event => event.actualTime).filter(Boolean).join(' → '),
    accepted: selected.every(event => event.accepted), ...clone(patch), id: mergedId,
  }, mergedId, 0);
  let inserted = false;
  const events = p.creator.story.events.flatMap(event => {
    if (!selectedIds.has(event.id)) return [{ ...event,
      predecessorIds: [...new Set(event.predecessorIds.map(previousId => selectedIds.has(previousId) ? mergedId : previousId))],
      parentEventId: selectedIds.has(event.parentEventId) ? mergedId : event.parentEventId,
    }];
    if (inserted) return [];
    inserted = true; return [merged];
  }).map((event, order) => ({ ...event, order }));
  return applyStory(p, { ...p.creator.story, events }, storyHistoryRecord(p, 'merge', 'event', selected));
});

const documentContent = document => typeof document === 'string' ? document : text(document?.content) || text(document?.text) || text(document?.masterScript);
const freezeDocument = (document, previous) => {
  const input = typeof document === 'string' ? { content: document } : clone(document || {}), content = documentContent(input);
  const sameDocument = previous && (input.id ? input.id === previous.id
    : input.sourceProjectId ? input.sourceProjectId===previous.sourceProjectId&&input.sourceSide===previous.sourceSide
    : input.filePath ? input.filePath===previous.filePath
    : !previous.sourceProjectId&&text(input.name||input.fileName)===previous.name);
  const id = input.id || (sameDocument ? previous.id : uid());
  // Compiled fruit projects use the explicit headings emitted by buildCreatorText.
  const parseText = content.replace(/\r\n?/g, '\n');
  const parsed = splitFullScript(parseText);
  const previousEpisodes = sameDocument ? previous.episodes || [] : [];
  const used = new Set();
  const episodes = parsed.episodes.map((episode, index) => {
    const prior = previousEpisodes.find(old => old.title === episode.title && !used.has(old.id));
    if (prior) used.add(prior.id);
    return { ...episode, id: prior?.id || (sameDocument ? uid() : `${id}_episode_${index + 1}`) };
  });
  return { ...input, id, name: text(input.name || input.fileName) || '导入资料', content, episodes, detected: parsed.detected };
};
export const importCreatorSource = (state, id, document) => mutateProject(state, 'script', id, p => {
  const source = freezeDocument(document, p.creator.source);
  let next = { ...p, creator: { ...p.creator, source } };
  if (!p.episodes.length) next.episodes = source.episodes.map(episode => normalizeEpisode({ id: uid(), title: episode.title, sourceEpisodeIds: [episode.id] }, 'script'));
  if (JSON.stringify(p.creator.source) !== JSON.stringify(source)) {
    next = staleEpisodes(next, 'script');
    if(p.creator.source?.content!==source.content)next={...next,creator:{...next.creator,sections:Object.fromEntries(Object.entries(next.creator.sections).map(([key,value])=>[key,value.input.trim()?{...value,inputStale:true}:value]))}};
  }
  return next;
});
export const addCreatorReference = (state, id, document) => mutateProject(state, 'script', id, p => {
  if (p.creator.references.length >= 3) fail('CREATOR_REFERENCE_LIMIT', '最多可添加三份核心对标材料。');
  return { ...p, creator: { ...p.creator, references: [...p.creator.references, freezeDocument(document)] } };
});

export const appendCreatorRecord = (state, kind, id, record = {}) => mutateProject(state, kind, id, p => {
  if (record.projectId && record.projectId !== id) fail('CREATOR_PROJECT_MISMATCH', '候选记录与目标项目不一致。');
  const recordId = record.id || uid(), previous = p.creator.records.find(item => item.id === recordId);
  const target = clone(record.target || previous?.target || {});
  const fingerprint = record.inputFingerprint || previous?.inputFingerprint || creatorInputFingerprint(p, target);
  const next = { ...previous, ...clone(record), id: recordId, projectId: id, target,
    output: text(record.output ?? previous?.output), inputFingerprint: fingerprint,
    status: record.status || previous?.status || 'candidate', createdAt: previous?.createdAt || record.createdAt || now(),
    stale: fingerprint !== creatorInputFingerprint(p, target),
  };
  const records = previous ? p.creator.records.map(item => item.id === recordId ? next : item) : [...p.creator.records, next];
  return { ...p, creator: { ...p.creator, records } };
});

export const deleteCreatorRecord = (state, kind, id, recordId) => mutateProject(state, kind, id, p => {
  const record=p.creator.records.find(r=>r.id===recordId);
  if(record?.status==='running')fail('CREATOR_RUNNING_RECORD', '请先停止正在运行的任务再删除');
  // Adopted content lives in sections/episodes. Deleting its provenance record
  // must never implicitly erase that content or unrelated chat and candidates.
  return {...p,creator:{...p.creator,records:p.creator.records.filter(r=>r.id!==recordId)}};
});

/** Explicit stale/lock overrides are allowStale:true and unlock:true. No adoption
 * is automatic. A history/deleted-node record uses this same API for restoration.
 */
export const adoptCreatorRecord = (state, kind, id, recordId, { mode = 'replace', side, allowStale = false, unlock = false } = {}) => mutateProject(state, kind, id, p => {
  const record = p.creator.records.find(item => item.id === recordId);
  if (!record) fail('CREATOR_RECORD_MISSING', '找不到该候选或历史版本。');
  if (record.projectId && record.projectId !== id) fail('CREATOR_PROJECT_MISMATCH', '候选记录与目标项目不一致。');
  if (p.creator.mode === 'framework' && isFrameworkTask(record.target)) return applyFrameworkProjectRecord(p, recordId, {mode,side,allowStale,unlock});
  if (record.type === 'story-history') {
    const history = storyHistoryRecord(p, 'restore', record.itemType || 'event');
    const next = applyStory(p, normalizeStory(record.storySnapshot, id), history);
    return { ...next, creator: { ...next.creator, records: next.creator.records.map(item => item.id === recordId ? { ...item, status: 'restored', restoredAt: now() } : item) } };
  }
  if (record.type === 'deleted-node') {
    if (p.episodes.some(episode => episode.id === record.node.id)) return p;
    const episodes = [...p.episodes];
    episodes.splice(Math.min(record.index ?? episodes.length, episodes.length), 0, clone(record.node));
    const assigned = new Set(record.assignedEventIds || []);
    const story = { ...p.creator.story, events: p.creator.story.events.map(event => assigned.has(event.id)
      ? { ...event, episodeIds: [...new Set([...event.episodeIds, record.node.id])] } : event) };
    return { ...p, episodes, creator: { ...p.creator, story, records: p.creator.records.map(item => item.id === recordId ? { ...item, status: 'restored', restoredAt: now() } : item) } };
  }
  if (mode !== 'replace' && mode !== 'append') fail('CREATOR_INVALID_ADOPTION_MODE', '请选择替换或追加。');
  const target = { ...record.target, side: side || record.target?.side || 'output' }, field = sideField(kind, target.side);
  const node = target.episodeId ? p.episodes.find(episode => episode.id === target.episodeId) : p.creator.sections[target.section];
  if (!node) fail('CREATOR_TARGET_MISSING', '原目标已删除，请选择恢复或另存候选。');
  const stale = record.inputFingerprint !== creatorInputFingerprint(p, record.target);
  // Recovery of an old history version is always an explicit user operation.
  if (stale && !allowStale && record.type !== 'history') fail('CREATOR_STALE_RESULT', '该候选基于旧版输入，请复核后明确采用。');
  if (!target.episodeId && node.locked && !unlock) fail('CREATOR_LOCKED', '该成果已锁定，请明确解锁后采用。');
  const previous = target.episodeId ? text(node[field]) : text(node[target.side]);
  if((target.task==='rewriteStory'||target.format==='rewriteStory')&&record.type!=='history'){
    rewriteStoryInput(p,target,{strict:true});
    const output=mergeRewriteStory(previous,record.output,p.creator.sections.macroOutline?.output,target.eventIds);
    const history=historyRecord(p,{section:'outline',side:'output'},previous,{previousAccepted:node.accepted,previousLocked:node.locked});
    const next=patchSection(p,kind,'outline',{output,accepted:false,stale:false,...(unlock?{locked:false}:{})});
    next.creator.records=[...next.creator.records.map(r=>r.id===recordId?{...r,status:'adopted',adoptedAt:now()}:r),history];
    return next;
  }
  const macro = target.section==='macroOutline'&&target.side==='output';
  if(macro&&record.type!=='history')validateRewriteOutline(record.output);
  if(target.format==='rewriteMainline'&&record.type!=='history')validateRewriteMainline(record.output,p.creator.sections.macroOutline?.output);
  const rewriteMainlineTarget=p.creator.mode==='rewrite'&&target.section==='outline'&&target.side==='output';
  const storyHistory=rewriteMainlineTarget&&record.type==='history'&&readRewriteMainline(record.output).format==='story-v1';
  const mainline=rewriteMainlineTarget&&!storyHistory&&readRewriteMainline(record.output).eventGroups.length>0;
  if(mainline&&record.type!=='history')validateRewriteMainline(record.output,p.creator.sections.macroOutline?.output);
  const output = macro ? JSON.stringify(mode==='append'?{groups:[...readRewriteOutline(previous).groups,...copyOutlineGroups(readRewriteOutline(record.output).groups)]}:readRewriteOutline(record.output)) : mainline&&mode==='append'?JSON.stringify(validateRewriteMainline({legacyText:readRewriteMainline(previous).legacyText,eventGroups:[...readRewriteMainline(previous).eventGroups,...readRewriteMainline(record.output).eventGroups]},p.creator.sections.macroOutline?.output)):mainline?JSON.stringify(record.type==='history'?readRewriteMainline(record.output):validateRewriteMainline(record.output,p.creator.sections.macroOutline?.output)):mode === 'append' ? [previous, record.output].filter(Boolean).join('\n\n') : record.output;
  const history = historyRecord(p, target, previous, { previousAccepted: node.accepted, previousLocked: node.locked });
  let next = target.episodeId ? patchEpisode(p, kind, target.episodeId, {
    [field]: output, stale, ...(target.side === 'output' ? { finalConfirmed: false,
      generationVersion: node.generationVersion + 1,
      generationVersions: [...node.generationVersions, { id: uid(), version: node.generationVersion + 1, recordId, side: target.side,
        output, previous, inputFingerprint: record.inputFingerprint, createdAt: now() }],
    } : {}),
  }) : patchSection(p, kind, target.section, {
    [target.side]: output, ...(target.side === 'output' ? { accepted: (macro||rewriteMainlineTarget)&&record.type==='history'?Boolean(record.previousAccepted):true } : {}), stale, ...(unlock ? { locked: false } : {}),
  });
  next.creator.records = [...next.creator.records.map(item => item.id === recordId ? { ...item, status: 'adopted', adoptedAt: now(), adoptedSide: target.side, stale } : item), history];
  return next;
});

export const buildCreatorText = (project, kind = 'script', side = 'output', { includeSections = false } = {}) => {
  if (!project) return '';
  const p = normalizeCreatorProject(project, kind);
  sideField(kind, side);
  const finalOnly = p.creator.mode === 'framework' && side === 'output';
  const sections = includeSections && !finalOnly ? Object.entries(p.creator.sections)
    .map(([key, section]) => text(section[side]).trim() ? `【${p.creator.mode==='rewrite'&&key==='outline'?'主线':sectionLabels[key] || key}】\n${key==='macroOutline'?rewriteOutlineText(section[side]):p.creator.mode==='rewrite'&&key==='outline'?rewriteMainlineText(section[side],p.creator.sections.macroOutline?.output):section[side].trim()}` : '').filter(Boolean) : [];
  const episodes = finalOnly ? p.episodes.filter(episode => episode.type === 'episode') : p.episodes;
  const blocks = p.creator.mode === 'ip' && side === 'output' ? buildIPOutputBlocks(episodes, kind) : episodeBlocks(episodes, kind, side);
  const content = [...sections, includeSections && !finalOnly ? buildAdoptedStoryText(p) : '', blocks].filter(Boolean).join('\n\n');
  return p.creator.mode === 'ip' && side === 'output' ? formatIPScriptText(content) : content;
};

const buildIPOutputBlocks = (episodes, kind) => {
  const field = sideField(kind, 'output');
  let episodeNumber = 0;
  return episodes.map(episode => {
    if (episode.type === 'episode') episodeNumber++;
    const content = formatIPScriptText(text(episode[field])).trim();
    if (!content) return '';
    // Generated/imported drafts may already contain their own episode title.
    const hasEpisodeTitle = /^[ \t]*(?:[【\[]?[ \t]*)?第[一二三四五六七八九十百千万零〇两\d]+[ \t]*集(?:[ \t:：】\]]|$)/m.test(content);
    if (episode.type === 'episode' && hasEpisodeTitle) return content;
    const title = formatIPScriptText(episode.title || (episode.type === 'episode' ? `第${episodeNumber}集` : episode.type === 'settings' ? '设定' : '自定义内容')).trim();
    return `【${title}】\n${content}`;
  }).filter(Boolean).join('\n\n');
};

const buildAdoptedStoryText = project => {
  const story = adoptedStory(project), characters = new Map(story.characters.map(item => [item.id, item.name])),
    events = new Map(story.events.map((item, index) => [item.id, `事件${index + 1}`])), episodes = new Map(project.episodes.map(item => [item.id, item.title]));
  const characterText = story.characters.map((item, index) => [
    `人物${index + 1}：${item.name || '未命名人物'}`, item.description && `小传：${item.description}`,
    item.start && `轨迹起点：${item.start}`, item.end && `轨迹终点：${item.end}`,
  ].filter(Boolean).join('\n')).join('\n\n');
  const eventText = story.events.map((item, index) => {
    const names = item.characterIds.map(id => characters.get(id)).filter(Boolean), prerequisites = item.predecessorIds.map(id => events.get(id)).filter(Boolean),
      episodeNames = item.episodeIds.map(id => episodes.get(id)).filter(Boolean);
    return [`事件${index + 1}：${item.title || '未命名事件'}`, item.content && `内容：${item.content}`, item.result && `结果：${item.result}`,
      names.length && `人物：${names.join('、')}`, prerequisites.length && `前置事件：${prerequisites.join('、')}`,
      events.has(item.parentEventId) && `所属大事件：${events.get(item.parentEventId)}`, episodeNames.length && `分集：${episodeNames.join('、')}`,
      item.actualTime && `实际时间：${item.actualTime}`,
    ].filter(Boolean).join('\n');
  }).join('\n\n');
  return [characterText && `【已采用人物】\n${characterText}`, eventText && `【已采用事件】\n${eventText}`].filter(Boolean).join('\n\n');
};

const parseMasterBoundaries = (master) => {
  const source = text(master).replace(/\r\n?/g, '\n').trim();
  const lines = source.split('\n'), starts = [];
  const hasExplicit=lines.some(line=>/^【[^】]+】\s*$/.test(line.trim()));
  lines.forEach((line, index) => {
    const explicit = line.trim().match(/^【([^】]+)】\s*$/);
    const numbered = line.trim().match(/^(?:第[一二三四五六七八九十百千\d]+[集章节幕部回]|Episode\s+\d+|EP\s*\d+)(?:\s*[:：].*|\s+.*)?$/i);
    if (explicit || !hasExplicit&&numbered) starts.push({ index, title: explicit ? explicit[1].trim() : line.trim() });
  });
  if (!starts.length) return { source, entries: null };
  const entries = starts.map((start, index) => ({ title: start.title,
    content: lines.slice(start.index + 1, starts[index + 1]?.index ?? lines.length).join('\n').trim().replace(/\n*---\s*$/, '').trim(),
  }));
  const preface = lines.slice(0, starts[0].index).join('\n').trim();
  if (preface) entries.unshift({ title: '设定', content: preface, type: 'settings' });
  if (new Set(entries.map(entry => entry.title)).size !== entries.length) fail('CREATOR_AMBIGUOUS_MASTER', '存在重复标题，请先明确节点边界。');
  return { source, entries };
};
export const editCreatorMaster = (state, kind, id, side, master) => mutateProject(state, kind, id, p => {
  const field = sideField(kind, side), parsed = parseMasterBoundaries(master);
  if (!parsed.entries) {
    if (p.episodes.length > 1 && parsed.source) fail('CREATOR_AMBIGUOUS_MASTER', '无法识别各集边界，请保留标题或先确认拆分。');
    if (!p.episodes.length && parsed.source) return { ...p, episodes: [normalizeEpisode({ id: uid(), title: '完整剧本', [field]: parsed.source }, kind)] };
    const records = [...p.creator.records];
    let next = p;
    for (const episode of p.episodes) {
      if (text(episode[field]) !== parsed.source) records.push(historyRecord(p, { episodeId: episode.id, side }, text(episode[field])));
      next = patchEpisode(next, kind, episode.id, { [field]: parsed.source });
    }
    return { ...next, creator: { ...next.creator, records } };
  }
  const reserved = new Set(p.episodes.filter(episode => parsed.entries.some(entry => entry.title === episode.title)).map(episode => episode.id));
  const used = new Set(), records = [...p.creator.records];
  const episodes = parsed.entries.map((entry, index) => {
    let previous = p.episodes.find(episode => episode.title === entry.title && !used.has(episode.id));
    if (!previous && p.episodes[index] && !reserved.has(p.episodes[index].id) && !used.has(p.episodes[index].id)) previous = p.episodes[index];
    if (previous) used.add(previous.id);
    const node = previous || normalizeEpisode({ id: uid(), title: entry.title, type: entry.type || (/^(?:第|Episode|EP)/i.test(entry.title) ? 'episode' : 'custom') }, kind);
    if (previous && text(previous[field]) !== entry.content) records.push(historyRecord(p, { episodeId: node.id, side }, text(previous[field])));
    return patchEpisode({ ...p, episodes: [node] }, kind, node.id, { title: entry.title, [field]: entry.content }).episodes[0];
  });
  // A missing heading clears that side but retains the other side and stable node.
  // Deleting a complete node remains a distinct action with a restorable snapshot.
  for (const node of p.episodes.filter(episode => !used.has(episode.id))) {
    if (text(node[field])) records.push(historyRecord(p, { episodeId: node.id, side }, text(node[field])));
    episodes.push(patchEpisode({ ...p, episodes: [node] }, kind, node.id, { [field]: '' }).episodes[0]);
  }
  return { ...p, episodes, creator: { ...p.creator, records } };
});

export const archiveCreatorProject = (state, id, { side = 'output', includeSections = false, stageDraft = false } = {}) => {
  const kind = (state.scriptProjects || []).some(p => p.id === id) ? 'script' : 'fruit';
  const p = normalizeCreatorProject((state[projectKey(kind)] || []).find(project => project.id === id), kind);
  if (!p) return state;
  const content = buildCreatorText(p, kind, side, { includeSections });
  if (!content.trim()) fail('CREATOR_EMPTY_ARCHIVE', '所选范围没有正文，请完成后再收录。');
  const library = state.scriptLibrary || [], existing = library.find(item => item.sourceProjectId === id && (!item.sourceKind || item.sourceKind === kind));
  const timestamp = now(), creatorMode = p.creator.mode, sourceMode = creatorMode === 'rewrite' ? 'rewrite' : creatorMode === 'fruit' ? 'fruit' : 'original';
  const modeLabel = { ip: 'IP · 小说改编', fruit: '果子', rewrite: '洗稿', free: '原创·自由', framework: '原创·框架' }[creatorMode];
  const versions = existing?.versions?.length ? clone(existing.versions) : existing ? [{
    id: `${existing.id}_legacy`, version: 1, content: text(existing.content), createdAt: existing.createdAt,
  }] : [];
  const version = { id: uid(), version: versions.length + 1, name: p.name, sourceProjectId: id, sourceKind: kind,
    creatorMode, sourceMode, modeLabel, side, stageDraft:Boolean(stageDraft), includeSections: creatorMode === 'framework' && side === 'output' ? false : Boolean(includeSections),
    content, episodes: clone(p.episodes), sections: clone(p.creator.sections), story: clone(p.creator.story),
    ...(p.creator.mode==='framework'?{framework:clone(p.creator.framework),sourcePlanId:p.creator.framework.activePlanId}:{}),createdAt: timestamp };
  const item = { ...existing, id: existing?.id || uid(), name: p.name, sourceProjectId: id, sourceKind: kind,
    sourceMode, creatorMode, modeLabel, content, stageDraft:version.stageDraft, side: version.side, includeSections: version.includeSections,
    versions: [...versions, version], currentVersionId: version.id, createdAt: existing?.createdAt || timestamp, updatedAt: timestamp };
  return { ...state, scriptLibrary: existing ? library.map(entry => entry.id === existing.id ? item : entry) : [...library, item] };
};
