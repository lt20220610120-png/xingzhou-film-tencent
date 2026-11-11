const {randomUUID} = require('node:crypto');
const {editableCollab, numberedEpisodes} = require('../cloud-backend/src/collab-episodes.cjs');
const {validateReview, signature, verified} = require('../cloud-backend/src/art-review-repository.cjs');
const {
  parsePublicationOutput, validatePublicationAssets, publicationFirstEpisode, mergePublicationOutput,
} = require('../cloud-backend/src/analysis-publication.cjs');

function fail(message, status = 409) {
  throw Object.assign(new Error(message), {status});
}

function addEpisodeAsset(record, existing, item, number, firstEpisode) {
  if (existing) {
    existing.episodes = [...new Set([...(existing.episodes || []), number])].sort((a, b) => a - b);
    if (!existing.description) existing.description = item.description || '';
    return existing;
  }
  const asset = {
    id: randomUUID(), project_id: record.project.id, name: item.name,
    category: item.category, description: item.description || '',
    first_episode: firstEpisode, episodes: [number], image_url: '', images: [],
  };
  record.assets.push(asset);
  return asset;
}

function updateProgress(project, number, progress, output = project.analysis_output || '') {
  project.analysis_progress = {...project.analysis_progress, [number]: progress};
  project.analysis_output = output;
  project.updated_at = new Date().toISOString();
}

function publishAnalysis(record, payload, number, episode, previous) {
  const {project, assets} = record;
  if (!episode || String(episode.content || '') !== payload.sourceContent) {
    fail('本集原文已修改，分析结果已保存在本机，请同步最新剧本后继续');
  }
  const parsed = parsePublicationOutput(payload.output, number);
  const publishedAssets = validatePublicationAssets(payload.assets, parsed, number).map(item => ({
    item, firstEpisode: publicationFirstEpisode(item, assets, number),
  }));
  const receipt = () => ({id: project.id, updated_at: project.updated_at, fingerprint: payload.fingerprint});
  if (previous.output === payload.output && previous.fingerprint === payload.fingerprint) return receipt();
  if ((previous.output || '') !== (payload.baseOutput || '')) {
    fail('本集已有其他分析结果，已保留你的本地进度，请刷新核对');
  }

  const existingByName = new Map(assets.map(asset => [asset.name, asset]));
  for (const {item, firstEpisode} of publishedAssets) {
    const existing = existingByName.get(item.name);
    const saved = addEpisodeAsset(record, existing, item, number, firstEpisode);
    saved.category = item.category;
    saved.first_episode = firstEpisode;
  }
  const output = mergePublicationOutput(project.analysis_output, payload.output, number);
  updateProgress(project, number, {
    ...previous, fingerprint: payload.fingerprint, output: payload.output, updatedAt: new Date().toISOString(),
  }, output);
  return receipt();
}

function saveReviewCandidate(data, episode, number, old) {
  validateReview(data, episode, number);
  const next = structuredClone(data);
  next.published = structuredClone(old?.published || {});
  next.managedAssetNames = [...(old?.managedAssetNames || [])];
  next.classificationCorrections = structuredClone(old?.classificationCorrections || []);
  next.publicationWarnings = structuredClone(old?.publicationWarnings || []);
  delete next.pending;
  delete next.syncError;
  delete next.writeId;
  return next;
}

function visualItemsByName(scenes) {
  const groups = new Map();
  for (const scene of scenes) {
    for (const item of scene.items) {
      if (item.detailStatus === 'nonvisual') continue;
      if (!groups.has(item.name)) groups.set(item.name, []);
      groups.get(item.name).push(item);
    }
  }
  return groups;
}

function formatReviewedOutput(entries, number) {
  const headings = {character: '人物', scene: '场景', prop: '道具'};
  const sections = Object.entries(headings).map(([category, title]) => {
    const lines = [...entries.values()]
      .filter(item => item.category === category)
      .map(item => `- ${item.name} ${item.description}`);
    return `${title}：\n${lines.join('\n') || '- 无'}`;
  });
  return `### 第${number}集\n${sections.join('\n')}`;
}

function publishReviewedScenes(record, old, sceneIds, previousOutput, number, accountId, time) {
  if (!Array.isArray(sceneIds) || !sceneIds.length || new Set(sceneIds).size !== sceneIds.length) {
    fail('请选择已核实场景', 400);
  }
  const next = structuredClone(old);
  next.published ||= {};
  const chosen = sceneIds.map(id => {
    const scene = next.scenes.find(item => item.id === id);
    if (!scene || !verified(scene)) fail(`场景 ${id} 尚未核实或细节待补齐`, 400);
    return scene;
  });
  const previousNames = Object.values(next.published).flatMap(scene => scene.items.map(item => item.name));
  for (const scene of chosen) {
    next.published[scene.id] = {
      id: scene.id, source: scene.source, items: structuredClone(scene.items),
      signature: signature(scene), at: time, actor: accountId,
    };
  }
  const full = next.scenes.every(scene => next.published[scene.id]?.signature === signature(scene));
  if (full) {
    const ids = new Set(next.scenes.map(scene => scene.id));
    for (const id of Object.keys(next.published)) if (!ids.has(id)) delete next.published[id];
  }

  const groups = visualItemsByName(Object.values(next.published));
  const selected = new Set(sceneIds);
  const newlyPublished = visualItemsByName(next.scenes.filter(scene => selected.has(scene.id)));
  const existingByName = new Map(record.assets.map(asset => [asset.name, asset]));
  const entries = new Map();
  next.classificationCorrections ||= [];
  next.publicationWarnings = (old.publicationWarnings || []).filter(warning => groups.has(warning.name) && !newlyPublished.has(warning.name));
  for (const [name, items] of groups) {
    const existing = existingByName.get(name);
    const selectedItems = newlyPublished.get(name);
    const candidates = selectedItems || items;
    const categories = [...new Set(candidates.map(item => item.category))];
    // Only the newly verified scenes can change an existing classification.
    let category = categories[0];
    if (existing && (!selectedItems || categories.includes(existing.category))) category = existing.category;
    const entry = {...(candidates.find(item => item.category === category) || items[0]), category};
    entries.set(name, entry);
    if (selectedItems && categories.length > 1) {
      next.publicationWarnings.push({name, categories, category, message: `资产 ${name} 分类待核对，已按 ${category} 发布并保留原始核实条目`});
    }
    if (existing && existing.category !== category) {
      next.classificationCorrections.push({name, assetId: existing.id, from: existing.category, to: category, actor: accountId, at: time});
      existing.category = category;
    }
    const firstEpisode = Math.min(number, Math.max(1, Number(entry.firstEpisode) || number));
    addEpisodeAsset(record, existing, entry, number, firstEpisode);
  }

  const legacyNames = full ? [...String(previousOutput || '').matchAll(/^[-*•]\s*(【[^】]+】)/gm)].map(match => match[1]) : [];
  next.managedAssetNames = [...new Set([...(old.managedAssetNames || []), ...previousNames, ...entries.keys(), ...legacyNames])];
  for (const name of new Set([...previousNames, ...legacyNames])) {
    const asset = existingByName.get(name);
    if (asset && !entries.has(name)) asset.episodes = (asset.episodes || []).filter(episode => episode !== number);
  }
  return {next, output: formatReviewedOutput(entries, number)};
}

function applyLocalArt(record, action, payload, accountId) {
  const {project} = record;
  if (!accountId || (payload.accountId && payload.accountId !== accountId) ||
      (project.owner_id && project.owner_id !== accountId) ||
      (payload.projectId && payload.projectId !== project.id) || !editableCollab(project)) {
    fail('没有当前本地项目的操作权限', 403);
  }
  const number = Number(payload.episodeNumber);
  if (!Number.isInteger(number) || number < 1) fail('分集编号无效', 400);
  const episode = numberedEpisodes(project.episodes).find(entry => entry.number === number)?.episode;
  const previous = project.analysis_progress?.[number] || {};
  if (action === 'publishAnalysis') return publishAnalysis(record, payload, number, episode, previous);
  if (action !== 'saveArtReview' && action !== 'publishArtReview') fail('本地美术操作无效', 400);
  if (!episode) fail('本集不存在，请刷新核对');
  if (typeof payload.writeId !== 'string' || !payload.writeId || payload.writeId.length > 100) {
    fail('缺少保存请求编号', 400);
  }
  const old = previous.review;
  if (old?.lastWriteId === payload.writeId) return structuredClone(old);
  const version = Number(old?.version || 0);
  if (Number(payload.baseVersion) !== version) fail('本集已有其他核实修改，本地版本保留，请刷新后核对');

  const time = Date.now();
  let next;
  let output = project.analysis_output || '';
  let progress = previous;
  if (action === 'saveArtReview') {
    next = saveReviewCandidate(payload.data, episode, number, old);
  } else {
    if (!old) fail('请先保存并核实本集清单');
    validateReview(old, episode, number);
    const published = publishReviewedScenes(record, old, payload.sceneIds, previous.output, number, accountId, time);
    next = published.next;
    progress = {...previous, output: published.output, fingerprint: `art-review-${version + 1}`};
    output = mergePublicationOutput(output, published.output, number);
  }
  Object.assign(next, {version: version + 1, lastWriteId: payload.writeId, updatedAt: time, updatedBy: accountId});
  updateProgress(project, number, {...progress, review: next}, output);
  return structuredClone(next);
}

module.exports = {applyLocalArt};
