const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {createRequire} = require('node:module');

const backend = path.resolve(process.argv[2] || path.join(__dirname,'../cloud-backend'));
const fromBackend = createRequire(path.join(backend,'src','postgres-repository.cjs'));
const tables = ['collab_projects','collab_members','collab_tasks','collab_assets'];
async function openDatabase() {
  if (process.env.PGLITE_MODULE) {
    const {PGlite}=require(process.env.PGLITE_MODULE);
    const db=new PGlite();
    const schema=fs.readFileSync(path.join(backend,'schema.sql'),'utf8');
    for(const name of tables) {
      const table=schema.match(new RegExp('create table if not exists '+name+' \\([\\s\\S]+?\\n\\);','i'));
      assert.ok(table,name); await db.exec(table[0]);
    }
    await db.exec("alter table collab_projects add column analysis_progress jsonb not null default '{}'");
    return {query:(q,args)=>db.query(q,args),close:()=>db.close()};
  }
  const {Client}=fromBackend('pg');
  const pg=new Client({connectionString:process.env.DATABASE_URL});
  await pg.connect();
  return {query:(q,args)=>pg.query(q,args),close:()=>pg.end()};
}

async function run() {
  const db=await openDatabase();
  try {
    await db.query('BEGIN');
    await db.query("set local statement_timeout='20s'");
    // Only these TEMP relations are resolvable through unqualified application SQL.
    await db.query('set local search_path=pg_temp,pg_catalog');
    for(const table of tables) {
      await db.query('create temporary table '+table+' (like public.'+table+' including defaults including constraints including indexes) on commit drop');
      const found=await db.query('select c.relpersistence as kind from pg_class c where c.oid=to_regclass($1)',[table]);
      assert.equal(found.rows[0].kind,'t');
    }
    let bindingWrites=0;
    async function query(sql,args) {
      if(/^begin$/i.test(sql)) return db.query('SAVEPOINT repo_action');
      if(/^commit$/i.test(sql)) return db.query('RELEASE SAVEPOINT repo_action');
      if(/^rollback$/i.test(sql)) {
        await db.query('ROLLBACK TO SAVEPOINT repo_action');
        return db.query('RELEASE SAVEPOINT repo_action');
      }
      if(sql.startsWith('update collab_projects set analysis_progress')) bindingWrites++;
      return db.query(sql,args);
    }
    const repo=fromBackend('./postgres-repository.cjs').createRepository('',{pool:{query,connect:async()=>({query,release(){}})}});
    const handle=fromBackend('./collab.cjs').handleAction;
    const owner=randomUUID(), guest=randomUUID(), outsider=randomUUID(), project=randomUUID(), other=randomUUID();
    for(const id of [project,other]) await db.query('insert into collab_projects(id,owner_id,name,genre) values($1,$2,$3,$4)',[id,owner,'smoke','[COLLAB_PROJECT]']);
    const member=(await db.query('insert into collab_members(project_id,user_id,username,role) values($1,$2,$3,$4) returning id',[project,guest,'guest','artist'])).rows[0].id;
    const invoke=(action,payload={},uid=owner,pid=project)=>handle(action,{projectId:pid,...payload},{id:uid},repo);
    const assigned=await invoke('task-assign',{episode:2,title:'smoke',memberUserId:guest,memberName:'Guest'});
    assert.equal(assigned.status,200); assert.equal(assigned.body.assignee_id,guest);assert.equal(assigned.body.assignee_name,'Guest');
    const taskId=assigned.body.id;
    const update=(status,uid,pid)=>invoke('task-update',{taskId,updates:{status}},uid,pid);
    const done=await update('已完成'); assert.equal(done.status,200);assert.equal(done.body.id,taskId);assert.ok(done.body.done_at);
    const repeated=await update('已完成'); assert.equal(String(repeated.body.done_at),String(done.body.done_at));
    assert.equal((await update('进行中',guest)).status,403);assert.equal((await update('进行中',owner,other)).status,403);
    const reopened=await update('进行中');assert.equal(reopened.body.done_at,null);
    assert.equal((await db.query('select count(*)::int as count from collab_tasks')).rows[0].count,1);
    const asset={name:'smoke',category:'prop',episodes:[1],firstEpisode:1};
    assert.equal((await invoke('asset-create',asset,guest)).status,200);
    assert.equal((await invoke('asset-create',asset,outsider)).status,403);
    assert.equal((await invoke('member-role',{memberId:member,role:'collaborator'})).body.role,'collaborator');
    assert.equal((await invoke('asset-create',{...asset,name:'forbidden'},guest)).status,403);
    assert.equal((await invoke('member-role',{userId:guest,role:'artist_collaborator'})).body.role,'artist_collaborator');
    const payload={baseRevision:0,writeId:'smoke',ackOnly:true,data:{snapshot:{projectId:project,cards:[],entries:[]},decisions:{}}};
    for(let i=0;i<2;i++) {const result=await invoke('prompt-binding-save',payload);assert.equal(result.status,200);assert.equal(result.body.revision,1);}
    assert.equal(bindingWrites,1);
    assert.equal((await invoke('member-remove',{memberId:member})).status,200);
    assert.equal((await invoke('asset-create',asset,guest)).status,403);
    const cos=fromBackend('./cos.cjs');
    for(const ext of ['m4a','aac','ogg','flac']) assert(cos.buildObjectKey({projectId:project,kind:'audio',filename:'voice.'+ext}).endsWith('.'+ext));
    console.log('PASS: TEMP schema, task assignment/completion/reopening, owner and project boundaries, member IDs and roles, asset permissions, binding replay, COS audio extensions');
  } finally {
    try { await db.query('ROLLBACK'); } finally { await db.close(); }
  }
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
