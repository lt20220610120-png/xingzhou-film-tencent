// Five invited members, real PostgreSQL, temporary tables and final rollback.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const source=path.resolve(process.argv[2]||path.join(__dirname,'../src'));
async function run(){
 const pid=execFileSync('systemctl',['show','xingzhou-cloud-backend','-p','MainPID','--value'],{encoding:'utf8'}).trim();
 const url=fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').find(v=>v.startsWith('DATABASE_URL='))?.slice(13);assert.ok(url);
 const {Pool}=require(path.join(source,'../node_modules/pg')),pool=new Pool({connectionString:url}),client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('create temporary table collab_projects(id uuid primary key,owner_id text,owner_name text,name text,genre text,script text,episodes jsonb,deleted_at timestamptz,updated_at timestamptz default now())');
  await client.query('create temporary table collab_members(project_id uuid,user_id text,role text)');
  await client.query(fs.readFileSync(path.join(__dirname,'../migrations/20261010-director-versions.sql'),'utf8').replace('create table if not exists director_project_versions','create temporary table director_project_versions'));
  const projectId='00000000-0000-4000-8000-000000000021';
  await client.query("insert into collab_projects values($1,'owner','制片','测试项目','[DIRECTOR_PROJECT]','原稿',$2,null,now())",[projectId,JSON.stringify([{id:'e',content:'原文',prompts:[]}])]);
  for(const uid of ['a','b','c','d'])await client.query("insert into collab_members values($1,$2,'collaborator')",[projectId,uid]);
  let seq=0;const wrapped={query:async(q,a)=>{if(/^begin$/i.test(q))return client.query(`savepoint version_${++seq}`);if(/^commit$/i.test(q))return client.query(`release savepoint version_${seq}`);if(/^rollback$/i.test(q))return client.query(`rollback to savepoint version_${seq}`);return client.query(q,a);},release(){}};
  const repo=require(path.join(source,'repository-extras.cjs')).extendRepository({query:(q,a)=>client.query(q,a),connect:async()=>wrapped}),handle=require(path.join(source,'collab.cjs')).handleAction;
  const doc=r=>({name:r.name,script:r.script,episodes:r.episodes}),current=async uid=>repo.getDirectorProject(projectId,uid),base=doc(await current('owner'));
  for(const uid of ['owner','a','b','c','d']){
   const submitted={projectId,submissionId:'five-member-'+uid,base,updates:{episodes:[{...base.episodes[0],prompts:[{id:'prompt-'+uid,text:'成员 '+uid}]}]}};
   assert.equal((await handle('director-version-publish',submitted,{id:uid,display_name:uid},repo)).status,200);
   assert.equal((await current(uid)).episodes[0].prompts.length,['owner','a','b','c','d'].indexOf(uid)+1);
  }
  let shared=await current('owner');assert.equal((await repo.listDirectorVersions(projectId,{},'b')).versions.filter(v=>v.status==='accepted').length,5);
  const conflictBase=doc(shared);
  const submit=(uid,script)=>handle('director-version-publish',{projectId,submissionId:'conflict-'+uid,base:conflictBase,updates:{script}},{id:uid,display_name:uid},repo);
  assert.equal((await submit('a','A 的稿')).status,200);const proposal=await submit('b','B 的稿');assert.equal(proposal.status,409);assert.ok(proposal.body.versionId);
  assert.equal((await current('c')).script,'A 的稿');assert.equal((await submit('b','B 的稿')).body.versionId,proposal.body.versionId);
  shared=await current('c');await repo.publishDirectorVersion(projectId,{submissionId:'independent-c',base:doc(shared),updates:{name:'C 新标题'}},'c','C');
  const args={projectId,versionId:proposal.body.versionId,mode:'resolve',currentDocument:doc(await current('owner'))};
  assert.equal((await handle('director-version-restore',args,{id:'b'},repo)).status,403);
  const chosen=await handle('director-version-restore',args,{id:'owner'},repo);assert.equal(chosen.status,200);assert.equal(chosen.body.script,'B 的稿');assert.equal(chosen.body.name,'C 新标题');assert.equal(chosen.body.episodes[0].prompts.length,5);
  assert.equal((await handle('director-version-restore',args,{id:'owner'},repo)).status,409);
  assert.equal(await repo.listDirectorVersions(projectId,{},'outsider'),null);
  const versions=await repo.listDirectorVersions(projectId,{},'owner');assert.ok(versions.versions.some(v=>v.status==='conflict'));assert.ok(versions.versions.some(v=>v.status==='restore'));
  const original=versions.versions.find(v=>v.status==='baseline');await repo.restoreDirectorVersion(projectId,{versionId:original.id,mode:'restore',currentDocument:doc(await current('owner'))},'owner','制片');
  await client.query("update collab_projects set genre='[DIRECTOR_PROJECT]\n[PROJECT_LOCKED]' where id=$1",[projectId]);assert.equal((await submit('d','锁定写入')).status,423);
  console.log('DIRECTOR_VERSIONS_PG_SMOKE_PASS: five members, snapshots, same-place proposals survive 409, idempotent retry, owner-only adoption, independent-edit preservation, restore CAS, history recovery, permission and lock checks; temporary data rolled back.');
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}
}
run().catch(e=>{console.error('DIRECTOR_VERSIONS_PG_SMOKE_FAILED:',e.message);process.exitCode=1;});
