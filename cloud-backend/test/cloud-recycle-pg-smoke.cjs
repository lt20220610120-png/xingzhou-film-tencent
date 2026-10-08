// Temporary tables in a rolled-back transaction; never reads or mutates real projects.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const source=path.resolve(process.argv[2]||path.join(__dirname,'../src'));
const {createRepository}=require(path.join(source,'postgres-repository.cjs'));
const {handleAction}=require(path.join(source,'collab.cjs'));
async function run(){
 let url=process.env.DATABASE_URL;
 if(!url){const pid=execFileSync('systemctl',['show','xingzhou-cloud-backend','-p','MainPID','--value'],{encoding:'utf8'}).trim();url=fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').find(v=>v.startsWith('DATABASE_URL='))?.slice(13);}
 assert.ok(url,'Database configuration unavailable');
 const {Pool}=require(path.join(source,'../node_modules/pg'));const pool=new Pool({connectionString:url}),client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('create temporary table collab_projects(id uuid primary key,owner_id text,name text,genre text,analysis_output text,director_project_id text,script text,episodes jsonb,deleted_at timestamptz,purge_after timestamptz,updated_at timestamptz default now())');
  await client.query('create temporary table collab_members(project_id uuid,user_id text,role text,created_at timestamptz default now())');
  let seq=0;const wrapped={query:async(sql,args)=>{if(/^begin$/i.test(sql))return client.query(`savepoint recycle_smoke_${++seq}`);if(/^commit$/i.test(sql))return client.query(`release savepoint recycle_smoke_${seq}`);if(/^rollback$/i.test(sql))return client.query(`rollback to savepoint recycle_smoke_${seq}`);return client.query(sql,args);},release(){}};
  const repo=createRepository('unused',{pool:{query:(sql,args)=>client.query(sql,args),connect:async()=>wrapped}});
  const dir='00000000-0000-4000-8000-000000000001',copy='00000000-0000-4000-8000-000000000002';
  await client.query("insert into collab_projects(id,owner_id,name,genre,analysis_output,script,episodes) values ($1,'owner','synthetic source','[DIRECTOR_PROJECT]','local-original','preserved original','[]')",[dir]);
  await client.query("insert into collab_projects(id,owner_id,name,genre,director_project_id) values ($1,'owner','synthetic collaboration','[COLLAB_PROJECT]',$2)",[copy,'cloud-'+dir]);
  await client.query("insert into collab_members(project_id,user_id,role) values ($1,'invited','collaborator')",[copy]);
  assert.equal(await repo.softDeleteProject(copy,'invited'),null);
  assert.ok(await repo.softDeleteProject(copy,'owner'));
  await assert.rejects(repo.deleteDirectorProject(dir,'owner'),e=>e.status===409);
  assert.equal((await handleAction('project-restore',{projectId:copy},{id:'invited',is_producer:true},repo)).status,403);
  assert.ok(await repo.restoreProject(copy,'owner'));
  const restored=(await client.query('select deleted_at,purge_after,genre from collab_projects where id=$1',[copy])).rows[0];
  assert.equal(restored.deleted_at,null);assert.equal(restored.purge_after,null);assert.ok(!restored.genre.includes('[RECYCLE_UNTIL:'));
  await assert.rejects(repo.deleteDirectorProject(dir,'owner'),e=>e.status===409);
  await repo.softDeleteProject(copy,'owner');
  await client.query("update collab_projects set genre='[COLLAB_PROJECT]\n[RECYCLE_UNTIL:2000-01-01]',purge_after='2000-01-01' where id=$1",[copy]);
  assert.equal((await handleAction('project-restore',{projectId:copy},{id:'owner'},repo)).status,410);
  assert.equal((await repo.directorAssociationStates([{projectId:'local-original',collaborationProjectId:copy}]))[0].status,'protected');
  assert.equal(await repo.deleteDirectorProject(dir,'invited'),null);
  assert.ok(await repo.deleteDirectorProject(dir,'owner'));
  assert.equal((await repo.directorAssociationStates([{projectId:'local-original',collaborationProjectId:copy}]))[0].status,'released');
  console.log('CLOUD_RECYCLE_PG_SMOKE_PASS: 3-day protection, owner-only restore/delete, expiry and stale-link release; temporary tables rolled back.');
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}
}
run().catch(error=>{console.error('CLOUD_RECYCLE_PG_SMOKE_FAILED:',error.message);process.exitCode=1;});
