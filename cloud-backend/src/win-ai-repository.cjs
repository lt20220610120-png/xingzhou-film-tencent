function extendWinAIRepository(pool){
 const valid='join app_users u on u.id=g.user_id join app_sessions s on s.id=g.session_id and s.user_id=u.id where u.banned=false and s.expires_at>now()';
 const fields='u.id,u.username,u.display_name,g.session_id,g.kind,g.challenge';
 return {
  async winAISourceForNative(nativeId,observedSource){if(observedSource)await pool.query('insert into win_ai_user_links(native_user_id,source_user_id) values($1,$2) on conflict(native_user_id) do nothing',[nativeId,observedSource]);const r=await pool.query('select source_user_id from win_ai_user_links where native_user_id=$1',[nativeId]);return r.rows[0]?.source_user_id||null;},
  async winAIGrant(g){await pool.query('delete from win_ai_auth_grants where expires_at<now()');const r=await pool.query(`insert into win_ai_auth_grants(token_hash,kind,user_id,session_id,challenge,expires_at) select $1,$2,u.id,s.id,$3,to_timestamp($4/1000.0) from app_users u join app_sessions s on s.user_id=u.id where s.token_hash=$5 and s.expires_at>now() and not u.banned returning user_id as id,session_id`,[g.hash,g.kind,g.challenge||'',g.expires,g.sessionHash]);return r.rows[0]||null;},
  async winAIGetGrant(kind,hash,challenge,consume=false){
   const parameters=[kind,hash,challenge??null];
   const selector=`select ${fields},g.token_hash from win_ai_auth_grants g ${valid} and g.kind=$1 and g.token_hash=$2 and g.expires_at>now() and ($3::text is null or g.challenge=$3)`;
   const r=consume?await pool.query(`delete from win_ai_auth_grants where token_hash in (select token_hash from (${selector}) q) returning user_id as id,session_id,kind,challenge`,parameters):await pool.query(selector,parameters);
   return r.rows[0]||null;
  },
  async winAIStoreGrant(g,source){const r=await pool.query(`insert into win_ai_auth_grants(token_hash,kind,user_id,session_id,challenge,expires_at) select $1,$2,u.id,s.id,$3,to_timestamp($4/1000.0) from app_users u join app_sessions s on s.user_id=u.id where u.id=$5 and s.id=$6 and s.expires_at>now() and not u.banned returning user_id as id,session_id`,[g.hash,g.kind,g.challenge||'',g.expires,source.id,source.session_id]);return r.rows[0]||null;},
  async winAIUserActive(id){const r=await pool.query('select 1 from app_users where id=$1 and not banned',[id]);return r.rowCount===1;},
  async winAILink(sid,source){const r=await pool.query(`insert into win_ai_session_links(native_sid,user_id,session_id) select $1,u.id,s.id from app_users u join app_sessions s on s.user_id=u.id where u.id=$2 and s.id=$3 and not u.banned and s.expires_at>now() on conflict(native_sid) do nothing returning native_sid`,[sid,source.id,source.session_id]);return r.rowCount===1;},
  async winAILinkValid(sid,id){const r=await pool.query(`select 1 from win_ai_session_links l join app_users u on u.id=l.user_id join app_sessions s on s.id=l.session_id and s.user_id=u.id where l.native_sid=$1 and l.user_id=$2 and not u.banned and s.expires_at>now()`,[sid,id]);return r.rowCount===1;},
 };
}
module.exports={extendWinAIRepository};
