// Run on the server: uses a temporary schema, never existing account rows.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Client}=require('/opt/xingzhou-cloud-backend/node_modules/pg');
const {extendWinAIRepository}=require('../../cloud-backend/src/win-ai-repository.cjs');
(async()=>{
 const line=fs.readFileSync('/opt/xingzhou-cloud-backend/.env','utf8').split('\n').find(s=>s.startsWith('DATABASE_URL='));
 const db=new Client({connectionString:line.slice(13).trim().replace(/^['"]|['"]$/g,'')});await db.connect();
 const schema='winai_test_'+crypto.randomBytes(8).toString('hex');
 try{await db.query('create schema '+schema);await db.query('set search_path to '+schema);
  await db.query('create table app_users(id uuid primary key,username text,display_name text,banned boolean default false); create table app_sessions(id uuid primary key,user_id uuid references app_users(id) on delete cascade,token_hash text,expires_at timestamptz)');
  const sql=fs.readFileSync(require('node:path').join(__dirname,'../../cloud-backend/migrations/20261018_win_ai_identity.sql'),'utf8');await db.query(sql);await db.query(sql);
  const user=crypto.randomUUID(),session=crypto.randomUUID();await db.query("insert into app_users values($1,'test','test',false)",[user]);await db.query("insert into app_sessions values($1,$2,'source-hash',now()+interval '1 hour')",[session,user]);
  const r=extendWinAIRepository(db),hash='a'.repeat(64);
  assert(await r.winAIGrant({hash,kind:'entry',challenge:'proof',expires:Date.now()+60000,sessionHash:'source-hash'}));
  assert.equal(await r.winAIGetGrant('entry',hash,'wrong',true),null);
  const results=await Promise.all([r.winAIGetGrant('entry',hash,'proof',true),r.winAIGetGrant('entry',hash,'proof',true)]);assert.equal(results.filter(Boolean).length,1);
  assert(await r.winAILink('native-session',{id:user,session_id:session}));assert(await r.winAILinkValid('native-session',user));
  assert.equal(await r.winAISourceForNative(123,user),user);assert.equal(await r.winAISourceForNative(123,crypto.randomUUID()),user);
  await db.query('delete from app_sessions where id=$1',[session]);assert.equal(await r.winAILinkValid('native-session',user),false);assert.equal((await db.query('select * from win_ai_auth_grants')).rowCount,0);
  await db.query('delete from app_users where id=$1',[user]);assert.equal(await r.winAIUserActive(user),false);assert.equal(await r.winAISourceForNative(123,null),user);
  console.log('PASS: real PostgreSQL isolated-schema migration replay, proof, single-use, session cascade and permanent identity binding');
 }finally{await db.query('drop schema if exists '+schema+' cascade');await db.end();}
})().catch(()=>{console.error('PostgreSQL identity verification failed');process.exitCode=1;});
