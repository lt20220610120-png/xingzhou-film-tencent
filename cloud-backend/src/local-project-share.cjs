const { createHash } = require('node:crypto');
const { collabGenre, editableCollab } = require('./collab-episodes.cjs');
const { resolveCreationSource } = require('./director-source.cjs');
const { validateImageComposition } = require('./image-composition.cjs');
const { sourceProtection } = require('./cloud-recycle.cjs');

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const ROLES = new Set(['producer', 'artist', 'collaborator', 'artist_collaborator']);
const CATEGORIES = new Set(['character', 'scene', 'prop']);
const MEDIA_KINDS = new Set(['image', 'asset-image', 'video', 'audio', 'file', 'doc']);
const PENDING = /\[LOCAL_SHARE_PENDING:([a-f0-9-]+):([a-f0-9-]+):([a-z_]+)\]/;
const RECEIPT = /\[LOCAL_SHARE_RECEIPT:([a-f0-9-]+):([a-f0-9-]+):([a-z_]+)\]/;

function fail(status, message, code) {
  throw Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function id(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(400, label + '编号无效');
  return value.toLowerCase();
}

function text(value, max, label, fallback = '') {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) fail(400, label + '格式无效');
  return value;
}

function episodeNumber(value, min = 0) {
  if (value === undefined) return min;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > 10000) fail(400, '分集编号无效');
  return number;
}

function mediaKey(value, projectId) {
  const prefix = 'projects/' + projectId + '/';
  if (typeof value !== 'string' || !value.startsWith(prefix)
    || !/^(?:image|audio|video|doc|file)\/[a-z0-9_-]+\.[a-z0-9]+$/i.test(value.slice(prefix.length))) {
    fail(400, '素材存储路径不属于当前项目');
  }
  return value;
}

const privateFields = /^(?:__proto__|constructor|prototype|api[_-]?key|access[_-]?key|secret(?:id|key)?|(?:access|refresh)?token|authorization|credentials?|password|endpoint|headers|cookie|filePath|localPath|directory|privateKey|_license.*)$/i;

function portable(value, projectId, depth = 0) {
  if (depth > 64) fail(400, '项目数据层级过深');
  if (Array.isArray(value)) return value.map(item => portable(item, projectId, depth + 1));
  if (!object(value)) return value;

  const result = {};
  const objectKey = value.objectKey || value.objectPath || value.object_path;
  if (objectKey) result.objectKey = mediaKey(objectKey, projectId);
  for (const [key, child] of Object.entries(value)) {
    if (privateFields.test(key) || ['objectKey', 'objectPath', 'object_path'].includes(key)) continue;
    if (typeof child === 'string' && /url$/i.test(key)) {
      if (result.objectKey) continue;
      try {
        const url = new URL(child);
        if (url.protocol === 'https:' && !url.username && !url.password) {
          url.search = '';
          url.hash = '';
          result[key] = url.href;
        }
      } catch { /* A local URL is represented by its uploaded object key. */ }
      continue;
    }
    result[key] = portable(child, projectId, depth + 1);
  }
  return result;
}

function unique(list, key) {
  if (new Set(list.map(item => item[key])).size !== list.length) fail(400, '素材或资产编号重复');
}

function validateSnapshot(payload, projectId) {
  const source = payload.project;
  if (!object(source) || !Array.isArray(source.episodes) || source.episodes.length > 10000
    || source.episodes.some(episode => !object(episode))) fail(400, '项目分集格式无效');
  if (!Array.isArray(payload.assets) || payload.assets.length > 20000
    || !Array.isArray(payload.media) || payload.media.length > 50000) fail(400, '项目素材清单无效');

  const imageComposition = source.image_composition || 'portrait-four';
  validateImageComposition(imageComposition);
  const name = text(source.name, 300, '项目名称').trim();
  if (!name) fail(400, '请输入项目名称');
  const project = {
    name,
    style: text(source.style, 300, '项目风格'),
    genre: text(source.genre, 2000, '项目类型'),
    script: text(source.script, 8000000, '项目剧本'),
    analysis_output: text(source.analysis_output, 8000000, '项目分析'),
    episodes: portable(source.episodes, projectId),
    image_composition: imageComposition,
    director_project_id: text(source.director_project_id, 500, '导演项目'),
  };
  if (source.analysis_progress !== undefined) {
    if (!object(source.analysis_progress)) fail(400, '项目分析进度格式无效');
    project.analysis_progress = portable(source.analysis_progress, projectId);
  }
  if (source.id !== undefined && id(source.id, '项目') !== projectId) fail(400, '项目编号不一致');

  const assets = payload.assets.map(asset => {
    if (!object(asset) || !CATEGORIES.has(asset.category)) fail(400, '资产类别无效');
    if (asset.project_id !== undefined && asset.project_id !== projectId) fail(400, '资产不属于当前项目');
    const name = text(asset.name, 300, '资产名称').trim();
    if (!name) fail(400, '资产名称不能为空');
    const episodes = asset.episodes ?? [];
    if (!Array.isArray(episodes) || episodes.length > 10000) fail(400, '资产分集无效');
    return {
      id: id(asset.id, '资产'),
      category: asset.category,
      name,
      description: text(asset.description, 200000, '资产说明'),
      firstEpisode: episodeNumber(asset.first_episode ?? asset.firstEpisode, 1),
      episodes: [...new Set(episodes.map(number => episodeNumber(number, 1)))],
      adoptedImageId: asset.adoptedImageId ? id(asset.adoptedImageId, '采用图片') : null,
      imageKey: asset.image_url ? mediaKey(asset.image_url, projectId) : '',
    };
  });
  unique(assets, 'id');
  unique(assets, 'name');

  const media = payload.media.map(row => {
    if (!object(row) || !MEDIA_KINDS.has(row.kind)) fail(400, '素材类型无效');
    if ((row.projectId ?? row.project_id ?? projectId) !== projectId) fail(400, '素材不属于当前项目');
    const assetId = (row.assetId ?? row.asset_id) || null;
    if (row.kind === 'asset-image' && !assetId) fail(400, '资产图片缺少对应资产');
    return {
      id: id(row.id, '素材'),
      assetId: assetId ? id(assetId, '资产') : null,
      episode: episodeNumber(row.episode),
      scene: text(row.scene, 80, '场次'),
      kind: row.kind,
      filename: text(row.filename, 260, '素材文件名').split(/[\\/]/).at(-1),
      mime: text(row.mime, 150, '素材格式'),
      note: text(row.note, 4000, '素材备注'),
      objectKey: mediaKey(row.objectKey ?? row.object_path, projectId),
    };
  });
  unique(media, 'id');
  const deletedMediaIds=payload.deletedMediaIds || [];
  if(!Array.isArray(deletedMediaIds)||deletedMediaIds.length>50000)fail(400,'删除素材清单无效');
  const deleted=[...new Set(deletedMediaIds.map(value=>id(value,'素材')))];
  if(media.some(row=>deleted.includes(row.id)))fail(400,'素材不能同时保存和删除');
  return { project, assets, media, deletedMediaIds:deleted };
}

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function snapshotRevision(project, assets, media, members) {
  const order = list => [...list].sort((a, b) => String(a.id || a.user_id).localeCompare(String(b.id || b.user_id)));
  return createHash('sha256').update(JSON.stringify(stable([project, order(assets), order(media), order(members)]))).digest('hex');
}

function invitation(value) {
  const username = text(value?.username, 32, '协作者账号').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(username) || !ROLES.has(value?.role)) fail(400, '请选择协作者及其项目权限');
  return { username, role: value.role };
}

function readRevision(value, optional = false) {
  if (optional && (value === undefined || value === null)) return null;
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(400, '缺少有效的云端项目版本');
  return value;
}

function checkOwner(project, user) {
  if (!project || project.owner_id !== user.id || !editableCollab(project)) fail(404, '项目不存在或无权访问');
  if (sourceProtection(project) !== 'active') fail(410, '项目已删除，请先恢复');
}

function checkSoleOwner(members, user) {
  if (members.some(member => member.user_id !== user.id)) fail(409, '项目已有协作者，请使用云端项目', 'LOCAL_PROJECT_SHARED');
}

function checkRevision(current, expected) {
  if (current !== expected) fail(409, '云端项目已发生变更，请核对后再邀请协作者');
}

async function snapshot(client, project, lock) {
  const rows = async table => (await client.query(
    'select * from ' + table + ' where project_id=$1 order by id' + (lock ? ' for update' : ''), [project.id],
  )).rows;
  const assets = await rows('collab_assets');
  const media = await rows('collab_media');
  const members = await rows('collab_members');
  return { assets, media, members, revision: snapshotRevision(project, assets, media, members) };
}

async function findInvitee(client, invited, user) {
  const { rows } = await client.query(
    'select id,username,display_name,roles,is_admin,is_producer,banned from app_users where username=$1 for share', [invited.username],
  );
  const target = rows[0];
  if (!target || target.banned || (Array.isArray(target.roles) && !target.roles.length && !target.is_admin && !target.is_producer)) {
    fail(404, '协作者账号不存在或没有影视项目权限');
  }
  if (target.id === user.id) fail(400, '请选择其他账号作为协作者');
  return target;
}

function sameRequest(match, requestId, target, invited) {
  return match && match[1] === requestId && match[2] === target.id && match[3] === invited.role;
}

function completedShare(project, current, requestId, target, invited) {
  const marker = String(project.genre || '').match(RECEIPT);
  if (marker?.[1] !== requestId) return null;
  if (!sameRequest(marker, requestId, target, invited)) fail(409, '邀请请求与已完成的记录不一致');
  const member = current.members.find(row => row.user_id === target.id && row.role === invited.role);
  if (!member) fail(409, '邀请已经处理，成员权限已变化，请打开云端项目查看');
  return { project, member };
}

function insertMember(client, projectId, target, role) {
  return client.query(
    'insert into collab_members(project_id,user_id,username,display_name,role) values($1,$2,$3,$4,$5) on conflict(project_id,user_id) do nothing returning *',
    [projectId, target.id, target.username, target.display_name || target.username, role],
  );
}

async function saveSnapshot(client, projectId, current, next, user) {
  const removed=current.media.filter(row=>next.deletedMediaIds.includes(row.id));
  if(removed.length!==next.deletedMediaIds.length)fail(409,'待删除的素材记录已变化');
  const removedKeys=new Set(removed.map(row=>row.object_path));
  const finalAssets=new Map([...current.assets,...next.assets].map(row=>[row.id,row]));
  for(const asset of finalAssets.values())if(next.deletedMediaIds.includes(asset.adoptedImageId))fail(400,'待删除素材仍被资产采用');
  for(const asset of finalAssets.values())if(removedKeys.has(asset.imageKey||asset.image_url)&&!asset.adoptedImageId)fail(400,'待删除素材仍被资产采用');
  const assets = new Map([...current.assets, ...next.assets].map(row => [row.id, row]));
  const media = new Map(current.media.map(row => [row.id, { assetId: row.asset_id, kind: row.kind, objectKey: row.object_path }]));
  for (const item of next.media) {
    if (item.assetId && !assets.has(item.assetId)) fail(400, '素材对应的资产不属于当前项目');
    media.set(item.id, item);
  }
  for (const asset of next.assets) {
    const adopted = asset.adoptedImageId ? media.get(asset.adoptedImageId) : null;
    if (asset.adoptedImageId && (!adopted || adopted.assetId !== asset.id || adopted.kind !== 'asset-image')) {
      fail(400, '采用图片与资产不匹配');
    }
    const { rows } = await client.query(`insert into collab_assets(id,project_id,category,name,description,first_episode,episodes,image_url)
      values($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict(id) do update set category=excluded.category,name=excluded.name,description=excluded.description,
        first_episode=excluded.first_episode,episodes=excluded.episodes,image_url=excluded.image_url,updated_at=now()
      where collab_assets.project_id=excluded.project_id returning id`,
    [asset.id, projectId, asset.category, asset.name, asset.description, asset.firstEpisode, asset.episodes, adopted?.objectKey || asset.imageKey]);
    if (!rows.length) fail(409, '资产编号与现有项目冲突');
  }
  for (const item of next.media) {
    const { rows } = await client.query(`insert into collab_media(id,project_id,asset_id,episode,scene,kind,object_path,filename,mime,note,user_id,username)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      on conflict(id) do update set asset_id=excluded.asset_id,episode=excluded.episode,scene=excluded.scene,
        kind=excluded.kind,object_path=excluded.object_path,filename=excluded.filename,mime=excluded.mime,note=excluded.note,url=''
      where collab_media.project_id=excluded.project_id returning id`,
    [item.id, projectId, item.assetId, item.episode, item.scene, item.kind, item.objectKey, item.filename, item.mime, item.note, user.id, user.display_name || user.username]);
    if (!rows.length) fail(409, '素材编号与现有项目冲突');
  }
  if(next.deletedMediaIds.length)await client.query('delete from collab_media where project_id=$1 and id=any($2::uuid[])',[projectId,next.deletedMediaIds]);
}

function createLocalShareRepository(pool) {
  async function transaction(readOnly, work) {
    const client = await pool.connect();
    try {
      await client.query(readOnly ? 'begin isolation level repeatable read read only' : 'begin');
      await client.query("set local lock_timeout='3s'");
      await client.query("set local statement_timeout='10s'");
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      if (error.code === '23505') fail(409, '资产名称或编号与云端项目冲突');
      if (['40001', '40P01', '55P03'].includes(error.code)) fail(409, '云端项目正在保存，请稍后重试邀请');
      throw error;
    } finally {
      client.release();
    }
  }

  const projectRow = async (client, projectId, lock) => (await client.query(
    'select * from collab_projects where id=$1' + (lock ? ' for update' : ''), [projectId],
  )).rows[0];

  return {
    async localProjectState(payload, user) {
      const projectId = id(payload.projectId, '项目');
      return transaction(true, async client => {
        const project = await projectRow(client, projectId, false);
        checkOwner(project, user);
        if (PENDING.test(String(project.genre || ''))) fail(404, '项目仍在等待首次同步');
        const current = await snapshot(client, project, false);
        checkSoleOwner(current.members, user);
        return { revision: current.revision, updatedAt: project.updated_at, ...(payload.includeProject === true ? { project } : {}) };
      });
    },

    async prepareLocalProjectShare(payload, user) {
      const projectId = id(payload.projectId, '项目');
      const requestId = id(payload.requestId, '邀请请求');
      const expected = readRevision(payload.revision, true);
      const invited = invitation(payload.invitation);
      return transaction(false, async client => {
        const target = await findInvitee(client, invited, user);
        let project = await projectRow(client, projectId, true);
        if (!project && expected !== null) fail(404, '原云端项目不存在，请核对后再邀请');
        if (!project) {
          const genre = '[COLLAB_PROJECT]\n[LOCAL_SHARE_PENDING:' + requestId + ':' + target.id + ':' + invited.role + ']';
          const created = await client.query(
            'insert into collab_projects(id,name,owner_id,owner_name,genre) values($1,$2,$3,$4,$5) on conflict(id) do nothing returning *',
            [projectId, '等待同步的本地项目', user.id, user.display_name || user.username, genre],
          );
          project = created.rows[0] || await projectRow(client, projectId, true);
          if (created.rows.length) await insertMember(client, projectId, user, 'producer');
        }
        checkOwner(project, user);
        let current = await snapshot(client, project, true);
        const completed = completedShare(project, current, requestId, target, invited);
        if (completed) return { revision: current.revision, completed };
        checkSoleOwner(current.members, user);
        const pending = String(project.genre || '').match(PENDING);
        if (pending && expected === null && !sameRequest(pending, requestId, target, invited)) {
          const marker = '[LOCAL_SHARE_PENDING:' + requestId + ':' + target.id + ':' + invited.role + ']';
          project = (await client.query('update collab_projects set genre=$2,updated_at=now() where id=$1 returning *',
            [projectId, String(project.genre).replace(PENDING, marker)])).rows[0];
          current = await snapshot(client, project, true);
        } else if (!pending || expected !== null) {
          checkRevision(current.revision, expected);
        }
        return { revision: current.revision };
      });
    },

    async shareLocalProject(payload, user) {
      const projectId = id(payload.projectId, '项目');
      const requestId = id(payload.requestId, '邀请请求');
      const expected = readRevision(payload.revision);
      const invited = invitation(payload.invitation);
      return transaction(false, async client => {
        const project = await projectRow(client, projectId, true);
        checkOwner(project, user);
        const target = await findInvitee(client, invited, user);
        const current = await snapshot(client, project, true);
        const completed = completedShare(project, current, requestId, target, invited);
        if (completed) return completed;
        checkSoleOwner(current.members, user);
        checkRevision(current.revision, expected);
        const pending = String(project.genre || '').match(PENDING);
        if (pending && !sameRequest(pending, requestId, target, invited)) fail(409, '已有其他邀请准备，请重新核对协作者');

        const next = validateSnapshot(payload, projectId);
        let directorId = project.director_project_id || '';
        let markers = String(project.genre || '').replace(PENDING, '').replace(RECEIPT, '');
        if (pending) {
          const source = await resolveCreationSource(client, next.project.director_project_id, user.id,{allowLocalUuid:true});
          directorId = source.id;
          if (source.local) markers += '\n[COLLAB_LOCAL_SOURCE]';
          else if (directorId) markers += '\n[COLLAB_SOURCE:' + directorId + ']';
        }
        const genre = collabGenre(next.project.genre, markers)
          + '\n[LOCAL_SHARE_RECEIPT:' + requestId + ':' + target.id + ':' + invited.role + ']';

        await saveSnapshot(client, projectId, current, next, user);
        const { rows } = await client.query(
          `update collab_projects set name=$2,style=$3,genre=$4,script=$5,episodes=$6,analysis_output=$7,
            analysis_progress=$8,image_composition=$9,director_project_id=$10,updated_at=now() where id=$1 returning *`,
          [projectId, next.project.name, next.project.style, genre, next.project.script, JSON.stringify(next.project.episodes),
            next.project.analysis_output, JSON.stringify(next.project.analysis_progress ?? project.analysis_progress ?? {}),
            next.project.image_composition, directorId],
        );
        const member = (await insertMember(client, projectId, target, invited.role)).rows[0];
        if (!member) fail(409, '成员列表已变化，请刷新后重新邀请');
        return { project: rows[0], member };
      });
    },
  };
}

module.exports = { createLocalShareRepository, validateSnapshot, snapshotRevision, PENDING };
