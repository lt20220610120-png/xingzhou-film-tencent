const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { writeJsonAtomic } = require('./atomic-json.cjs');
const { patchShot, mergeDirectorEpisodes } = require('../cloud-backend/src/storyboard-merge.cjs');
const { appendArtEpisodeSnapshot, composeDirectorScript, numberedEpisodes } = require('../cloud-backend/src/collab-episodes.cjs');
const { applyEpisodeIdentityChange, composeEpisodeIdentityScript, filterRemovedDirectorEpisodes } = require('../cloud-backend/src/episode-identity-repair.cjs');
const { validateImageComposition } = require('../cloud-backend/src/image-composition.cjs');
const { publishedReferenceUses } = require('../cloud-backend/src/reference-upload-delete.cjs');

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const accountFolder = id => createHash('sha256').update(String(id)).digest('hex');
const time = () => new Date().toISOString();
const allowedRoles = new Set(['artist', 'collaborator', 'artist_collaborator']);
const categories = new Set(['character', 'scene', 'prop']);
const error = (message, status = 400) => Object.assign(new Error(message), { status });

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (cause) {
    if (cause.code === 'ENOENT') return fallback;
    throw error('本机项目资料无法读取，请先核对资料目录', 500);
  }
}

function summarize({ episodes, script, analysis_output, analysis_progress, ...row }) {
  return { ...row, episodeCount: (episodes || []).length };
}

function localAsset(projectId, value, previous) {
  return {
    id: previous?.id || randomUUID(), project_id: projectId,
    name: String(value.name || '未命名资产'), description: String(value.description || ''),
    category: categories.has(value.category) ? value.category : 'character',
    first_episode: Number(value.firstEpisode || value.first_episode || 1),
    episodes: Array.isArray(value.episodes) ? value.episodes : [],
    image_url: previous?.image_url || '', images: previous?.images || [],
    adoptedImageId: previous?.adoptedImageId || null,
    created_at: previous?.created_at || time(), updated_at: time(),
  };
}

function adoptAssetImage(asset, image) {
  asset.adoptedImageId = image?.id || null;
  asset.image_url = image?.url || '';
  asset.updated_at = time();
}

function createLocalCollabService({ cloud, getSession, getDirectory, mediaFor, isStorageLocked = () => false, projectBusy = () => false, adoptedVoices = () => ({}) }) {
  const queues = new Map(), imports = new Map(), importResults = new Map(), transfers = new Set(), indexReads = new Map(), preparingProjects = new Map();
  function scope() {
    const session = getSession();
    const account = session?.account;
    if (!session?.token || !account?.id || account.banned) throw error('请先登录有效账号', 401);
    const directory = getDirectory();
    const root = path.join(directory, '本地项目', accountFolder(account.id));
    return { account, token: session.token, directory, root };
  }
  function assertScope(current, writing = false) {
    const next = scope();
    if (current.token !== next.token || current.account.id !== next.account.id || current.root !== next.root) throw error('账号或资料目录已变化，请重新操作', 409);
    if (writing && isStorageLocked()) throw error('资料目录正在迁移，请稍后操作', 409);
  }
  const key = (current, id) => current.root + '|' + id;
  const file = (current, id) => path.join(current.root, id + '.json');
  const view = (current, record) => mediaFor(current).materialize(record);
  async function stored(current, id) {
    if (!UUID.test(String(id || ''))) return null;
    const record = await readJson(file(current, id));
    if (record && (record.project?.owner_id !== current.account.id || record.project.id !== id)) throw error('项目归属与当前账号不匹配', 403);
    return record;
  }
  async function save(current, record) {
    assertScope(current, true);
    await writeJsonAtomic(file(current, record.project.id), record);
    assertScope(current);
  }
  function serial(current, id, work) {
    const k = key(current, id);
    const result = (queues.get(k) || Promise.resolve()).then(() => {
      assertScope(current, true);
      return work();
    });
    const tail = result.catch(() => {});
    queues.set(k, tail);
    tail.then(() => { if (queues.get(k) === tail) queues.delete(k); });
    return result;
  }
  function assertEditable(record) {
    if (record.project.deleted_at) throw error('项目已删除，请先恢复', 410);
    if (record.project.locked) throw error('项目已锁定，暂不可编辑', 423);
    if (record.share?.committing) throw error('云端邀请结果待确认，请回到邀请页重试原邀请', 409);
  }
  async function allRecords(current) {
    let entries;
    try { entries = await fs.readdir(current.root); }
    catch (cause) { if (cause.code === 'ENOENT') return []; throw cause; }
    return Promise.all(entries.filter(name => name.endsWith('.json') && UUID.test(name.slice(0, -5))).map(name => stored(current, name.slice(0, -5))));
  }
  function beginLocalPreparation(current, project, retry = false, initialState) {
    if (!UUID.test(project.id) || project.owner_id !== current.account.id || project.myRole !== 'producer' || project.locked || project.deleted_at || isStorageLocked()) return;
    const k = key(current, project.id);
    const previous = importResults.get(k);
    if (imports.has(k) || (!retry && previous && (previous.permanent || Date.now() - previous.at < 60000))) return;
    importResults.delete(k);
    preparingProjects.set(k, project);
    const prepare = async () => {
      const state = initialState || await cloud.localProjectState({ projectId: project.id });
      assertScope(current, true);
      if (state.updatedAt !== project.updated_at) throw error('项目正在更新，请刷新后继续准备本机副本', 409);
      const payload = { projectId: project.id };
      const [assets, media, messages, tasks] = await Promise.all([cloud.listAssets(payload), cloud.listMedia(payload), cloud.listMessages(payload), cloud.listTasks(payload)]);
      assertScope(current, true);
      const bundle = await mediaFor(current).capture({ project, assets, media });
      await serial(current, project.id, async () => {
        const confirmed = await cloud.localProjectState(payload);
        if (confirmed.revision !== state.revision) throw error('云端项目已更新，请刷新后继续准备本机副本', 409);
        const existing = await stored(current, project.id);
        if (existing && !existing.shared) return;
        await save(current, { ...bundle, project: { ...bundle.project, storageMode: 'local' }, cloudRevision: state.revision, messages, tasks });
      });
    };
    const work = prepare().catch(cause => {
      const ineligible = cause.code === 'LOCAL_PROJECT_SHARED' || [403, 423].includes(cause.status);
      importResults.set(k, { at: Date.now(), permanent: ineligible, ...(ineligible ? {} : { message: '本机副本尚未准备好，请刷新项目重试' }) });
    }).finally(() => { imports.delete(k); preparingProjects.delete(k); });
    imports.set(k, work);
  }
  async function write(method, payload, apply, { allowLocked = false, allowDeleted = false } = {}) {
    const current = scope(), id = payload.projectId;
    return serial(current, id, async () => {
      const record = await stored(current, id);
      if (!record || record.shared) return cloud[method](payload);
      if (!allowLocked && !allowDeleted) assertEditable(record);
      else if (record.share?.committing || (!allowDeleted && record.project.deleted_at)) throw error('请先恢复项目或确认邀请结果', 409);
      if (payload.accountId !== undefined && payload.accountId !== current.account.id) throw error('账号已切换，请重新操作', 403);
      const result = await apply(record, current);
      record.project.updated_at = time();
      await save(current, record);
      return result;
    });
  }
  async function read(method, payload, select) {
    const current = scope();
    const record = await stored(current, payload.projectId);
    assertScope(current);
    return record && !record.shared ? select(view(current, record), current) : cloud[method](payload);
  }
  async function addFile(method, payload, assetImage = false) {
    return write(method, payload, async (record, current) => {
      const { project, media, assets } = record;
      const asset = assetImage && assets.find(row => row.id === payload.assetId);
      if (assetImage && !asset) throw error('资产不存在', 404);
      const filename = path.basename(payload.filePath || '');
      const existing = method === 'attachGeneratedAssetImage' && asset.images?.find(image => image.filename === filename);
      if (existing) return view(current, { project, assets: [asset], media: [existing] }).media[0];
      const id = randomUUID();
      const storedFile = await mediaFor(current).storeFile({ projectId: project.id, filePath: payload.filePath, id, kind: assetImage ? 'image' : payload.kind, filename });
      const row = {
        ...storedFile, id, projectId: project.id, userId: current.account.id,
        assetId: asset?.id || null, kind: assetImage ? 'asset-image' : storedFile.kind,
        episode: Number(payload.episode || 0), scene: String(payload.scene || ''), note: String(payload.note || ''),
        username: current.account.displayName || current.account.username, createdAt: time(),
      };
      media.push(row);
      if (asset) {
        (asset.images ||= []).push(row);
        adoptAssetImage(asset, row);
      }
      return row;
    });
  }
  function removeMedia(record, ids) {
    const removing = new Set(ids);
    const cloudIds = record.media.filter(row => removing.has(row.id) && row.objectKey).map(row => row.id);
    record.deletedMediaIds = [...new Set([...(record.deletedMediaIds || []), ...cloudIds])];
    record.media = record.media.filter(row => !removing.has(row.id));
  }
  function assetIn(record, id) {
    const asset = record.assets.find(row => row.id === id);
    if (!asset) throw error('资产不存在', 404);
    return asset;
  }
  async function share(payload) {
    const current = scope(), id = payload.projectId;
    return serial(current, id, async () => {
      const record = await stored(current, id);
      if (!record || record.shared) return cloud.addMember(payload);
      if (record.project.locked || record.project.deleted_at || projectBusy(id)) throw error('请先完成生成任务并确认项目可编辑', 409);
      const invitation = { username: String(payload.username || '').trim(), role: payload.role };
      if (!invitation.username || !allowedRoles.has(invitation.role)) throw error('请填写协作者账号并选择身份');
      if (record.share && (record.share.invitation.username !== invitation.username || record.share.invitation.role !== invitation.role)) throw error('请先重试上一条邀请，确认项目共享结果', 409);
      record.share ||= { requestId: randomUUID(), invitation };
      const requestId = record.share.requestId;
      await save(current, record);
      transfers.add(key(current, id));
      try {
        const prepared = await cloud.prepareLocalShare({ projectId: id, revision: record.share.revision ?? record.cloudRevision ?? null, requestId, invitation });
        assertScope(current, true);
        let completed = prepared.completed;
        if (!completed) {
          record.share.revision = prepared.revision;
          await save(current, record);
          const snapshot = view(current, record);
          const voices = adoptedVoices(current, id);
          if (Object.keys(voices).length) snapshot.project.analysis_progress = { ...snapshot.project.analysis_progress, _sharedVoiceProfiles: voices };
          const bundle = await mediaFor(current).prepareShare(snapshot);
          record.share.committing = true;
          await save(current, record);
          completed = await cloud.commitLocalShare({ projectId: id, revision: prepared.revision, requestId, invitation, ...bundle, deletedMediaIds:record.deletedMediaIds || [] });
        }
        if (!completed?.project || !completed?.member) throw error('邀请尚未取得完整回执，请重试原邀请', 502);
        record.shared = true;
        record.sharedProject = summarize({ ...completed.project, storageMode: 'cloud' });
        record.share = null;
        await save(current, record);
        return completed.member;
      } catch (cause) {
        if ([400, 401, 403, 404, 409, 410, 423].includes(cause.status)) {
          if (!record.share?.revision) record.share = null;
          else record.share.committing = false;
          await save(current, record);
        }
        throw cause;
      } finally { transfers.delete(key(current, id)); }
    });
  }

  return {
    ...cloud,
    hasLocalTransfer: () => transfers.size > 0 || imports.size > 0 || queues.size > 0,
    async isLocal(id) { try { const r = await stored(scope(), id); return Boolean(r && !r.shared); } catch { return false; } },
    async hasLocalProjects() { return (await allRecords(scope())).some(r => r && !r.shared); },
    waitForLocalPreparation(id) { return imports.get(key(scope(), id)); },
    async isProducer() {
      const { account } = scope();
      return account.isProducer === true || account.isAdmin === true;
    },
    async createProject(payload) {
      const current = scope(), id = randomUUID();
      if (!current.account.isProducer && !current.account.isAdmin) throw error('当前账号没有开启项目的权限', 403);
      const episodes = Array.isArray(payload.episodes) ? structuredClone(payload.episodes) : [];
      numberedEpisodes(episodes);
      const project = {
        id, name: String(payload.name || '未命名项目'), owner_id: current.account.id,
        owner_name: current.account.displayName || current.account.username, myRole: 'producer', storageMode: 'local',
        director_project_id: String(payload.directorProjectId || ''), style: String(payload.style || ''), genre: String(payload.genre || ''),
        script: String(payload.script || ''), episodes, analysis_output: '', analysis_progress: {},
        created_at: time(), updated_at: time(), locked: false, deleted_at: null,
      };
      await save(current, { project, assets: [], media: [], messages: [], tasks: [] });
      return project;
    },
    async listProjects({ refreshCloud = false } = {}) {
      const current = scope();
      const records = (await allRecords(current)).filter(Boolean);
      const index = path.join(current.root, 'cloud-index.json');
      let cloudRows = await readJson(index);
      if (refreshCloud || (!cloudRows && !records.length && !indexReads.has(current.root))) {
        const work = Promise.resolve().then(() => cloud.listProjects()).then(async rows => {
          assertScope(current);
          await writeJsonAtomic(index, rows);
          return rows;
        });
        indexReads.set(current.root, work);
        try { cloudRows = await work; }
        catch (cause) { if (refreshCloud || (!cloudRows && !records.length)) throw cause; }
        finally { indexReads.delete(current.root); }
      }
      assertScope(current);
      const local = records.filter(r => !r.shared).map(r => summarize(r.project));
      const localIds = new Set(local.map(r => r.id));
      const remote = new Map(records.filter(r => r.shared && r.sharedProject).map(r => [r.project.id, r.sharedProject]));
      for (const row of cloudRows || []) remote.set(row.id, row);
      return [...local, ...[...remote.values()].filter(r => !localIds.has(r.id))].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    },
    async getProject(payload) {
      const current = scope(), id = payload.projectId || payload.id;
      const record = await stored(current, id);
      assertScope(current);
      if (record && !record.shared) return view(current, record).project;
      const k = key(current, id);
      if (imports.has(k) && preparingProjects.has(k)) return { ...preparingProjects.get(k), storageMode:'cloud', localPreparing:true };
      let state;
      if (!record?.shared && UUID.test(String(id || '')) && !imports.has(k) && !importResults.get(k)?.permanent) {
        try { state = await cloud.localProjectState({ projectId: id, includeProject: true }); }
        catch (cause) {
          if (cause.code === 'LOCAL_PROJECT_SHARED' || [403, 423].includes(cause.status)) importResults.set(k, { at: Date.now(), permanent: true });
        }
      }
      assertScope(current);
      const project = state?.project || await cloud.getProject({ projectId: id });
      assertScope(current);
      if (!record?.shared) beginLocalPreparation(current, project, payload.retryLocal === true, state);
      return { ...project, storageMode: 'cloud', localPreparing: imports.has(k), localPreparationError: importResults.get(k)?.message };
    },
    async resolveLocalReferences(projectId, references) {
      const current = scope(), record = await stored(current, projectId);
      assertScope(current);
      return record && !record.shared ? mediaFor(current).resolveReferences(references, view(current, record)) : null;
    },
    patchStoryboard: p => write('patchStoryboard', p, record => {
      record.project.episodes = patchShot(record.project.episodes, p);
      return record.project;
    }),
    updateProject: p => write('updateProject', p, record => {
      const updates = p.updates || p, project = record.project;
      const fields = { 'director-sync': ['script','episodes'], storyboard: ['episodes'], 'art-image-settings': ['image_composition'], '': ['name','style','genre','script','episodes','analysis_output'] }[p.scope || ''];
      if (!fields) throw error('项目保存范围无效');
      if (p.scope === 'director-sync') {
        numberedEpisodes(updates.episodes);
        const previous = project.episodes || [];
        const incoming = filterRemovedDirectorEpisodes(previous, updates.episodes);
        project.episodes = mergeDirectorEpisodes(previous, incoming);
        numberedEpisodes(project.episodes);
        project.script = previous.some(ep => ep.episodeIdentityHistory?.length) ? composeEpisodeIdentityScript(project.episodes) : composeDirectorScript(updates.script, previous, incoming);
      } else {
        if (Object.hasOwn(updates, 'episodes')) numberedEpisodes(updates.episodes);
        if (Object.hasOwn(updates, 'image_composition')) validateImageComposition(updates.image_composition);
        for (const field of fields) if (Object.hasOwn(updates, field)) project[field] = updates[field];
      }
      return project;
    }),
    linkDirector: p => write('linkDirector', p, record => { record.project.director_project_id = String(p.directorProjectId || ''); return { ok: true }; }),
    appendEpisode: p => write('appendEpisode', p, record => { record.project = appendArtEpisodeSnapshot(record.project, p); return record.project; }),
    resolveEpisodeIdentity: p => write('resolveEpisodeIdentity', p, record => {
      const result = applyEpisodeIdentityChange(record.project.episodes, p);
      record.project.episodes = result.episodes || result;
      record.project.script = composeEpisodeIdentityScript(record.project.episodes);
      return record.project;
    }),
    setProjectLocked: p => write('setProjectLocked', p, record => { record.project.locked = p.locked !== false; return { ok: true }; }, { allowLocked: true }),
    deleteProject: p => write('deleteProject', p, record => { record.project.deleted_at = time(); return { ok: true }; }),
    restoreProject: p => write('restoreProject', p, record => { record.project.deleted_at = null; return { ok: true }; }, { allowDeleted: true }),
    listAssets: p => read('listAssets', p, record => record.assets),
    createAsset: p => write('createAsset', p, record => {
      const next = localAsset(record.project.id, p);
      if (record.assets.some(row => row.name === next.name)) throw error('已有同名资产', 409);
      record.assets.push(next);
      return next;
    }),
    replaceAssets: p => write('replaceAssets', p, record => {
      for (const row of p.assets || p.list || []) {
        const existing = record.assets.find(asset => asset.name === row.name);
        if (!existing) record.assets.push(localAsset(record.project.id, row));
      }
      return record.assets;
    }),
    updateAsset: p => write('updateAsset', p, record => {
      const asset = assetIn(record, p.assetId), changes = p.updates || p;
      if (Object.hasOwn(changes, 'adoptedImageId')) {
        const image = asset.images?.find(row => row.id === changes.adoptedImageId);
        if (!image) throw error('请选择本资产的图片', 404);
        adoptAssetImage(asset, image);
      } else for (const field of ['name','description']) if (typeof changes[field] === 'string') asset[field] = changes[field];
      return asset;
    }),
    resolveAssetImage: p => read('resolveAssetImage', p, record => {
      const asset = assetIn(record, p.assetId);
      const id = p.imageId && p.imageId !== 'legacy' ? p.imageId : asset.adoptedImageId;
      const image = asset.images?.find(row => row.id === id);
      if (!image?.filePath) throw error('图片尚未保存到本机，请重新选择素材', 404);
      return image;
    }),
    attachAssetImage: p => addFile('attachAssetImage', p, true),
    attachGeneratedAssetImage: p => addFile('attachGeneratedAssetImage', p, true),
    deleteAssetImage: p => write('deleteAssetImage', p, record => {
      const asset = assetIn(record, p.assetId);
      asset.images = (asset.images || []).filter(image => image.id !== p.imageId);
      removeMedia(record,record.media.filter(image=>image.id===p.imageId&&image.assetId===asset.id).map(image=>image.id));
      if (asset.adoptedImageId === p.imageId) adoptAssetImage(asset, asset.images.at(-1));
      return { ok: true };
    }),
    clearAssetImages: p => write('clearAssetImages', p, record => {
      const asset = assetIn(record, p.assetId);
      asset.images = [];
      removeMedia(record,record.media.filter(image=>image.assetId===asset.id).map(image=>image.id));
      adoptAssetImage(asset, null);
      return { ok: true };
    }),
    listMedia: p => read('listMedia', p, record => record.media),
    uploadMedia: p => addFile('uploadMedia', p),
    recordGeneratedMedia: p => addFile('recordGeneratedMedia', p),
    deleteMedia: p => write('deleteMedia', p, (record, current) => {
      const row = record.media.find(item => item.id === p.mediaId);
      if (!row) throw error('素材不存在', 404);
      if (p.purpose === 'reference-upload') {
        const owned = row.userId === current.account.id && !row.assetId && /^参考素材\s/.test(row.note || '');
        const protectedUse = publishedReferenceUses(record.project, { ...row, object_path: row.objectKey || row.filePath });
        if (!owned || protectedUse) throw error('只能删除自己上传且未采用的参考素材', 403);
      }
      removeMedia(record,[p.mediaId]);
      return { ok: true };
    }),
    listMembers: p => read('listMembers', p, (record, { account }) => [{ id: account.id, user_id: account.id, username: account.username, display_name: record.project.owner_name, role: 'producer', created_at: record.project.created_at }]),
    addMember: share,
    async removeMember(p) {
      const current = scope();
      if (await this.isLocal(p.projectId)) throw error('本机项目只有负责人');
      const result = await cloud.removeMember(p);
      await serial(current, p.projectId, async () => {
        const record = await stored(current, p.projectId);
        if (record?.shared) {
          const project = await cloud.getProject(p);
          importResults.delete(key(current, p.projectId));
          beginLocalPreparation(current, project, true);
        }
      }).catch(() => {});
      return result;
    },
    updateMemberRole: p => write('updateMemberRole', p, () => { throw error('本机项目只有负责人'); }),
    listTasks: p => read('listTasks', p, record => record.tasks || []),
    assignTask: p => write('assignTask', p, () => { throw error('邀请协作者后可分配任务'); }),
    updateTask: p => write('updateTask', p, () => { throw error('邀请协作者后可分配任务'); }),
    deleteTask: p => write('deleteTask', p, record => { record.tasks = (record.tasks || []).filter(row => row.id !== p.taskId); return { ok: true }; }),
    listMessages: p => read('listMessages', p, record => record.messages || []),
    sendMessage: p => write('sendMessage', p, () => { throw error('邀请协作者后可使用项目群'); }),
    getStats: p => read('getStats', p, record => ({ members: [], activity: [], media: record.media })),
    ...Object.fromEntries(['publishAnalysis','saveArtReview','publishArtReview'].map(method => [method, p => write(method, p, (record, current) => require('./local-project-art.cjs').applyLocalArt(record, method, p, current.account.id))])),
  };
}

module.exports = { createLocalCollabService, accountFolder };
