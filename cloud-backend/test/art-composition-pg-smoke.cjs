// Temporary tables and a final transaction rollback; no real project writes.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');const{execFileSync}=require('node:child_process');
const source=path.resolve(process.argv[2]||path.join(__dirname,'../src'));const{createRepository}=require(path.join(source,'postgres-repository.cjs'));const{handleAction}=require(path.join(source,'collab.cjs'));
async function run(){
 let url=process.env.DATABASE_URL;if(!url){const pid=execFileSync('systemctl',['show','xingzhou-cloud-backend','-p','MainPID','--value'],{encoding:'utf8'}).trim();url=fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').find(v=>v.startsWith('DATABASE_URL='))?.slice(13);}assert.ok(url,'Database configuration unavailable');
 const{Pool}=require(path.join(source,'../node_modules/pg'));const pool=new Pool({connectionString:url}),client=await pool.connect();
 try{await client.query('BEGIN');await client.query("create temporary table collab_projects(id uuid primary key,owner_id text,genre text,script text,deleted_at timestamptz,updated_at timestamptz default now())");
  await client.query("create temporary table collab_members(project_id uuid,user_id text,role text,created_at timestamptz default now())");
  const migration=fs.readFileSync(path.join(__dirname,'../migrations/20261009-image-composition.sql'),'utf8');await client.query(migration);await client.query(migration);
  let seq=0;const wrapped={query:async(sql,args)=>{if(/^begin$/i.test(sql))return client.query(`savepoint art_image_${++seq}`);if(/^commit$/i.test(sql))return client.query(`release savepoint art_image_${seq}`);if(/^rollback$/i.test(sql))return client.query(`rollback to savepoint art_image_${seq}`);return client.query(sql,args);},release(){}};
  const repo=createRepository('unused',{pool:{query:(sql,args)=>client.query(sql,args),connect:async()=>wrapped}}),id='00000000-0000-4000-8000-000000000015';
  await client.query("insert into collab_projects(id,owner_id,genre,script) values($1,'owner','[COLLAB_PROJECT]','preserved screenplay')",[id]);
  await client.query("insert into collab_members(project_id,user_id,role) values($1,'artist','artist'),($1,'invited','collaborator')",[id]);
  assert.equal((await repo.getProject(id,'artist')).image_composition,'portrait-four');
  const change=uid=>handleAction('project-update',{projectId:id,scope:'art-image-settings',updates:{image_composition:'portrait-five',script:'forged'}},{id:uid},repo);
  assert.equal((await change('invited')).status,403);assert.equal((await change('artist')).status,200);
  let saved=await repo.getProject(id,'invited');assert.equal(saved.image_composition,'portrait-five');assert.equal(saved.script,'preserved screenplay');
  await assert.rejects(repo.updateProjectFields(id,{image_composition:'invalid'},'owner','art-image-settings'),e=>e.status===400);
  await client.query("update collab_projects set genre='[COLLAB_PROJECT]\n[PROJECT_LOCKED]' where id=$1",[id]);assert.equal((await change('artist')).status,423);
  await client.query("update collab_projects set genre='[COLLAB_PROJECT]',deleted_at=now() where id=$1",[id]);assert.equal((await change('artist')).status,410);
  console.log('ART_COMPOSITION_PG_SMOKE_PASS: idempotent migration, four-grid legacy default, cloud round trip, art-editor scope, whitelist, locks and recycle protection; temporary tables rolled back.');
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}
}run().catch(e=>{console.error('ART_COMPOSITION_PG_SMOKE_FAILED:',e.message);process.exitCode=1;});
