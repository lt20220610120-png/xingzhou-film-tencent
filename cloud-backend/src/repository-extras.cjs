// 导演协作 / 统计 / 资产图片 的仓储扩展。
// 说明：导演项目与协作项目共用 collab_projects 表，用 genre 中的哨兵标记区分。
const DIRECTOR_SENTINEL = '[DIRECTOR_PROJECT]';
const LOCK_SENTINEL = '[PROJECT_LOCKED]';

const READ_SCOPE = 'left join collab_members m on m.project_id=p.id where p.id=$1 and (p.owner_id=$2 or m.user_id=$2)';

function extendRepository(pool) {
  const one = async (s, p) => (await pool.query(s, p)).rows[0] || null;
  const many = async (s, p) => (await pool.query(s, p)).rows;
  const count = async (s, p) => (await pool.query(s, p)).rows[0].c;

  const canRead = async (pid, uid) => Boolean(await one('select 1 as ok from collab_projects p ' + READ_SCOPE + ' limit 1', [pid, uid]));
  const isOwner = async (pid, uid) => Boolean(await one('select 1 as ok from collab_projects where id=$1 and owner_id=$2 limit 1', [pid, uid]));

  return {
    async createDirectorProject(p, uid, ownerName) {
      const genre = String(p.genre || '') + '\n' + DIRECTOR_SENTINEL;
      const sql = 'insert into collab_projects(name,owner_id,owner_name,style,genre,script,episodes,analysis_output) values($1,$2,$3,$4,$5,$6,$7,$8) returning *';
      return one(sql, [p.name || '未命名导演项目', uid, ownerName || '', p.style || '', genre.trim(), p.script || '', JSON.stringify(p.episodes || []), p.analysisOutput || ' ']);
    },
    async listDirectorProjects(uid) {
      const sql = 'select distinct p.* from collab_projects p left join collab_members m on m.project_id=p.id where p.deleted_at is null and p.genre like $2 and (p.owner_id=$1 or m.user_id=$1) order by p.updated_at desc';
      return many(sql, [uid, '%' + DIRECTOR_SENTINEL + '%']);
    },
    async getDirectorProject(pid, uid) {
      return one('select p.* from collab_projects p ' + READ_SCOPE + ' limit 1', [pid, uid]);
    },
    async updateDirectorProject(pid, p, uid) {
      if (!await canRead(pid, uid)) return null;
      const sql = 'update collab_projects set name=coalesce($1,name), style=coalesce($2,style), script=coalesce($3,script), episodes=coalesce($4,episodes), analysis_output=coalesce($5,analysis_output), updated_at=now() where id=$6 returning *';
      const eps = p.episodes === undefined ? null : JSON.stringify(p.episodes);
      return one(sql, [p.name ?? null, p.style ?? null, p.script ?? null, eps, p.analysisOutput ?? null, pid]);
    },
    async deleteDirectorProject(pid, uid) {
      return one('delete from collab_projects where id=$1 and owner_id=$2 returning id', [pid, uid]);
    },
    async setProjectLocked(pid, locked, uid) {
      if (!await isOwner(pid, uid)) return null;
      const row = await one('select genre from collab_projects where id=$1', [pid]);
      if (!row) return null;
      const stripped = String(row.genre || '').split(LOCK_SENTINEL).join('').trim();
      const next = locked ? (stripped + '\n' + LOCK_SENTINEL).trim() : stripped;
      return one('update collab_projects set genre=$1, updated_at=now() where id=$2 returning id, genre', [next, pid]);
    },
    async listDirectorMembers(pid, uid) {
      if (!await canRead(pid, uid)) return null;
      return many('select * from collab_members where project_id=$1 order by created_at', [pid]);
    },
    async addDirectorMember(pid, p, uid) {
      if (!await isOwner(pid, uid)) return null;
      const target = await one('select id, username, display_name from app_users where username=$1 limit 1', [String(p.username || '').trim().toLowerCase()]);
      if (!target) return { error: 'user_not_found' };
      const role = ['producer','artist','collaborator','artist_collaborator'].includes(p.role) ? p.role : 'collaborator';
      const sql = 'insert into collab_members(project_id,user_id,username,display_name,role) values($1,$2,$3,$4,$5) on conflict(project_id,user_id) do update set role=excluded.role returning *';
      return one(sql, [pid, target.id, target.username, target.display_name || target.username, role]);
    },
    async removeDirectorMember(pid, userId, uid) {
      if (!await isOwner(pid, uid)) return null;
      return one('delete from collab_members where project_id=$1 and user_id=$2 returning *', [pid, userId]);
    },
    async updateMemberRole(pid, p, uid) {
      if (!await isOwner(pid, uid)) return null;
      const role = ['producer','artist','collaborator','artist_collaborator'].includes(p.role) ? p.role : 'collaborator';
      return one('update collab_members set role=$1 where project_id=$2 and user_id=$3 returning *', [role, pid, p.userId]);
    },
    async getStats(pid, uid) {
      if (!await canRead(pid, uid)) return null;
      const assets = await count('select count(*)::int as c from collab_assets where project_id=$1', [pid]);
      const members = await count('select count(*)::int as c from collab_members where project_id=$1', [pid]);
      const tasks = await count('select count(*)::int as c from collab_tasks where project_id=$1', [pid]);
      const doneTasks = await count("select count(*)::int as c from collab_tasks where project_id=$1 and status='已完成'", [pid]);
      const media = await count('select count(*)::int as c from collab_media where project_id=$1', [pid]);
      const messages = await count('select count(*)::int as c from collab_messages where project_id=$1', [pid]);
      return { assets, members, tasks, doneTasks, media, messages };
    },
    async replaceAssets(pid, list, uid) {
      if (!await isOwner(pid, uid)) return null;
      const rows = Array.isArray(list) ? list : [];
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('delete from collab_assets where project_id=$1', [pid]);
        for (const item of rows) {
          const sql = 'insert into collab_assets(project_id,category,name,description,first_episode,episodes,image_url) values($1,$2,$3,$4,$5,$6,$7) on conflict(project_id,name) do nothing';
          const cat = ['character','scene','prop'].includes(item.category) ? item.category : 'character';
          await client.query(sql, [pid, cat, item.name || '未命名资产', item.description || '', item.firstEpisode || 1, item.episodes || [], item.imageUrl || '']);
        }
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
      return many('select * from collab_assets where project_id=$1 order by created_at', [pid]);
    },
    async recordAssetImage(pid, p, uid) {
      if (!await canRead(pid, uid)) return null;
      const sql = 'insert into collab_media(project_id,asset_id,episode,kind,url,object_path,filename,mime,user_id,username) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *';
      const saved = await one(sql, [pid, p.assetId || null, p.episode || 0, 'asset', '', p.objectPath || p.objectKey || '', p.filename || '', p.mime || '', uid, p.username || '']);
      if (p.assetId) {
        await pool.query('update collab_assets set image_url=$1, updated_at=now() where id=$2 and project_id=$3', [p.objectPath || p.objectKey || '', p.assetId, pid]);
      }
      return saved;
    },
    async deleteAssetImage(pid, p, uid) {
      if (!await canRead(pid, uid)) return null;
      const removed = await one('delete from collab_media where project_id=$1 and id=$2 returning *', [pid, p.mediaId || p.imageId]);
      if (p.assetId) {
        await pool.query("update collab_assets set image_url='', updated_at=now() where id=$1 and project_id=$2", [p.assetId, pid]);
      }
      return removed || { ok: true };
    },
    async clearAssetImages(pid, p, uid) {
      if (!await isOwner(pid, uid)) return null;
      if (p && p.assetId) {
        await pool.query('delete from collab_media where project_id=$1 and asset_id=$2', [pid, p.assetId]);
        await pool.query("update collab_assets set image_url='' where id=$1 and project_id=$2", [p.assetId, pid]);
      } else {
        await pool.query("delete from collab_media where project_id=$1 and kind='asset'", [pid]);
        await pool.query("update collab_assets set image_url='' where project_id=$1", [pid]);
      }
      return { ok: true };
    },
    async softDeleteProject(pid, uid) {
      if (!await isOwner(pid, uid)) return null;
      const sql = "update collab_projects set deleted_at=now(), purge_after=now()+interval '3 days' where id=$1 returning id, purge_after";
      return one(sql, [pid]);
    },
    async restoreProject(pid, uid) {
      if (!await isOwner(pid, uid)) return null;
      return one('update collab_projects set deleted_at=null, purge_after=null where id=$1 and purge_after > now() returning id', [pid]);
    },
    async deleteTask(pid, taskId, uid) {
      if (!await isOwner(pid, uid)) return null;
      return one('delete from collab_tasks where project_id=$1 and id=$2 returning *', [pid, taskId]);
    },
    async linkDirectorProject(pid, directorProjectId, uid) {
      if (!await isOwner(pid, uid)) return null;
      const tag = '[COLLAB_SOURCE:' + String(directorProjectId) + ']';
      const row = await one('select genre from collab_projects where id=$1', [pid]);
      const cleaned = String(row ? row.genre : '').replace(/\[COLLAB_SOURCE:[^\]]+\]/g, '').trim();
      return one('update collab_projects set genre=$1, updated_at=now() where id=$2 returning id, genre', [(cleaned + '\n' + tag).trim(), pid]);
    },
    async listAssetImages(pid, uid) {
      const sql = 'select media.id, media.asset_id, media.object_path, media.filename, media.mime from collab_media media join collab_projects p on p.id=media.project_id left join collab_members m on m.project_id=p.id where media.project_id=$1 and media.kind=$2 and (p.owner_id=$3 or m.user_id=$3) order by media.created_at';
      return many(sql, [pid, 'asset', uid]);
    },
    async setProducer(userId, isProducer) {
      const sql = 'update app_users set is_producer=$1, updated_at=now() where id=$2 returning id, is_producer';
      return one(sql, [Boolean(isProducer), userId]);
    },
    async purgeExpiredProjects() {
      await pool.query('delete from collab_projects where purge_after is not null and purge_after <= now()');
      return true;
    },
  };
}

module.exports = { extendRepository, DIRECTOR_SENTINEL, LOCK_SENTINEL };
