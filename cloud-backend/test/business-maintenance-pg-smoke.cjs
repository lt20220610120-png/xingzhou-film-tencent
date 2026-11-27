const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const {Pool}=require('pg');
const {createRepository}=require('../src/postgres-repository.cjs');

async function run(){
  assert.match(process.env.PG_CLUSTER_CONF_ROOT||'',/[\\/]pg_virtualenv\./);
  assert.notEqual(process.env.PGPORT,'5432');
  assert.match(process.env.PGDATABASE||'',/^xz212_/);
  const pool=new Pool({max:16});
  const repository=createRepository('',{pool});
  try{
    await pool.query(await readFile(path.join(__dirname,'../schema.sql'),'utf8'));
    const owner=(await pool.query("insert into app_users(username,email,password_hash) values('fixture','fixture@example.test','bypass-disabled') returning id")).rows[0].id;
    const project=(await pool.query("insert into collab_projects(name,owner_id,genre,script) values('fixture',$1,'[DIRECTOR_PROJECT]',repeat('长',40000)) returning id",[owner])).rows[0].id;
    const media=(await pool.query("insert into collab_media(project_id,kind) select $1,'video' from generate_series(1,20000) returning id",[project])).rows[0].id;
    await pool.query('analyze collab_media');
    const explain=async sql=>(await pool.query('explain (analyze,buffers,format json) '+sql,[media])).rows[0]['QUERY PLAN'][0];
    const old=(await explain('select * from collab_media where id::text||\'\'=$1')).Plan;
    const native=(await explain('select * from collab_media where id=$1')).Plan;
    const legacy=(await explain('select * from collab_media where id::text=$1')).Plan;
    assert.equal(old['Node Type'],'Seq Scan');
    assert.equal(native['Index Name'],'collab_media_pkey');
    assert.equal(legacy['Index Name'],'collab_media_id_text_idx');
    const requests=await Promise.all(Array.from({length:48},()=>repository.findMedia(media,owner)));
    assert.ok(requests.every(row=>row.id===media));
    assert.equal(await repository.findMedia(media,randomUUID()),null);

    const {LIVE_PROTOCOL,Y,decode64,encode64,editDocument,readDocument}=await import('../shared/directorSharedDocument.mjs');
    const sync=payload=>repository.syncDirectorLive(project,{protocol:LIVE_PROTOCOL,...payload},owner,'fixture');
    const baseline=await sync({});
    const doc=new Y.Doc();
    Y.applyUpdate(doc,decode64(baseline.update));
    const base=readDocument(doc);
    editDocument(doc,base,{...base,name:'updated fixture'},'local');
    const updateId=randomUUID(),update=encode64(Y.encodeStateAsUpdate(doc,decode64(baseline.vector)));
    const first=await sync({epoch:baseline.epoch,vector:baseline.vector,update,updateId});
    assert.equal(first.ack,updateId);
    await pool.query("update director_live_updates set created_at=now()-interval '31 days'");
    await pool.query("insert into app_sessions(user_id,token_hash,expires_at) values($1,'expiry-fixture',now()-interval '1 day'),($1,'valid-fixture',now()+interval '1 day')",[owner]);
    await pool.query("insert into email_codes(email,code_hash,expires_at) values('expired@example.test','fixture',now()-interval '1 day'),('valid@example.test','fixture',now()+interval '1 day')");
    assert.deepEqual(await repository.pruneExpiredBusinessRecords(),[1,1,1]);
    const receipt=(await pool.query('select update_id,octet_length(delta) as bytes from director_live_updates where update_id=$1',[updateId])).rows[0];
    assert.equal(receipt.bytes,0);
    assert.equal((await pool.query("select token_hash from app_sessions")).rows[0].token_hash,'valid-fixture');
    assert.equal((await pool.query("select email from email_codes")).rows[0].email,'valid@example.test');
    const fresh=createRepository('',{pool});
    const retry=await fresh.syncDirectorLive(project,{protocol:LIVE_PROTOCOL,epoch:baseline.epoch,update,updateId},owner,'fixture');
    assert.equal(retry.ack,updateId);
    assert.equal(retry.revision,first.revision);
    const recovered=new Y.Doc();
    Y.applyUpdate(recovered,decode64(retry.update));
    assert.equal(readDocument(recovered).name,'updated fixture');
    doc.destroy();recovered.destroy();
    console.log(JSON.stringify({mediaRows:20000,index:native['Index Name'],legacyIndex:legacy['Index Name'],
      originalSharedBlocks:old['Shared Hit Blocks'],indexedSharedBlocks:native['Shared Hit Blocks'],
      indexLookupConcurrent:requests.length,expiredSessions:1,expiredEmailCodes:1,reconnectDeduplicated:true}));
  }finally{await repository.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
