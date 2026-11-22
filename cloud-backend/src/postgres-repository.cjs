const { Pool } = require('pg');
const crypto = require('node:crypto');
const { extendRepository } = require('./repository-extras.cjs');
const {collabGenre} = require('./collab-episodes.cjs');
const {resolveCreationSource} = require('./director-source.cjs');
const {MEDIA_KINDS,SHARE_ROLES,ART_ROLES,REFERENCE_ROLES,validProjectObject,assetImageObject,lockWritableMediaProject}=require('./project-media-policy.cjs');
const {validReferenceObject,publishedReferenceUses}=require('./reference-upload-delete.cjs');
const {inviteUsable,rolesForInvite}=require('./invites.cjs');
const {emailCodeValid}=require('./email-code.cjs');

const PROJECT_ACCESS = 'left join collab_members m on m.project_id=p.id and m.user_id=$2 where p.id::text=$1 and (p.owner_id=$2 or m.user_id is not null)';
const INVITE_SELECT = 'select id,code,kind,role,max_uses,used_count,disabled from invites where digest=$1 for update';
const USE_INVITE = 'update invites set used_count=used_count+1 where id=$1 and not disabled and (max_uses is null or used_count<max_uses) returning id,used_count';
const authError = (status,message) => Object.assign(new Error(message),{status});

async function protectedObject(client, project, media) {
  if (publishedReferenceUses(project,media)) return true;
  const result = await client.query(
    "select 1 as ok from collab_assets a where a.project_id=$4 and (a.image_url=$1 or a.image_url=$2 or right(split_part(a.image_url,'?',1),length($1)+1)='/'||$1)" +
    " union all select 1 from collab_media m where m.id<>$3 and m.object_path=$1" +
    " union all select 1 from collab_messages m where m.project_id=$4 and (m.image_url=$1 or right(split_part(m.image_url,'?',1),length($1)+1)='/'||$1) limit 1",
    [media.object_path,media.url||media.object_path,media.id,project.id]);
  return Boolean(result.rows[0]);
}

function createRepository(databaseUrl, deps = {}) {
  const pool = deps.pool || new Pool({ connectionString: databaseUrl, max: 5, idleTimeoutMillis: 30000 });
  async function transaction(work){const client=await pool.connect();try{await client.query('begin');const value=await work(client);await client.query('commit');return value;}catch(error){await client.query('rollback');throw error;}finally{client.release();}}
  const select = 'id, username, display_name, email, roles, active_role, is_admin, is_producer, banned, created_at, avatar_data, bio, profile_tags, password_hash';
  return {
    ...require('./local-project-share.cjs').createLocalShareRepository(pool),
    ...require('./software-license-repository.cjs').extendLicenseRepository(pool),
    ...require('./win-ai-repository.cjs').extendWinAIRepository(pool),
    async updateProfile(id,p){const r=await pool.query('update app_users set display_name=$2,bio=$3,profile_tags=$4,avatar_data=$5,updated_at=now() where id=$1 returning '+select,[id,p.displayName,p.bio,p.tags,p.avatar]);return r.rows[0]||null;},
    async findUser(username) { const r = await pool.query(`select ${select} from app_users where username=$1 limit 1`, [username]); return r.rows[0] || null; },
    async findEmail(email) { const r = await pool.query('select id from app_users where email=$1 limit 1', [email]); return r.rows[0] || null; },
    async countUsers() { const r = await pool.query('select count(*)::int as count from app_users'); return r.rows[0].count; },
    async createUser(input) { const r = await pool.query("insert into app_users (username,display_name,email,password_hash,roles,active_role,is_admin,is_producer) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id,username,display_name,email,roles,active_role,is_admin,is_producer,banned,created_at,password_hash", [input.username,input.displayName,input.email,input.passwordHash,input.roles||[input.role],input.activeRole||input.role,input.isAdmin,input.isProducer]); return r.rows[0]; },
    async registerWithInvite(input) {
      try {
        return await transaction(async client=>{
          const code=(await client.query('select code_hash,expires_at from email_codes where email=$1 for update',[input.email])).rows[0];
          if (!emailCodeValid(code,input.emailCode)) throw authError(400,'邮箱验证码无效或已过期');
          const invite=(await client.query(INVITE_SELECT,[input.digest])).rows[0];
          if (!inviteUsable(invite)) throw authError(400,'邀请码无效、已停用或已用完');
          const grant=rolesForInvite(invite,input.requestedRole);
          if (grant.error) throw authError(400,grant.error);
          const activeRole=grant.roles.includes(input.requestedRole)?input.requestedRole:grant.roles[0];
          const account=(await client.query('insert into app_users(username,display_name,email,password_hash,roles,active_role,is_admin,is_producer) values($1,$2,$3,$4,$5,$6,$7,$8) returning '+select,
            [input.username,input.displayName,input.email,input.passwordHash,grant.roles,activeRole,grant.isAdmin,grant.isProducer])).rows[0];
          if (!(await client.query(USE_INVITE,[invite.id])).rows.length) throw authError(400,'邀请码无效、已停用或已用完');
          await client.query('delete from email_codes where email=$1',[input.email]);
          await client.query("insert into app_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '7 days')",
            [account.id,crypto.createHash('sha256').update(input.token).digest('hex')]);
          return account;
        });
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'app_users_username_key') throw authError(409,'账号已存在');
        if (error.code === '23505' && error.constraint === 'app_users_email_key') throw authError(409,'邮箱已绑定其他账号');
        throw error;
      }
    },
    async unlockWithInvite(uid,digest) { return transaction(async client=>{
      const user=(await client.query('select '+select+' from app_users where id=$1 for update',[uid])).rows[0];
      if (!user || user.banned) throw authError(403,'账号不可用');
      const invite=(await client.query(INVITE_SELECT,[digest])).rows[0];
      if (!inviteUsable(invite)) throw authError(400,'邀请码无效、已停用或已用完');
      if (invite.kind!=='unlock') throw authError(400,'该邀请码不是身份解锁码');
      const missing=['creator','director'].find(role=>!user.roles.includes(role));
      if (!missing) return user;
      if (!(await client.query(USE_INVITE,[invite.id])).rows.length) throw authError(400,'邀请码无效、已停用或已用完');
      return (await client.query('update app_users set roles=array_append(roles,$2),updated_at=now() where id=$1 returning '+select,[uid,missing])).rows[0];
    }); },
    async createSession(userId, rawToken, expectedPasswordHash) { return transaction(async client=>{const locked=await client.query('select banned,password_hash from app_users where id=$1 for update',[userId]);const user=locked.rows[0];if(!user||user.banned||(expectedPasswordHash!==undefined&&user.password_hash!==expectedPasswordHash))return null;await client.query("insert into app_sessions (user_id,token_hash,expires_at) values ($1,$2,now()+interval '7 days')",[userId,crypto.createHash('sha256').update(rawToken).digest('hex')]);return rawToken;}); },
    async findBySession(hash) { const r = await pool.query(`with valid_session as materialized (
      select s.user_id,s.token_hash,u.banned from app_sessions s join app_users u on u.id=s.user_id
      where s.token_hash=$1 and s.expires_at>now()
    ), refreshed as (
      update app_sessions s set expires_at=now()+interval '7 days' from valid_session v
      where s.token_hash=v.token_hash and not v.banned and s.expires_at<now()+interval '6 days'
      returning s.user_id
    ) select u.id as id, u.username, u.display_name, u.email, u.roles, u.active_role, u.is_admin, u.is_producer, u.banned, u.created_at,u.avatar_data,u.bio,u.profile_tags, u.password_hash
      from app_users u join valid_session s on s.user_id=u.id limit 1`, [hash]); return r.rows[0] || null; },
    async deleteSession(hash) { await pool.query('delete from app_sessions where token_hash=$1', [hash]); return true; },
    async updatePassword(userId, passwordHash) { await pool.query('update app_users set password_hash=$1, updated_at=now() where id=$2', [passwordHash, userId]); return true; },
    async resetPasswordAndRevokeSessions(userId,passwordHash,email,expectedCodeHash){return transaction(async client=>{const code=await client.query('select email from email_codes where email=$1 and code_hash=$2 and expires_at>now() for update',[email,expectedCodeHash]);if(!code.rows[0])throw Object.assign(new Error('验证码已失效'),{code:'AUTH_CODE_USED'});await client.query('select id from app_users where id=$1 for update',[userId]);await client.query('update app_users set password_hash=$1,updated_at=now() where id=$2',[passwordHash,userId]);await client.query('delete from app_sessions where user_id=$1',[userId]);await client.query('delete from email_codes where email=$1',[email]);return true;});},
    async addRole(userId, role) { const r = await pool.query(`update app_users set roles = (select array_agg(distinct x) from unnest(roles || $1::text[]) x), updated_at=now() where id=$2 returning ${select}`, [[role], userId]); return r.rows[0] || null; },
    async findInviteByDigest(digest) { const r = await pool.query('select id, code, kind, role, max_uses, used_count, disabled from invites where digest=$1 limit 1', [digest]); return r.rows[0] || null; },
    async consumeInvite(id) { const r = await pool.query(USE_INVITE, [id]); return r.rows[0] || null; },
    async createInvite(input) { const r = await pool.query('insert into invites (code, digest, kind, role, max_uses, note) values ($1,$2,$3,$4,$5,$6) returning id, code, kind, role, max_uses, used_count, disabled, note, created_at', [input.code, input.digest, input.kind, input.role, input.maxUses, input.note || '']); return r.rows[0]; },
    async listInvites() { const r = await pool.query('select id, code, kind, role, max_uses, used_count, disabled, note, created_at from invites order by created_at desc'); return r.rows; },
    async disableInvite(id, disabled) { const r = await pool.query('update invites set disabled=$1 where id=$2 returning id, disabled', [Boolean(disabled), id]); return r.rows[0] || null; },
    async listUsers() { const r = await pool.query('select id, username, display_name, email, roles, active_role, is_admin, is_producer, banned, created_at from app_users order by created_at desc'); return r.rows; },
    async setBanned(userId, banned) { return transaction(async client=>{const r=await client.query('update app_users set banned=$1, updated_at=now() where id=$2 returning id, banned',[Boolean(banned),userId]);if(banned)await client.query('delete from app_sessions where user_id=$1',[userId]);return r.rows[0]||null;}); },
    async deleteUser(userId) { await pool.query('delete from app_users where id=$1', [userId]); return true; },
    async saveEmailCode(email, codeHash, expiresAt) { await pool.query('insert into email_codes (email, code_hash, expires_at) values ($1,$2,$3) on conflict (email) do update set code_hash=excluded.code_hash, expires_at=excluded.expires_at, created_at=now()', [email, codeHash, expiresAt]); return true; },
    async findEmailCode(email) { const r = await pool.query('select email, code_hash, expires_at from email_codes where email=$1 limit 1', [email]); return r.rows[0] || null; },
    async deleteEmailCode(email) { await pool.query('delete from email_codes where email=$1', [email]); return true; },
    async createProject(p) {
      // Local projects upload a one-way snapshot; only authorized cloud sources
      // receive a live reference marker. Keep the local ID for client-side sync.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const resolved = await resolveCreationSource(client, p.directorProjectId, p.ownerId);
        const source = resolved.local ? '\n[COLLAB_LOCAL_SOURCE]' : resolved.id ? '\n[COLLAB_SOURCE:' + resolved.id + ']' : '';
        const genre = collabGenre(p.genre) + source;
        const sql = 'insert into collab_projects(name,owner_id,owner_name,style,genre,script,episodes,director_project_id) values($1,$2,$3,$4,$5,$6,$7,$8) returning *';
        const r = await client.query(sql, [p.name||'未命名项目',p.ownerId,p.ownerName||'',p.style||'',genre,p.script||'',JSON.stringify(p.episodes||[]),resolved.id]);
        const row = r.rows[0];
        await client.query("insert into collab_members(project_id,user_id,username,display_name,role) values($1,$2,$3,$4,'producer') on conflict(project_id,user_id) do nothing", [row.id, p.ownerId, p.ownerUsername||p.ownerName||'', p.ownerName||'']);
        await client.query('COMMIT');
        return row;
      } catch (error) {await client.query('ROLLBACK'); throw error;} finally {client.release();}
    },
    // 回收站需要看到已删除项目：这里不能过滤 deleted_at，
    // 只排除已过 3 天恢复期的项目（由清理任务物理删除）。
    async listProjects(uid, {summary=false} = {}) {
      const fields = summary ? "p.id,p.name,p.owner_id,p.owner_name,p.style,p.genre,p.director_project_id,p.image_composition,p.deleted_at,p.purge_after,p.created_at,p.updated_at,case when jsonb_typeof(p.episodes)='array' then jsonb_array_length(p.episodes) else 0 end as episode_count" : 'p.*';
      const sql = 'select '+fields+',m.role as viewer_role from ('+
        'select id from collab_projects where owner_id=$1 union select project_id from collab_members where user_id=$1'+
        ') accessible join collab_projects p on p.id=accessible.id left join collab_members m on m.project_id=p.id and m.user_id=$1 '+
        "where (p.purge_after is null or p.purge_after > now()) and position('[DIRECTOR_PROJECT]' in coalesce(p.genre,''))=0 and position('[LOCAL_SHARE_PENDING:' in coalesce(p.genre,''))=0 order by p.updated_at desc";
      const r = await pool.query(sql, [uid]);
      return r.rows;
    },
    async getProject(id,uid) { const r=await pool.query('select p.*,m.role as viewer_role from collab_projects p '+PROJECT_ACCESS,[id,uid]); return r.rows[0]||null; },
    async getProjectAccess(id,uid) { const r=await pool.query('select p.id,p.owner_id,p.genre,p.deleted_at,p.purge_after,m.role as viewer_role from collab_projects p '+PROJECT_ACCESS,[id,uid]); return r.rows[0]||null; },
    async updateProject(id,p,uid) { const r=await pool.query('update collab_projects set name=coalesce($1,name),style=coalesce($2,style),genre=coalesce($3,genre),script=coalesce($4,script),episodes=coalesce($5,episodes),updated_at=now() where id=$6 and owner_id=$7 returning *',[p.name,p.style,p.genre,p.script,p.episodes===undefined?null:JSON.stringify(p.episodes),id,uid]); return r.rows[0]||null; },
    async listMembers(pid,uid) { const r=await pool.query('select m.* from collab_members m join collab_projects p on p.id=m.project_id where m.project_id=$1 and (p.owner_id=$2 or m.user_id=$2) order by m.created_at',[pid,uid]); return r.rows; },
    async addMember(pid,p,uid) { const r=await pool.query('insert into collab_members(project_id,user_id,username,display_name,role) select $1,u.id,u.username,u.display_name,$2 from app_users u join collab_projects p on p.owner_id=$3 where u.username=$4 and p.id=$1 on conflict(project_id,user_id) do update set role=excluded.role returning *',[pid,p.role||'collaborator',uid,p.username]); return r.rows[0]||null; },
    async removeMember(pid,userId,uid) { const r=await pool.query('delete from collab_members m using collab_projects p where m.project_id=p.id and m.project_id=$1 and m.user_id=$2 and p.owner_id=$3 returning m.*',[pid,userId,uid]); return r.rows[0]||null; },
    async listAssets(pid,uid) { const r=await pool.query('select a.* from collab_assets a join collab_projects p on p.id=a.project_id where a.project_id=$1 and (p.owner_id=$2 or exists(select 1 from collab_members m where m.project_id=p.id and m.user_id=$2)) order by a.created_at',[pid,uid]); return r.rows; },
    async updateAsset(id, fields, uid, projectId) {
      const sql = `update collab_assets a set name=coalesce($1,a.name), description=coalesce($2,a.description), updated_at=now()
        from collab_projects p where a.project_id=p.id and a.id=$3 and a.project_id=$4
        and p.deleted_at is null and p.genre not like '%[PROJECT_LOCKED]%'
        and (p.owner_id=$5 or exists(select 1 from collab_members m where m.project_id=p.id and m.user_id=$5 and m.role in ('producer','artist','artist_collaborator')))
        returning a.*`;
      const r = await pool.query(sql, [fields.name ?? null, fields.description ?? null, id, projectId, uid]);
      return r.rows[0] || null;
    },
    async listTasks(pid,uid) { const r=await pool.query('select t.* from collab_tasks t join collab_projects p on p.id=t.project_id where t.project_id=$1 and (p.owner_id=$2 or exists(select 1 from collab_members m where m.project_id=p.id and m.user_id=$2)) order by t.episode,t.assigned_at',[pid,uid]); return r.rows; },
    async assignTask(pid,p,uid) {
      const r=await pool.query(`insert into collab_tasks(project_id,episode,title,assignee_id,assignee_name,status)
        select $1,$2,$3,$4,$5,$6 where exists(select 1 from collab_projects where id=$1 and owner_id=$7
        and deleted_at is null and coalesce(genre,'') not like '%[PROJECT_LOCKED]%'
        and coalesce(genre,'') not like '%[RECYCLE_UNTIL:%' and coalesce(genre,'') not like '%[DIRECTOR_PROJECT]%') returning *`,
        [pid,p.episode||1,p.title||'',p.memberUserId||p.assigneeId||null,p.memberName??p.assigneeName??'',p.status||'进行中',uid]);
      return r.rows[0]||null;
    },
    async updateTaskStatus(pid,taskId,status,uid) {
      const r=await pool.query(`update collab_tasks set status=$3,
        done_at=case when $3='已完成' then coalesce(done_at,now()) else null end
        where project_id=$1 and id=$2 and exists(select 1 from collab_projects where id=$1 and owner_id=$4
        and deleted_at is null and coalesce(genre,'') not like '%[PROJECT_LOCKED]%'
        and coalesce(genre,'') not like '%[RECYCLE_UNTIL:%' and coalesce(genre,'') not like '%[DIRECTOR_PROJECT]%') returning *`,
        [pid,taskId,status,uid]);
      return r.rows[0]||null;
    },
    async listMessages(pid,uid) { const r=await pool.query('select msg.* from collab_messages msg join collab_projects p on p.id=msg.project_id where msg.project_id=$1 and (p.owner_id=$2 or exists(select 1 from collab_members m where m.project_id=p.id and m.user_id=$2)) order by msg.created_at',[pid,uid]); return r.rows; },
    async sendMessage(pid,p,uid) { return transaction(async client=>{
      const image = p.imageUrl || '';
      if (image && !assetImageObject(image,pid)) return null;
      if (!await lockWritableMediaProject(client,pid,uid,SHARE_ROLES)) return null;
      const r = await client.query('insert into collab_messages(project_id,user_id,username,content,image_url) values($1,$2,$3,$4,$5) returning *',
        [pid,uid,p.username||'',p.content||'',image]);
      return r.rows[0]||null;
    }); },
    async listMedia(pid,uid) { const r=await pool.query('select media.* from collab_media media join collab_projects p on p.id=media.project_id where media.project_id=$1 and (p.owner_id=$2 or exists(select 1 from collab_members m where m.project_id=p.id and m.user_id=$2)) order by media.created_at desc',[pid,uid]); return r.rows; },
    async createMedia(pid,row,uid) { return transaction(async client=>{
      if (!MEDIA_KINDS.includes(row.kind) || !validProjectObject(row.object_path,pid,[row.kind])) return null;
      if (!await lockWritableMediaProject(client,pid,uid,row.asset_id ? ART_ROLES : SHARE_ROLES)) return null;
      if (row.asset_id && !(await client.query('select 1 from collab_assets where id::text=$1 and project_id=$2',[row.asset_id,pid])).rows.length) return null;
      const existing=(await client.query('select * from collab_media where object_path=$1 limit 1',[row.object_path])).rows[0];
      if (existing) return existing.project_id===pid && existing.user_id===uid && existing.kind===row.kind && existing.asset_id===(row.asset_id||null) ? existing : null;
      const r=await client.query('insert into collab_media(project_id,asset_id,episode,scene,kind,url,object_path,filename,mime,note,user_id,username) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *',[pid,row.asset_id,row.episode,row.scene,row.kind,'',row.object_path,row.filename,row.mime,row.note,uid,row.username]);
      return r.rows[0]||null;
    }); },
    async findMedia(id,uid) {
      if (!id) return null;
      const r=await pool.query('select media.* from collab_media media join collab_projects p on p.id=media.project_id where media.id::text=$1 and (p.owner_id=$2 or exists(select 1 from collab_members m where m.project_id=p.id and m.user_id=$2)) limit 1',[id,uid]); return r.rows[0]||null;
    },
    async deleteMedia(id,uid,pid) {
      pid ||= (await this.findMedia(id,uid))?.project_id;
      if (!pid) return null;
      return transaction(async client=>{
        const project=await lockWritableMediaProject(client,pid,uid,SHARE_ROLES,true);
        if (!project) return null;
        const media=(await client.query('select * from collab_media where project_id=$1 and id=$2 for update',[pid,id])).rows[0];
        if (!media || media.asset_id || !MEDIA_KINDS.includes(media.kind) || !validProjectObject(media.object_path,pid,[media.kind])
          || (media.user_id!==uid && project.owner_id!==uid)
          || (/^参考素材\s/.test(media.note||'') && media.user_id!==uid)
          || await protectedObject(client,project,media)) return null;
        return (await client.query('delete from collab_media where project_id=$1 and id=$2 returning *',[pid,id])).rows[0]||null;
      });
    },
    async deleteReferenceUpload(pid,id,uid) { return transaction(async client=>{
      const project=await lockWritableMediaProject(client,pid,uid,REFERENCE_ROLES,true);
      if(!project)return null;
      const media=(await client.query('select * from collab_media where project_id=$1 and id=$2 for update',[pid,id])).rows[0];
      if(!media||media.project_id!==pid||media.user_id!==uid||media.asset_id||!/^参考素材\s/.test(media.note||'')||!['image','audio','video'].includes(media.kind)||!validReferenceObject(media)||await protectedObject(client,project,media))return null;
      return (await client.query('delete from collab_media where project_id=$1 and id=$2 and user_id=$3 returning *',[pid,id,uid])).rows[0]||null;
    }); },
    ...extendRepository(pool),
    async close() { await pool.end(); },
  };
}
module.exports = { createRepository };
