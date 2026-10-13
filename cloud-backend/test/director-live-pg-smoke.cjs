const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const source=path.resolve(process.argv[2]||path.join(__dirname,'../src'));
async function run(){
 const pid=execFileSync('systemctl',['show','xingzhou-cloud-backend','-p','MainPID','--value'],{encoding:'utf8'}).trim();
 const url=fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').find(v=>v.startsWith('DATABASE_URL='))?.slice(13);assert.ok(url);
 const {Pool}=require(path.join(source,'../node_modules/pg')),pool=new Pool({connectionString:url}),client=await pool.connect();
 const {Y,editDocument,readDocument,decode64,encode64,documentEpoch,seedDocument}=await import(require('node:url').pathToFileURL(path.join(source,'../shared/directorSharedDocument.mjs')));
 try{
  await client.query('BEGIN');
  await client.query('create temporary table collab_projects(id uuid primary key,owner_id text,owner_name text,name text,genre text,style text,script text,episodes jsonb,deleted_at timestamptz,updated_at timestamptz default now())');
  await client.query('create temporary table collab_members(project_id uuid,user_id text,role text)');
  for(const file of ['20261010-director-versions.sql','009-director-live.sql'])await client.query(fs.readFileSync(path.join(__dirname,'../migrations',file),'utf8').replace(/create table if not exists/gi,'create temporary table'));
  const id='00000000-0000-4000-8000-000000000022';await client.query("insert into collab_projects(id,owner_id,owner_name,name,genre,style,script,episodes) values($1,'owner','制片','项目','[DIRECTOR_PROJECT]','真人电影级','初始正文',$2)",[id,JSON.stringify([{id:'e',content:'场景正文',prompts:[]}])]);
  for(const uid of ['a','b','c','d'])await client.query("insert into collab_members values($1,$2,'collaborator')",[id,uid]);
  let seq=0;const wrapped={query:(q,a)=>{if(/^begin$/i.test(q))return client.query(`savepoint live_${++seq}`);if(/^commit$/i.test(q))return client.query(`release savepoint live_${seq}`);if(/^rollback$/i.test(q))return client.query(`rollback to savepoint live_${seq}`);return client.query(q,a);},release(){}};
  const repo=require(path.join(source,'repository-extras.cjs')).extendRepository({query:(q,a)=>client.query(q,a),connect:async()=>wrapped});
  const sync=(p,uid='owner',name=uid)=>repo.syncDirectorLive(id,{protocol:3,...p},uid,name);
  const users=['owner','a','b','c','d'],docs=[];
  for(const uid of users){const result=await sync({},uid),d=new Y.Doc();Y.applyUpdate(d,decode64(result.update));assert.equal(readDocument(d).script,'初始正文');docs.push(d);}
  for(const [i,d] of docs.entries()){const base=readDocument(d),vector=Y.encodeStateVector(d);editDocument(d,base,{...base,script:base.script+'成员'+i,episodes:[{...base.episodes[0],quickSceneEdits:{'1-1':'场景成员'+i},prompts:[{id:'p'+i,text:'提示词'+i}]}]});
   const p={epoch:documentEpoch(d),update:encode64(Y.encodeStateAsUpdate(d,vector)),updateId:crypto.randomUUID()};await sync(p,users[i]);await sync(p,users[i]);
  }
  const result=await sync({});let merged=new Y.Doc();Y.applyUpdate(merged,decode64(result.update));const document=readDocument(merged);assert.equal(document.episodes[0].prompts.length,5);for(let i=0;i<5;i++){assert.ok(document.script.includes('成员'+i));assert.ok(document.episodes[0].quickSceneEdits['1-1'].includes('场景成员'+i));}
  await assert.rejects(repo.syncDirectorLive(id,{},'owner',''),e=>e.status===426);
  const detached=seedDocument(document);await assert.rejects(sync({epoch:documentEpoch(merged),update:encode64(Y.encodeStateAsUpdate(detached)),updateId:crypto.randomUUID()}),e=>e.status===409);
  assert.equal(Number((await client.query('select count(*) as n from director_live_updates')).rows[0].n),5);
  assert.equal((await client.query('select script from collab_projects')).rows[0].script,document.script);
  await assert.rejects(sync({},'outsider'),e=>e.status===403);
  await client.query("update collab_projects set genre='[DIRECTOR_PROJECT]\n[PROJECT_LOCKED]' where id=$1",[id]);assert.equal((await sync({},'a')).locked,true);await assert.rejects(sync({epoch:documentEpoch(merged),update:result.update,updateId:crypto.randomUUID()},'a'),e=>e.status===423);
  await client.query("update collab_projects set genre='[DIRECTOR_PROJECT]' where id=$1",[id]);await sync({epoch:documentEpoch(merged),checkpoint:true});
  const versions=(await repo.listDirectorVersions(id,{},'owner')).versions,baseline=versions.find(v=>v.status==='baseline'),row=(await client.query('select * from collab_projects')).rows[0];
  await repo.restoreDirectorVersion(id,{versionId:baseline.id,mode:'restore',currentDocument:{name:row.name,script:row.script,episodes:row.episodes}},'owner','制片');
  const staleEpoch=documentEpoch(merged),restored=await sync({epoch:staleEpoch,vector:encode64(Y.encodeStateVector(merged)),update:result.update,updateId:crypto.randomUUID()},'b');assert.equal(restored.reset,true);assert.equal(restored.ack,null);merged.destroy();merged=new Y.Doc();Y.applyUpdate(merged,decode64(restored.update));assert.equal(readDocument(merged).script,'初始正文');assert.notEqual(documentEpoch(merged),staleEpoch);
  // Reproduce a legacy detached initialization on temporary rows only.
  function legacySeed(value){const d=new Y.Doc(),fields=d.getMap('fields');function walk(v,p){const k=JSON.stringify(p);if(Array.isArray(v)&&v.every(x=>x&&x.id)){fields.set(JSON.stringify([...p,'@kind']),'records');v.forEach((x,i)=>{fields.set(JSON.stringify([...p,'@rank',x.id]),i);walk(x,[...p,'@item',x.id]);});}else if(v&&typeof v==='object'){fields.set(JSON.stringify([...p,'@kind']),'object');for(const[k,x]of Object.entries(v))walk(x,[...p,k]);}else if(typeof v==='string'){fields.set(k,{text:true});d.getText('text:'+k).insert(0,v);}else fields.set(k,v);}d.transact(()=>walk(value,[]));return d;}
  const healthy=readDocument(merged),legacy=legacySeed(healthy);Y.applyUpdate(legacy,Y.encodeStateAsUpdate(legacySeed(healthy)));const broken=readDocument(legacy);
  await client.query('update collab_projects set name=$2,script=$3,episodes=$4 where id=$1',[id,broken.name,broken.script,JSON.stringify(broken.episodes)]);await client.query('update director_live_documents set state=$2,revision=revision+1 where project_id=$1',[id,Buffer.from(Y.encodeStateAsUpdate(legacy))]);
  const beforeCount=Number((await client.query('select count(*) as n from director_project_versions')).rows[0].n),preview=await sync({repair:'preview'});assert.equal(preview.repairRequired,true);assert.equal(preview.document.name,healthy.name);assert.equal(preview.summary.conflicts.length,0);
  assert.equal((await client.query('select name from collab_projects')).rows[0].name,broken.name);assert.equal(Number((await client.query('select count(*) as n from director_project_versions')).rows[0].n),beforeCount);
  await assert.rejects(sync({repair:'preview'},'a'),e=>e.status===403);await assert.rejects(sync({repair:'apply',expectedRevision:'stale',fingerprint:preview.summary.fingerprint}),e=>e.status===409);
  const applied=await sync({repair:'apply',expectedRevision:preview.summary.revision,fingerprint:preview.summary.fingerprint});assert.equal(applied.reset,true);assert.equal((await client.query('select name from collab_projects')).rows[0].name,healthy.name);assert.equal(Number((await client.query('select count(*) as n from director_project_versions')).rows[0].n),beforeCount+2);
  await client.query("delete from collab_members where user_id='b'");await assert.rejects(sync({vector:result.vector},'b'),e=>e.status===403);
  await client.query("update collab_projects set genre='[DIRECTOR_PROJECT]\n[RECYCLE_UNTIL:2099-01-01T00:00:00Z]' where id=$1",[id]);await assert.rejects(sync({}),e=>e.status===403);
  console.log('DIRECTOR_LIVE_PG_SMOKE_PASS: 5 members; metadata and creative convergence; receipt idempotency; detached seeds and old clients refused; epoch reset; owner-only repair preview/adopt with stale-preview rejection and two preserved history versions; permissions/locks/recycle. Temporary rows rolled back.');
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}
}
run().catch(e=>{console.error('DIRECTOR_LIVE_PG_SMOKE_FAILED:',e.message);process.exitCode=1;});
