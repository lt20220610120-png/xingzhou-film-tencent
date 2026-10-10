const {threeWayMerge}=require('./three-way-merge.cjs');
const {directorRow}=require('./director-source.cjs');
const {isDeepStrictEqual}=require('node:util');
const doc=row=>({name:row.name,script:row.script||'',episodes:row.episodes||[]});
const mergeDoc=value=>({...value,episodes:(value.episodes||[]).map(ep=>{const next={...ep};if(!next.deletedPromptIds?.length)delete next.deletedPromptIds;return next;})});
const error=(status,message)=>Object.assign(new Error(message),{status});
function directorVersionRepository(pool,{onPublish}={}){
 const readable=async(query,pid,uid,lock=false)=>{
  const row=(await query(`select p.* from collab_projects p where p.id=$1${lock?' for update':''}`,[pid])).rows[0];
  if(!uid||!directorRow(row))return null;
  if(String(row.owner_id)===String(uid))return row;
  return (await query('select 1 as ok from collab_members where project_id=$1 and user_id=$2 limit 1',[pid,uid])).rows[0]?row:null;
 };
 const snapshot=async(client,row,uid,name,submission,status,document,base=null,source=null,published=null)=>{
  return (await client.query('insert into director_project_versions(project_id,author_id,author_name,submission_id,status,document,base_document,source_version_id,published_document) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',[row.id,String(uid),name||'',submission,status,JSON.stringify(document),base?JSON.stringify(base):null,source,published?JSON.stringify(published):null])).rows[0];
 };
 const withTransaction=async work=>{const client=await pool.connect();try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}};
 const seed=async(client,row)=>{
  if(!(await client.query('select id from director_project_versions where project_id=$1 limit 1',[row.id])).rows.length)await snapshot(client,row,row.owner_id,row.owner_name,'baseline','baseline',doc(row));
 };
 return {
  async listDirectorVersions(pid,p,uid){
   if(!await readable(pool.query.bind(pool),pid,uid))return null;
   const before=p.before?String(p.before):'9223372036854775807';if(!/^\d{1,19}$/.test(before))throw error(400,'无效版本分页');
   const rows=(await pool.query('select id,sequence,author_id,author_name,status,source_version_id,created_at from director_project_versions where project_id=$1 and sequence<$2::bigint order by sequence desc limit 31',[pid,before])).rows;
   return {versions:rows.slice(0,30),nextBefore:rows.length>30?String(rows[29].sequence):null};
  },
  async getDirectorVersion(pid,versionId,uid){
   if(!await readable(pool.query.bind(pool),pid,uid))return null;
   return (await pool.query('select * from director_project_versions where project_id=$1 and id=$2',[pid,versionId])).rows[0]||null;
  },
  async publishDirectorVersion(pid,p,uid,name){return withTransaction(async client=>{
   const row=await readable(client.query.bind(client),pid,uid,true);if(!row)return null;
   if(String(row.genre||'').includes('[PROJECT_LOCKED]'))throw error(423,'项目已锁定，本地版本已保留');
   if(typeof p.submissionId!=='string'||!/^[-\w]{8,100}$/.test(p.submissionId)||!p.base||!p.updates)throw error(400,'上传需要版本编号、同步基准和本地文档');
   const previous=(await client.query('select status,id from director_project_versions where project_id=$1 and author_id=$2 and submission_id=$3',[pid,String(uid),p.submissionId])).rows[0];
   if(previous)return previous.status==='conflict'?{versionConflict:true,versionId:previous.id,error:'同处修改发生冲突，您的版本已上传保留，请由制片在协作版本中选择'}:row;
   await seed(client,row);
   const local={...p.base,...Object.fromEntries(Object.entries(p.updates).filter(([key])=>['name','script','episodes'].includes(key)))};
   if(typeof local.name!=='string'||typeof local.script!=='string'||!Array.isArray(local.episodes)||typeof p.base.name!=='string'||typeof p.base.script!=='string'||!Array.isArray(p.base.episodes))throw error(400,'项目文档格式不正确');
   let merged;
   try{if(p.conflictOnly)throw Error('待制片采用');merged=threeWayMerge(mergeDoc(p.base),mergeDoc(local),mergeDoc(doc(row)));}catch(e){
    const version=await snapshot(client,row,uid,name,p.submissionId,'conflict',local,p.base);
    return {versionConflict:true,versionId:version.id,error:'同处修改发生冲突，您的完整版本已上传保留，共享项目未被覆盖；请由制片在协作版本中选择'};
   }
   await snapshot(client,row,uid,name,p.submissionId,'accepted',local,p.base,null,merged);
   await onPublish?.(client,row,merged,uid,name);
   return (await client.query('update collab_projects set name=$2,script=$3,episodes=$4,updated_at=clock_timestamp() where id=$1 returning *',[pid,merged.name,merged.script,JSON.stringify(merged.episodes)])).rows[0];
  });},
  async restoreDirectorVersion(pid,p,uid,name){return withTransaction(async client=>{
   const row=await readable(client.query.bind(client),pid,uid,true);if(!row||String(row.owner_id)!==String(uid))return null;
   if(String(row.genre||'').includes('[PROJECT_LOCKED]'))throw error(423,'项目已锁定，请先解锁');
   if(!p.currentDocument||!isDeepStrictEqual(p.currentDocument,doc(row)))throw error(409,'共享项目已变化，请刷新版本面板后再选择');
   const version=(await client.query('select * from director_project_versions where project_id=$1 and id=$2',[pid,p.versionId])).rows[0];if(!version)return null;
   if(!['resolve','restore'].includes(p.mode))throw error(400,'请选择冲突采用或历史恢复');
   await seed(client,row);
   const merged=p.mode==='resolve'&&version.base_document?threeWayMerge(mergeDoc(version.base_document),mergeDoc(version.document),mergeDoc(doc(row)),'文档','local'):(version.published_document||version.document);
   await snapshot(client,row,uid,name,'before-'+require('node:crypto').randomUUID(),'baseline',doc(row));
   await snapshot(client,row,uid,name,require('node:crypto').randomUUID(),'restore',merged,doc(row),version.id);
   await onPublish?.(client,row,merged,uid,name);
   return (await client.query('update collab_projects set name=$2,script=$3,episodes=$4,updated_at=clock_timestamp() where id=$1 returning *',[pid,merged.name,merged.script,JSON.stringify(merged.episodes)])).rows[0];
  });},
 };
}
module.exports={directorVersionRepository};
