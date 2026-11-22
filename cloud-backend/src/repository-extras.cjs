const {threeWayMerge}=require('./three-way-merge.cjs');
const {mergeDirectorEpisodes,patchShot}=require('./storyboard-merge.cjs');
const {composeDirectorScript, numberedEpisodes, publicGenre, collabGenre, editableCollab, ensureCollabDomain}=require('./collab-episodes.cjs');
const {isDeepStrictEqual}=require('node:util');
const {applyEpisodeIdentityChange,composeEpisodeIdentityScript,filterRemovedDirectorEpisodes}=require('./episode-identity-repair.cjs');
const {directorRow, readableDirector, lockReadableDirector, lockDirectorReferences}=require('./director-source.cjs');
const {sourceProtection,referencesDirector}=require('./cloud-recycle.cjs');
const {validateImageComposition}=require('./image-composition.cjs');
const {ART_ROLES,assetImageObject,lockWritableMediaProject}=require('./project-media-policy.cjs');
// 导演协作 / 统计 / 资产图片 的仓储扩展。
// 说明：导演项目与协作项目共用 collab_projects 表，用 genre 中的哨兵标记区分。
const DIRECTOR_SENTINEL = '[DIRECTOR_PROJECT]';
const LOCK_SENTINEL = '[PROJECT_LOCKED]';

const statusError = (status,message) => Object.assign(new Error(message),{status});

const READ_SCOPE = 'left join collab_members m on m.project_id=p.id and m.user_id=$2 where p.id::text=$1 and (p.owner_id=$2 or m.user_id is not null)';

function extendRepository(pool) {
  const one = async (s, p) => (await pool.query(s, p)).rows[0] || null;
  const many = async (s, p) => (await pool.query(s, p)).rows;
  const count = async (s, p) => (await pool.query(s, p)).rows[0].c;

  const directorLive = require('./director-live.cjs').directorLiveRepository(pool);
  async function transaction(work) {
    const client=await pool.connect();
    try { await client.query('BEGIN'); const result=await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const canReadStats = async (pid, uid) => Boolean(await one("select 1 from collab_projects p where p.id=$1 and (p.owner_id=$2 or exists(select 1 from collab_members m where m.project_id=p.id and m.user_id=$2 and m.role='producer'))",[pid,uid]));
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
    const auth=(await client.query(`select 1 as ok from collab_members where project_id=$1 and user_id=$2${roleSql} limit 1 for share`,[pid,uid,...(roles||[])])).rows[0];
    return auth?row:null;
  };

  return {
    ...directorLive,
    ...require('./director-versions.cjs').directorVersionRepository(pool,{onPublish:directorLive.resetDirectorLive}),
    ...require('./analysis-repository.cjs').analysisRepository(pool),
    ...require('./art-review-repository.cjs').artReviewRepository(pool),
    ...require('./prompt-binding.cjs').promptBindingRepository(pool),
    findReadableDirectorSource: (source, uid) => readableDirector(pool.query.bind(pool), source, uid),
    async createDirectorProject(p, uid, ownerName) {
      return transaction(async client=>{
        const genre = publicGenre(p.genre) + '\n' + DIRECTOR_SENTINEL;
        const source = p.directorProjectId || p.analysisOutput || '';
        if (typeof source!=='string' || source.length>500 || /[\[\]\r\n]/.test(source)) throw statusError(400,'导演项目编号无效');
        let row;
        if (source.trim()) {
          await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['director-project:'+uid+':'+source]);
          const prior=(await client.query("select p.* from collab_projects p where p.owner_id=$1 and p.analysis_output=$2 and length(p.analysis_output)<=500 and p.genre like '%[DIRECTOR_PROJECT]%' and p.deleted_at is null",[uid,source])).rows.filter(directorRow);
          if (prior.length>1) throw statusError(409,'这个导演项目有多条云端记录，请刷新后核对');
          row=prior[0];
        }
        const sql = 'insert into collab_projects(name,owner_id,owner_name,style,genre,script,episodes,analysis_output) values($1,$2,$3,$4,$5,$6,$7,$8) returning *';
        row ||= (await client.query(sql,[p.name||'未命名导演项目',uid,ownerName||'',p.style||'',genre.trim(),p.script||'',JSON.stringify(p.episodes||[]),source||' '])).rows[0];
        await client.query("insert into collab_members(project_id,user_id,username,display_name,role) values($1,$2,$3,$4,'producer') on conflict(project_id,user_id) do nothing",[row.id,uid,p.ownerUsername||'',ownerName||'']);
        return row;
      });
    },
    async listDirectorProjects(uid) { return this.listDirectorProjectRows(uid); },
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
        const aliases=[row.id,'cloud-'+row.id,row.analysis_output].filter(Boolean);
        const links=(await client.query("select c.id,c.genre,c.deleted_at,c.purge_after,c.director_project_id from collab_projects c where c.id<>$1 and c.genre like '%[COLLAB_PROJECT]%' and (c.director_project_id=any($2::text[]) or collab_source_markers(c.genre) && $2::text[])",[pid,aliases])).rows;
        if(links.some(link=>referencesDirector(link,row)&&sourceProtection(link)!=='expired'))throw statusError(409,'导演项目仍被协作项目引用或处于云端三天恢复期，请待关联解除或恢复期到期后删除');
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
    async removeDirectorMember(pid, target, uid, domain='director') {
      if(typeof target==='string')target={userId:target};
      if(!uid||!(target?.memberId||target?.userId))return null;
      const client=await pool.connect();
      try{await client.query('BEGIN');
        const row=(await client.query('select p.* from collab_projects p where p.id=$1 for update',[pid])).rows[0];
        const correctDomain=domain==='director'?directorRow(row):Boolean(row&&!String(row.genre||'').includes(DIRECTOR_SENTINEL)&&!row.deleted_at);
        if(!correctDomain||row.owner_id!==uid){await client.query('ROLLBACK');return null;}
        const column=target.memberId?'id':'user_id';
        const removed=(await client.query(`delete from collab_members where project_id=$1 and ${column}=$2 and role <> 'producer' and user_id<>$3 returning *`,[pid,target.memberId||target.userId,uid])).rows[0]||null;
        await client.query('COMMIT');return removed;
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    async updateMemberRole(pid, p, uid) {
      if(!uid||!(p.memberId||p.userId))return null;
      const role = ['producer','artist','collaborator','artist_collaborator'].includes(p.role) ? p.role : 'collaborator';
      const client=await pool.connect();
      try{await client.query('BEGIN');
        const row=(await client.query('select p.* from collab_projects p where p.id=$1 for update',[pid])).rows[0];
        if(!row||row.owner_id!==uid||String(row.genre||'').includes(DIRECTOR_SENTINEL)||row.deleted_at){await client.query('ROLLBACK');return null;}
        const column=p.memberId?'id':'user_id';
        const saved=(await client.query(`update collab_members set role=$1 where project_id=$2 and ${column}=$3 and role <> 'producer' and user_id<>$4 returning *`,[role,pid,p.memberId||p.userId,uid])).rows[0]||null;
        await client.query('COMMIT');return saved;
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    // Supabase 契约：stats-get 返回 {members, activity, media} 三个数组，客户端会遍历它们。
    async getStatsBundle(pid,uid) {
      return one("select coalesce((select jsonb_agg(m order by m.created_at) from collab_members m where m.project_id=p.id),'[]') as members,"+
        " coalesce((select jsonb_agg(a order by a.created_at desc) from (select * from collab_activity where project_id=p.id order by created_at desc limit 500) a),'[]') as activity,"+
        " coalesce((select jsonb_agg(jsonb_build_object('kind',m.kind)) from collab_media m where m.project_id=p.id),'[]') as media"+
        " from collab_projects p where p.id=$1 and (p.owner_id=$2 or exists(select 1 from collab_members m where m.project_id=p.id and m.user_id=$2 and m.role='producer'))",[pid,uid]);
    },
    async patchStoryboard(pid,payload,uid) {
      const client=await pool.connect();
      try {await client.query('BEGIN');
        await client.query("set local lock_timeout='3s'");
        await client.query("set local statement_timeout='6s'");
        const row=await lockAuthorizedProject(client,pid,uid,payload.operation==='publish'?['producer','artist','artist_collaborator']:['producer','collaborator','artist_collaborator']);
        if(!editableCollab(row)){await client.query('ROLLBACK');return null;}
        const episodes=patchShot(row.episodes,payload);
        const saved=(await client.query('update collab_projects set episodes=$2,updated_at=now() where id=$1 returning *',[pid,JSON.stringify(episodes)])).rows[0];
        await client.query('COMMIT');return saved;
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    async refreshDirectorPrompts(pid,uid) {
      const client=await pool.connect();
      let writing=false;
      const inspect=async row=>{
        if (!row || String(row.genre||'').includes(DIRECTOR_SENTINEL)) return {row:null};
        if (row.deleted_at || /\[(?:RECYCLE_UNTIL:|PROJECT_LOCKED\])/.test(row.genre||'')) return {row};
        const source=(String(row.genre||'').match(/\[COLLAB_SOURCE:([^\]]+)\]/)||[])[1];
        if (!source) return {row};
        const director=await readableDirector(client.query.bind(client),source,uid);
        if (!director) return {row};
        let episodes,script;
        try {
          numberedEpisodes(row.episodes);numberedEpisodes(director.episodes);
          const incoming=filterRemovedDirectorEpisodes(row.episodes||[],director.episodes||[]);
          episodes=mergeDirectorEpisodes(row.episodes,incoming);numberedEpisodes(episodes);
          script=(row.episodes||[]).some(ep=>ep.episodeIdentityHistory?.length)
            ?composeEpisodeIdentityScript(episodes):composeDirectorScript(director.script,row.episodes,incoming);
        } catch (error) {
          if (error.code!=='EPISODE_IDENTITY_CONFLICT') throw error;
          return {row:{...row,director_sync_warning:{code:error.code,message:error.message}}};
        }
        return {row,episodes,script,changed:!isDeepStrictEqual(episodes,row.episodes)||script!==row.script};
      };
      try {
        const read=(await client.query('select p.*,m.role as viewer_role from collab_projects p '+READ_SCOPE+' limit 1',[pid,uid])).rows[0];
        if (read && read.owner_id!==uid && !read.viewer_role) return null;
        const first=await inspect(read);
        if (!first.changed) return first.row;
        await client.query('BEGIN');writing=true;
        await client.query("set local lock_timeout='3s'");
        await client.query("set local statement_timeout='6s'");
        const current=await lockAuthorizedProject(client,pid,uid);
        const next=await inspect(current);
        const saved=next.changed
          ?(await client.query('update collab_projects set episodes=$2,script=$3,updated_at=now() where id=$1 returning *',[pid,JSON.stringify(next.episodes),next.script])).rows[0]
          :next.row;
        await client.query('COMMIT');writing=false;
        return saved;
      } catch (error) {
        if (writing) await client.query('ROLLBACK');
        throw error;
      } finally {client.release();}
    },
    async syncDirectorSnapshot(pid,fields,uid) {
      const client=await pool.connect();
      try{await client.query('BEGIN');
        const locked=await lockAuthorizedProject(client,pid,uid,['producer']);
        if(!uid||!editableCollab(locked)){await client.query('ROLLBACK');return null;}
        if(!fields||!Array.isArray(fields.episodes)||fields.episodes.some(ep=>!ep||typeof ep!=='object'||Array.isArray(ep))
          ||(fields.script!==undefined&&typeof fields.script!=='string'))throw statusError(400,'导演分集列表或总稿无效');
        numberedEpisodes(fields.episodes);numberedEpisodes(locked.episodes);
        const row=await ensureCollabDomain(client,locked,uid);
        if(!row){await client.query('ROLLBACK');return null;}
        const incoming=filterRemovedDirectorEpisodes(row.episodes||[],fields.episodes);
        const episodes=mergeDirectorEpisodes(row.episodes,incoming);numberedEpisodes(episodes);
        const script=(row.episodes||[]).some(ep=>ep.episodeIdentityHistory?.length)?composeEpisodeIdentityScript(episodes)
          :fields.script===undefined?row.script:composeDirectorScript(fields.script,row.episodes,incoming);
        const saved=(await client.query('update collab_projects set episodes=$2,script=$3,updated_at=now() where id=$1 returning *',[pid,JSON.stringify(episodes),script])).rows[0];
        await client.query('COMMIT');return saved;
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    async resolveEpisodeIdentity(pid,payload,uid) {
      const client=await pool.connect();
      try {await client.query('BEGIN');
        const row=await lockAuthorizedProject(client,pid,uid,['producer']);
        if(!uid||!editableCollab(row)){await client.query('ROLLBACK');return null;}
        // Do not invoke strict snapshot normalization while repairing legacy
        // identity conflicts. Retain the same live-reference authorization.
        if(!String(row.genre||'').includes('[COLLAB_PROJECT]')&&!await lockDirectorReferences(client,row,uid)){await client.query('ROLLBACK');return null;}
        if(!Array.isArray(payload.baseEpisodes)||!isDeepStrictEqual(payload.baseEpisodes,row.episodes||[]))throw Object.assign(statusError(409,'分集已被协作者修改，请刷新核对后再修正，当前原稿未被覆盖'),{code:'EPISODE_IDENTITY_STALE'});
        const episodes=applyEpisodeIdentityChange(row.episodes,payload);
        const carrier=episodes.find(ep=>ep.episodeIdentityHistory?.length)||episodes[0];
        carrier.episodeIdentityHistory=[...(carrier.episodeIdentityHistory||[]),{at:new Date().toISOString(),reason:payload.operation,previousProjectScript:String(row.script||'')}];
        const script=composeEpisodeIdentityScript(episodes);
        const saved=(await client.query('update collab_projects set episodes=$2,script=$3,updated_at=now() where id=$1 returning *',[pid,JSON.stringify(episodes),script])).rows[0];
        await client.query('COMMIT');return saved;
      }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    async updateProjectFields(pid, fields, uid, scope = '') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const allowedRoles=scope==='storyboard'?['producer','collaborator','artist_collaborator']:scope==='art-image-settings'?['producer','artist','artist_collaborator']:['producer'];
        const row=await lockAuthorizedProject(client,pid,uid,allowedRoles);
        if (!uid || !editableCollab(row)) {await client.query('ROLLBACK'); return null;}
        if (scope !== 'storyboard' && 'genre' in (fields||{}) && !String(row.genre||'').includes('[COLLAB_PROJECT]')
          && !await lockDirectorReferences(client, row, uid)) {await client.query('ROLLBACK'); return null;}
        const cols = [], vals = [pid];
        const keys = scope === 'storyboard' ? ['episodes'] : scope==='art-image-settings'?['image_composition']:['name','style','genre','script','analysis_output','episodes'];
        for (const [k, v] of Object.entries(fields || {})) {
          if (!keys.includes(k)) continue;
          if(k==='image_composition')validateImageComposition(v);
          vals.push(k === 'episodes' ? JSON.stringify(v || []) : k === 'genre' ? collabGenre(v, row.genre) : v);
          cols.push(k + '=$' + vals.length);
        }
        if (!cols.length) {await client.query('COMMIT'); return row;}
        const saved = (await client.query('update collab_projects set ' + cols.join(',') + ', updated_at=now() where id=$1 returning *', vals)).rows[0];
        await client.query('COMMIT'); return saved;
      } catch (error) {await client.query('ROLLBACK'); throw error;} finally {client.release();}
    },
    async listDirectorProjectRows(uid) {
      const sql = 'select p.*,m.role as viewer_role from ('+
        'select id from collab_projects where owner_id=$1 union select project_id from collab_members where user_id=$1'+
        ') accessible join collab_projects p on p.id=accessible.id left join collab_members m on m.project_id=p.id and m.user_id=$1 '+
        "where p.genre like '%[DIRECTOR_PROJECT]%' and p.deleted_at is null order by p.updated_at desc";
      return (await many(sql,[uid])).filter(directorRow);
    },
    async listCollabLinks(aliases) {
      if (!aliases.length) return [];
      return many("select id,genre,director_project_id,deleted_at,purge_after from collab_projects where genre like '%[COLLAB_PROJECT]%' and (director_project_id=any($1::text[]) or collab_source_markers(genre) && $1::text[])",[aliases]);
    },
    async directorAssociationStates(items) {
      if(!Array.isArray(items)||items.length>200)throw statusError(400,'关联核验最多支持200个本地项目');
      for(const item of items){
        if(!item||typeof item.projectId!=='string'||typeof item.collaborationProjectId!=='string'||!item.projectId||!item.collaborationProjectId||item.projectId.length>500||item.collaborationProjectId.length>500)throw statusError(400,'关联核验参数无效');
      }
      if (!items.length) return [];
      const rows=await many(
        'with requested as (select * from unnest($1::text[],$2::text[]) with ordinality as x(project_id,collab_id,position)) '+
        'select requested.position,p.genre,p.deleted_at,p.purge_after from requested join collab_projects p on ('+
        'p.id::text=requested.collab_id or p.director_project_id=requested.project_id or collab_source_markers(p.genre) && array[requested.project_id] or '+
        "(p.genre like '%[DIRECTOR_PROJECT]%' and length(p.analysis_output)<=500 and p.analysis_output=requested.project_id))",
        [items.map(item=>item.projectId),items.map(item=>item.collaborationProjectId)]);
      const protectedPositions=new Set(rows.filter(row=>!String(row.genre||'').includes('[COLLAB_PROJECT]')||sourceProtection(row)!=='expired').map(row=>Number(row.position)));
      return items.map(({projectId,collaborationProjectId},index)=>({projectId,collaborationProjectId,status:protectedPositions.has(index+1)?'protected':'released'}));
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
      if (!await canReadStats(pid, uid)) return null;
      const assets = await count('select count(*)::int as c from collab_assets where project_id=$1', [pid]);
      const members = await count('select count(*)::int as c from collab_members where project_id=$1', [pid]);
      const tasks = await count('select count(*)::int as c from collab_tasks where project_id=$1', [pid]);
      const doneTasks = await count("select count(*)::int as c from collab_tasks where project_id=$1 and status='已完成'", [pid]);
      const media = await count('select count(*)::int as c from collab_media where project_id=$1', [pid]);
      const messages = await count('select count(*)::int as c from collab_messages where project_id=$1', [pid]);
      return { assets, members, tasks, doneTasks, media, messages };
    },
    async createAsset(pid,p,uid) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        const project=await lockAuthorizedProject(client,pid,uid,['producer','artist','artist_collaborator']);
        if(!editableCollab(project)){await client.query('ROLLBACK');return null;}
        const created=await client.query(`insert into collab_assets(project_id,category,name,description,first_episode,episodes)
          values($1,$2,$3,$4,$5,$6) returning *`,
          [pid,p.category||'character',p.name||'未命名资产',p.description||'',p.firstEpisode||1,p.episodes||[]]);
        await client.query('COMMIT');
        return created.rows[0];
      } catch(error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {client.release();}
    },
    async selectAssetImage(pid,assetId,imageId,uid) {
      return transaction(async client=>{
        if (!await lockWritableMediaProject(client,pid,uid,ART_ROLES)) return null;
        const image=(await client.query("select object_path,url from collab_media where project_id=$1 and asset_id::text=$2 and id::text=$3 and kind='asset-image'",[pid,assetId,imageId])).rows[0];
        if (!image || (image.object_path && !assetImageObject(image.object_path,pid))) return null;
        return (await client.query('update collab_assets set image_url=$3,updated_at=now() where project_id=$1 and id::text=$2 returning *',[pid,assetId,image.object_path||image.url])).rows[0]||null;
      });
    },
    async recordAssetImage(pid,p,uid) {
      const key=p.objectPath||p.objectKey;
      if (!p.assetId || !assetImageObject(key,pid)) return null;
      return transaction(async client=>{
        if (!await lockWritableMediaProject(client,pid,uid,ART_ROLES)) return null;
        if (!(await client.query('select 1 from collab_assets where project_id=$1 and id::text=$2',[pid,p.assetId])).rows.length) return null;
        const existing=(await client.query('select * from collab_media where object_path=$1 limit 1',[key])).rows[0];
        if (existing) return existing.project_id===pid && existing.asset_id===p.assetId && existing.kind==='asset-image' && existing.user_id===uid ? existing : null;
        const saved=(await client.query(
          "insert into collab_media(project_id,asset_id,episode,kind,object_path,filename,mime,user_id,username) values($1,$2,$3,'asset-image',$4,$5,$6,$7,$8) returning *",
          [pid,p.assetId,p.episode||0,key,p.filename||'',p.mime||'',uid,p.username||''])).rows[0];
        await client.query('update collab_assets set image_url=$3,updated_at=now() where id::text=$2 and project_id=$1',[pid,p.assetId,key]);
        return saved;
      });
    },
    async deleteAssetImage(pid,p,uid) {
      return transaction(async client=>{
        if (!await lockWritableMediaProject(client,pid,uid,ART_ROLES)) return null;
        const removed=(await client.query("delete from collab_media where project_id=$1 and id::text=$2 and kind='asset-image' returning *",[pid,p.mediaId||p.imageId||''])).rows[0];
        if (!removed) return null;
        if (removed.asset_id) await client.query("update collab_assets a set image_url=coalesce((select coalesce(nullif(m.object_path,''),m.url) from collab_media m where m.asset_id=a.id and m.project_id=$1 and m.kind='asset-image' order by m.created_at desc,m.id desc limit 1),''),updated_at=now() where a.id=$2 and a.project_id=$1 and a.image_url=coalesce(nullif($3,''),$4)",[pid,removed.asset_id,removed.object_path,removed.url]);
        return removed;
      });
    },
    async clearAssetImages(pid,p,uid) {
      return transaction(async client=>{
        const project=await lockWritableMediaProject(client,pid,uid,['producer']);
        if (!project || project.owner_id!==uid) return null;
        if (p?.assetId) {
          await client.query("delete from collab_media where project_id=$1 and asset_id::text=$2 and kind='asset-image'",[pid,p.assetId]);
          await client.query("update collab_assets set image_url='',updated_at=now() where project_id=$1 and id::text=$2",[pid,p.assetId]);
        } else {
          await client.query("delete from collab_media where project_id=$1 and kind='asset-image'",[pid]);
          await client.query("update collab_assets set image_url='',updated_at=now() where project_id=$1",[pid]);
        }
        return {ok:true};
      });
    },
    async softDeleteProject(pid,uid) {
      return transaction(async client=>{
        const row=(await client.query('select id,owner_id,genre,deleted_at,purge_after from collab_projects where id=$1 and owner_id=$2 for update',[pid,uid])).rows[0];
        if (!editableCollab(row)) return null;
        const purge=new Date(Date.now()+3*86400000).toISOString();
        const genre=(String(row.genre||'').trim()+'\n[RECYCLE_UNTIL:'+purge+']').trim();
        return (await client.query('update collab_projects set genre=$1,deleted_at=now(),purge_after=$2,updated_at=now() where id=$3 returning id,purge_after',[genre,purge,pid])).rows[0]||null;
      });
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
        const director=await lockReadableDirector(client,directorProjectId,uid);
        if(!director){await client.query('ROLLBACK');return null;}
        if(directorProjectId===`cloud-${director.id}`)directorProjectId=director.id;
        const cleaned=String(row.genre||'').replace(/\[COLLAB_SOURCE:[^\]]+\]|\[COLLAB_LOCAL_SOURCE\]/g,'').trim();
        const genre=collabGenre(cleaned,cleaned)+'\n[COLLAB_SOURCE:'+directorProjectId+']';
        const saved=(await client.query('update collab_projects set genre=$2,director_project_id=$3,updated_at=now() where id=$1 returning id,genre',[pid,genre,directorProjectId])).rows[0];
        await client.query('COMMIT');return saved;
      } catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    async getAssetImageProjectAccess(pid,uid) {
      return one(`select p.id,p.genre from collab_projects p where p.id=$1
        and (p.owner_id=$2 or exists(select 1 from collab_members member where member.project_id=p.id and member.user_id=$2))`,[pid,uid]);
    },
    async findAdoptedAssetImage(pid,assetId,uid) {
      return one(`select a.image_url,m.id as image_id,m.filename,m.mime from collab_assets a
        join collab_projects p on p.id=a.project_id
        left join lateral (select id,filename,mime from collab_media
          where asset_id=a.id and project_id=a.project_id and kind='asset-image'
            and coalesce(nullif(object_path,''),url)=nullif(a.image_url,'')
          order by created_at desc,id desc limit 1) m on true
        where a.project_id=$1 and a.id::text=$2
          and (p.owner_id=$3 or exists(select 1 from collab_members member where member.project_id=p.id and member.user_id=$3))`,[pid,assetId,uid]);
    },
    async listAssetImages(pid, uid) {
      const sql = 'select media.id, media.asset_id, media.object_path, media.url, media.filename, media.mime from collab_media media join collab_projects p on p.id=media.project_id where media.project_id=$1 and media.kind=$2 and (p.owner_id=$3 or exists(select 1 from collab_members m where m.project_id=p.id and m.user_id=$3)) order by media.created_at';
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
