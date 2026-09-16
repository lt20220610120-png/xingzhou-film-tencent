const {threeWayMerge}=require('./three-way-merge.cjs');
const {mergeDirectorEpisodes,patchShot}=require('./storyboard-merge.cjs');
const {composeDirectorScript, publicGenre, collabGenre, editableCollab, ensureCollabDomain}=require('./collab-episodes.cjs');
const {directorRow, readableDirector, lockReadableDirector, lockDirectorReferences}=require('./director-source.cjs');
// 导演协作 / 统计 / 资产图片 的仓储扩展。
// 说明：导演项目与协作项目共用 collab_projects 表，用 genre 中的哨兵标记区分。
const DIRECTOR_SENTINEL = '[DIRECTOR_PROJECT]';
const LOCK_SENTINEL = '[PROJECT_LOCKED]';

const statusError = (status,message) => Object.assign(new Error(message),{status});

const READ_SCOPE = 'left join collab_members m on m.project_id=p.id where p.id=$1 and (p.owner_id=$2 or m.user_id=$2)';

function extendRepository(pool) {
  const one = async (s, p) => (await pool.query(s, p)).rows[0] || null;
  const many = async (s, p) => (await pool.query(s, p)).rows;
  const count = async (s, p) => (await pool.query(s, p)).rows[0].c;

  const canRead = async (pid, uid) => Boolean(await one('select 1 as ok from collab_projects p ' + READ_SCOPE + ' limit 1', [pid, uid]));
  const isOwner = async (pid, uid) => Boolean(await one('select 1 as ok from collab_projects where id=$1 and owner_id=$2 limit 1', [pid, uid]));
  const readableDomain = async (pid,uid,domain) => {
    if(!uid)return false;
    const row=await one('select p.* from collab_projects p '+READ_SCOPE+' limit 1',[pid,uid]);
    return domain==='director'?directorRow(row):Boolean(row&&!String(row.genre||'').includes(DIRECTOR_SENTINEL));
  };

  const lockAuthorizedProject = async (client,pid,uid,roles=null) => {
    if(!uid)return null;
    const row=(await client.query('select p.* from collab_projects p where p.id=$1 for update',[pid])).rows[0];
    if(!row||row.owner_id===uid)return row||null;
    const roleSql=Array.isArray(roles)&&roles.length
      ? ` and role in (${roles.map((_,index)=>'$'+(index+3)).join(',')})`
      : '';
    const auth=(await client.query(`select 1 as ok from collab_members where project_id=$1 and user_id=$2${roleSql} limit 1`,[pid,uid,...(roles||[])])).rows[0];
    return auth?row:null;
  };

  return {
    ...require('./analysis-repository.cjs').analysisRepository(pool),
    findReadableDirectorSource: (source, uid) => readableDirector(pool.query.bind(pool), source, uid),
    async createDirectorProject(p, uid, ownerName) {
      const genre = publicGenre(p.genre) + '\n' + DIRECTOR_SENTINEL;
      const sql = 'insert into collab_projects(name,owner_id,owner_name,style,genre,script,episodes,analysis_output) values($1,$2,$3,$4,$5,$6,$7,$8) returning *';
      const row = await one(sql, [p.name || '未命名导演项目', uid, ownerName || '', p.style || '', genre.trim(), p.script || '', JSON.stringify(p.episodes || []), p.directorProjectId || p.analysisOutput || ' ']);
      // 所有者必须进成员表：否则 myRole 为空，管理协作按钮与成员列表都失效。
      if (row) {
        const ins = "insert into collab_members(project_id,user_id,username,display_name,role) values($1,$2,$3,$4,'producer') on conflict(project_id,user_id) do nothing";
        await pool.query(ins, [row.id, uid, p.ownerUsername || '', ownerName || '']);
      }
      return row;
    },
    async listDirectorProjects(uid) {
      const sql = 'select distinct p.* from collab_projects p left join collab_members m on m.project_id=p.id where p.deleted_at is null and p.genre like $2 and (p.owner_id=$1 or m.user_id=$1) order by p.updated_at desc';
      return (await many(sql, [uid, '%' + DIRECTOR_SENTINEL + '%'])).filter(directorRow);
    },
    async getDirectorProject(pid, uid) {
      const row=uid&&await one('select p.* from collab_projects p ' + READ_SCOPE + ' limit 1', [pid, uid]);
      return directorRow(row)?row:null;
    },
    async updateDirectorProject(pid,p,uid) {
      const client=await pool.connect();
      try{await client.query('BEGIN');
        const row=await lockAuthorizedProject(client,pid,uid);
        if(!uid||!directorRow(row)){await client.query('ROLLBACK');return null;}
        if(String(row.genre||'').includes(LOCK_SENTINEL))throw Object.assign(new Error('项目已锁定'),{status:423});
        const updates=p.updates||p;
        const remote={name:row.name,script:row.script||'',episodes:row.episodes||[]};
        let merged;
        if(p.base){try{merged=threeWayMerge(p.base,{...p.base,...Object.fromEntries(Object.entries(updates).filter(([k])=>['name','script','episodes'].includes(k)))},remote);}catch(error){throw Object.assign(error,{status:409});}}
        else { // Older clients cannot safely overwrite a newer cloud document without a baseline.
          const changed=Object.entries(updates).some(([k,v])=>k in remote&&JSON.stringify(v)!==JSON.stringify(remote[k]));
          if(changed)throw Object.assign(new Error('请更新到 2.2.0 并刷新云端文档后保存，本地内容仍保留'),{status:409});
          merged=remote;
        }
        const saved=(await client.query('update collab_projects set name=$2,script=$3,episodes=$4,updated_at=now() where id=$1 returning *',[pid,merged.name,merged.script,JSON.stringify(merged.episodes)])).rows[0];
        await client.query('COMMIT');return saved;
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    async deleteDirectorProject(pid, uid) {
      if(!uid)return null;
      const client=await pool.connect();
      try{
        await client.query('BEGIN');await client.query("set local lock_timeout='3s'");
        const row=(await client.query('select * from collab_projects where id=$1 and owner_id=$2 for update',[pid,uid])).rows[0];
        if(!directorRow(row)){await client.query('ROLLBACK');return null;}
        if(String(row.genre).includes(LOCK_SENTINEL))throw statusError(423,'项目已锁定，不能删除');
        // Both historical local-ID links and cloud-ID links are live references.
        const linked=(await client.query(`select 1 as ok from collab_projects c where c.id<>$1 and c.deleted_at is null
          and position('[COLLAB_PROJECT]' in c.genre)>0 and position('[RECYCLE_UNTIL:' in c.genre)=0
          and (c.director_project_id=$1::text or ($2<>'' and c.director_project_id=$2) or
            position('[COLLAB_SOURCE:'||$1::text||']' in c.genre)>0 or
            ($2<>'' and position('[COLLAB_SOURCE:'||$2||']' in c.genre)>0)) limit 1`,[pid,String(row.analysis_output||'').trim()])).rows[0];
        if(linked)throw statusError(409,'导演项目仍被有效协作项目引用，请先解除关联');
        const removed=(await client.query('delete from collab_projects where id=$1 and owner_id=$2 returning id',[pid,uid])).rows[0]||null;
        await client.query('COMMIT');return removed;
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    async setDirectorProjectLocked(pid,locked,uid) {
      if(!uid)return null;
      const client=await pool.connect();
      try{await client.query('BEGIN');
        const row=(await client.query('select * from collab_projects where id=$1 and owner_id=$2 for update',[pid,uid])).rows[0];
        if(!directorRow(row)){await client.query('ROLLBACK');return null;}
        const stripped=String(row.genre||'').split(LOCK_SENTINEL).join('').trim();
        const genre=locked?(stripped+'\n'+LOCK_SENTINEL).trim():stripped;
        const saved=(await client.query('update collab_projects set genre=$2,updated_at=now() where id=$1 returning id,genre',[pid,genre])).rows[0];
        await client.query('COMMIT');return saved;
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    async setProjectLocked(pid, locked, uid) {
      if (!uid) return null;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const row = (await client.query('select p.* from collab_projects p where p.id=$1 for update', [pid])).rows[0];
        if (!row || row.owner_id !== uid || row.deleted_at || String(row.genre||'').includes('[RECYCLE_UNTIL:')
          || String(row.genre||'').includes(DIRECTOR_SENTINEL)) {await client.query('ROLLBACK'); return null;}
        const stripped = String(row.genre || '').split(LOCK_SENTINEL).join('').trim();
        const next = locked ? (stripped + '\n' + LOCK_SENTINEL).trim() : stripped;
        const saved = (await client.query('update collab_projects set genre=$1, updated_at=now() where id=$2 returning id, genre', [next, pid])).rows[0];
        await client.query('COMMIT'); return saved;
      } catch (error) {await client.query('ROLLBACK'); throw error;} finally {client.release();}
    },
    async listDirectorMembers(pid, uid, domain='director') {
      if (!await readableDomain(pid, uid, domain)) return null;
      return many('select * from collab_members where project_id=$1 order by created_at', [pid]);
    },
    async addDirectorMember(pid, p, uid, domain='director') {
      if (!await isOwner(pid, uid)||!await readableDomain(pid,uid,domain)) return null;
      const target = await one('select id, username, display_name from app_users where username=$1 limit 1', [String(p.username || '').trim().toLowerCase()]);
      if (!target) return { error: 'user_not_found' };
      const role = ['producer','artist','collaborator','artist_collaborator'].includes(p.role) ? p.role : 'collaborator';
      const sql = 'insert into collab_members(project_id,user_id,username,display_name,role) values($1,$2,$3,$4,$5) on conflict(project_id,user_id) do update set role=excluded.role returning *';
      return one(sql, [pid, target.id, target.username, target.display_name || target.username, role]);
    },
    async removeDirectorMember(pid, userId, uid, domain='director') {
      if(!uid)return null;
      const client=await pool.connect();
      try{await client.query('BEGIN');
        const row=(await client.query('select p.* from collab_projects p where p.id=$1 for update',[pid])).rows[0];
        const correctDomain=domain==='director'?directorRow(row):Boolean(row&&!String(row.genre||'').includes(DIRECTOR_SENTINEL)&&!row.deleted_at);
        if(!correctDomain||row.owner_id!==uid){await client.query('ROLLBACK');return null;}
        const removed=(await client.query('delete from collab_members where project_id=$1 and user_id=$2 returning *',[pid,userId])).rows[0]||null;
        await client.query('COMMIT');return removed;
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    async updateMemberRole(pid, p, uid) {
      if(!uid)return null;
      const role = ['producer','artist','collaborator','artist_collaborator'].includes(p.role) ? p.role : 'collaborator';
      const client=await pool.connect();
      try{await client.query('BEGIN');
        const row=(await client.query('select p.* from collab_projects p where p.id=$1 for update',[pid])).rows[0];
        if(!row||row.owner_id!==uid||String(row.genre||'').includes(DIRECTOR_SENTINEL)||row.deleted_at){await client.query('ROLLBACK');return null;}
        const saved=(await client.query('update collab_members set role=$1 where project_id=$2 and user_id=$3 returning *',[role,pid,p.userId])).rows[0]||null;
        await client.query('COMMIT');return saved;
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    // Supabase 契约：stats-get 返回 {members, activity, media} 三个数组，客户端会遍历它们。
    async getStatsBundle(pid) {
      const members = await many('select * from collab_members where project_id=$1 order by created_at', [pid]);
      const activity = await many('select * from collab_activity where project_id=$1 order by created_at desc limit 500', [pid]);
      const media = await many('select kind from collab_media where project_id=$1', [pid]);
      return { members, activity, media };
    },
    async patchStoryboard(pid,payload,uid) {
      const client=await pool.connect();
      try {await client.query('BEGIN');
        await client.query("set local lock_timeout='3s'");
        await client.query("set local statement_timeout='6s'");
        const row=await lockAuthorizedProject(client,pid,uid,['producer','collaborator','artist_collaborator']);
        if(!editableCollab(row)){await client.query('ROLLBACK');return null;}
        const episodes=patchShot(row.episodes,payload);
        const saved=(await client.query('update collab_projects set episodes=$2,updated_at=now() where id=$1 returning *',[pid,JSON.stringify(episodes)])).rows[0];
        await client.query('COMMIT');return saved;
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    async refreshDirectorPrompts(pid,uid) {
      const client=await pool.connect();
      try {await client.query('BEGIN');
        await client.query("set local lock_timeout='3s'");
        await client.query("set local statement_timeout='6s'");
        const row=await lockAuthorizedProject(client,pid,uid);
        if(!row||String(row.genre||'').includes(DIRECTOR_SENTINEL)){await client.query('ROLLBACK');return null;}
        if(row.deleted_at||String(row.genre||'').includes('[RECYCLE_UNTIL:')||String(row.genre||'').includes(LOCK_SENTINEL)){await client.query('COMMIT');return row;}
        const source=(String(row.genre||'').match(/\[COLLAB_SOURCE:([^\]]+)\]/)||[])[1];
        if(!source){await client.query('COMMIT');return row;}
        const director=await readableDirector(client.query.bind(client),source,uid);
        if(!director){await client.query('COMMIT');return row;}
        const episodes=mergeDirectorEpisodes(row.episodes,director.episodes);
        const script=composeDirectorScript(director.script,row.episodes,director.episodes);
        if(JSON.stringify(episodes)!==JSON.stringify(row.episodes)||script!==row.script){
          const saved=(await client.query('update collab_projects set episodes=$2,script=$3,updated_at=now() where id=$1 returning *',[pid,JSON.stringify(episodes),script])).rows[0];
          await client.query('COMMIT');return saved;
        }
        await client.query('COMMIT');return row;
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    async syncDirectorSnapshot(pid,fields,uid) {
      const client=await pool.connect();
      try{await client.query('BEGIN');
        const locked=await lockAuthorizedProject(client,pid,uid,['producer']);
        const row=uid?await ensureCollabDomain(client,locked,uid):null;
        if(!row){await client.query('ROLLBACK');return null;}
        const episodes=mergeDirectorEpisodes(row.episodes,fields.episodes||[]);
        const script=fields.script===undefined?row.script:composeDirectorScript(fields.script,row.episodes,fields.episodes||[]);
        const saved=(await client.query('update collab_projects set episodes=$2,script=$3,updated_at=now() where id=$1 returning *',[pid,JSON.stringify(episodes),script])).rows[0];
        await client.query('COMMIT');return saved;
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    async updateProjectFields(pid, fields, uid, scope = '') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const allowedRoles=scope==='storyboard'?['producer','collaborator','artist_collaborator']:['producer'];
        const row=await lockAuthorizedProject(client,pid,uid,allowedRoles);
        if (!uid || !editableCollab(row)) {await client.query('ROLLBACK'); return null;}
        if (scope !== 'storyboard' && 'genre' in (fields||{}) && !String(row.genre||'').includes('[COLLAB_PROJECT]')
          && !await lockDirectorReferences(client, row, uid)) {await client.query('ROLLBACK'); return null;}
        const cols = [], vals = [pid];
        const keys = scope === 'storyboard' ? ['episodes'] : ['name','style','genre','script','analysis_output','episodes'];
        for (const [k, v] of Object.entries(fields || {})) {
          if (!keys.includes(k)) continue;
          vals.push(k === 'episodes' ? JSON.stringify(v || []) : k === 'genre' ? collabGenre(v, row.genre) : v);
          cols.push(k + '=$' + vals.length);
        }
        if (!cols.length) {await client.query('COMMIT'); return row;}
        const saved = (await client.query('update collab_projects set ' + cols.join(',') + ', updated_at=now() where id=$1 returning *', vals)).rows[0];
        await client.query('COMMIT'); return saved;
      } catch (error) {await client.query('ROLLBACK'); throw error;} finally {client.release();}
    },
    // 导演文档原始行（不做角色注入，由 collab 层统一处理）。
    async listDirectorProjectRows(uid) {
      const sql = 'select distinct p.* from collab_projects p left join collab_members m on m.project_id=p.id where p.genre like $2 and (p.owner_id=$1 or m.user_id=$1) order by p.updated_at desc';
      return (await many(sql, [uid, '%' + DIRECTOR_SENTINEL + '%'])).filter(directorRow);
    },
    // 所有协作项目的引用标记，用于判断导演项目是否被项目协作占用。
    async listCollabLinks() {
      return many("select id, genre from collab_projects where genre like '%[COLLAB_PROJECT]%'", []);
    },
    async findMembership(pid, uid) {
      return one('select * from collab_members where project_id=$1 and user_id=$2 limit 1', [pid, uid]);
    },
    async isProjectLocked(pid) {
      const row = await one('select genre from collab_projects where id=$1', [pid]);
      return String(row ? row.genre : '').includes(LOCK_SENTINEL);
    },
    async logActivity(pid, user, action, detail) {
      const sql = 'insert into collab_activity(project_id,user_id,username,role,action,detail) values($1,$2,$3,$4,$5,$6)';
      await pool.query(sql, [pid, user.id, user.username || '', user.role || '', action || '', detail || '']);
      return true;
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
      const saved = await one(sql, [pid, p.assetId || null, p.episode || 0, 'asset-image', '', p.objectPath || p.objectKey || '', p.filename || '', p.mime || '', uid, p.username || '']);
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
        await pool.query("delete from collab_media where project_id=$1 and kind='asset-image'", [pid]);
        await pool.query("update collab_assets set image_url='' where project_id=$1", [pid]);
      }
      return { ok: true };
    },
    async softDeleteProject(pid, uid) {
      if (!await isOwner(pid, uid)) return null;
      const row = await one('select genre from collab_projects where id=$1', [pid]);
      if (!row) return null;
      const purge = new Date(Date.now() + 3 * 86400000).toISOString();
      // 与 Supabase 一致：删除态写进 genre 的 RECYCLE_UNTIL 标记，3 天后由清理任务物理删除。
      const cleaned = String(row.genre || '').replace(/\n?\[RECYCLE_UNTIL:[^\]]+\]/g, '').trim();
      const genre = (cleaned + '\n[RECYCLE_UNTIL:' + purge + ']').trim();
      const saved = await one("update collab_projects set genre=$1, deleted_at=now(), purge_after=$2, updated_at=now() where id=$3 returning id, purge_after", [genre, purge, pid]);
      return saved;
    },
    async restoreProject(pid, uid) {
      if (!uid) return null;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const row = (await client.query('select p.* from collab_projects p where p.id=$1 for update', [pid])).rows[0];
        if (!row || row.owner_id !== uid || String(row.genre||'').includes(DIRECTOR_SENTINEL)) {await client.query('ROLLBACK'); return null;}
        const deadlines = [row.purge_after, ...[...String(row.genre||'').matchAll(/\[RECYCLE_UNTIL:([^\]]+)\]/g)].map(m=>m[1])].filter(Boolean);
        if (deadlines.some(value => !Number.isFinite(new Date(value).getTime()) || new Date(value).getTime() <= Date.now())
          || !await lockDirectorReferences(client, row, uid)) {await client.query('ROLLBACK'); return null;}
        const cleaned = String(row.genre || '').replace(/\n?\[RECYCLE_UNTIL:[^\]]+\]/g, '').trim();
        const saved = (await client.query('update collab_projects set genre=$1, deleted_at=null, purge_after=null, updated_at=now() where id=$2 returning id', [collabGenre(cleaned, cleaned), pid])).rows[0];
        await client.query('COMMIT'); return saved;
      } catch (error) {await client.query('ROLLBACK'); throw error;} finally {client.release();}
    },
    async deleteTask(pid, taskId, uid) {
      if (!await isOwner(pid, uid)) return null;
      return one('delete from collab_tasks where project_id=$1 and id=$2 returning *', [pid, taskId]);
    },
    async linkDirectorProject(pid, directorProjectId, uid) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        const row=(await client.query('select * from collab_projects where id=$1 and owner_id=$2 for update',[pid,uid])).rows[0];
        if(!uid||!editableCollab(row)){await client.query('ROLLBACK');return null;}
        if(!await lockReadableDirector(client,directorProjectId,uid)){await client.query('ROLLBACK');return null;}
        const cleaned=String(row.genre||'').replace(/\[COLLAB_SOURCE:[^\]]+\]/g,'').trim();
        const genre=collabGenre(cleaned,cleaned)+'\n[COLLAB_SOURCE:'+directorProjectId+']';
        const saved=(await client.query('update collab_projects set genre=$2,director_project_id=$3,updated_at=now() where id=$1 returning id,genre',[pid,genre,directorProjectId])).rows[0];
        await client.query('COMMIT');return saved;
      } catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    async listAssetImages(pid, uid) {
      const sql = 'select media.id, media.asset_id, media.object_path, media.filename, media.mime from collab_media media join collab_projects p on p.id=media.project_id left join collab_members m on m.project_id=p.id where media.project_id=$1 and media.kind=$2 and (p.owner_id=$3 or m.user_id=$3) order by media.created_at';
      return many(sql, [pid, 'asset-image', uid]);
    },
    async setProducer(userId, isProducer) {
      const sql = 'update app_users set is_producer=$1, updated_at=now() where id=$2 returning id, is_producer';
      return one(sql, [Boolean(isProducer), userId]);
    },
    async purgeExpiredProjects() {
      const r = await pool.query('delete from collab_projects where purge_after is not null and purge_after <= now() returning id');
      return { deleted: r.rowCount, ids: r.rows.map((x) => x.id) };
    },
  };
}

module.exports = { extendRepository, DIRECTOR_SENTINEL, LOCK_SENTINEL };
