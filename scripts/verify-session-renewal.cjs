// Run against a disposable or authorized PostgreSQL connection. All fixtures use
// temporary shadow tables and the transaction always rolls back; no user rows change.
const assert=require('node:assert/strict');
const {Pool}=require('../cloud-backend/node_modules/pg');
const {createRepository}=require('../cloud-backend/src/postgres-repository.cjs');
(async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
 try{
  await client.query('begin');
  await client.query('create temp table app_users as select * from public.app_users with no data');
  await client.query('create temp table app_sessions as select * from public.app_sessions with no data');
  await client.query("insert into app_users(id,username,banned) values ('00000000-0000-0000-0000-000000000167','session-fixture',false)");
  await client.query("insert into app_sessions(user_id,token_hash,expires_at) values ('00000000-0000-0000-0000-000000000167','fixture',now()+interval '1 day')");
  const repo=createRepository('',{pool:client});
  assert.equal((await repo.findBySession('fixture')).username,'session-fixture');
  const expiry=async()=>(await client.query('select expires_at from app_sessions')).rows[0]?.expires_at?.getTime();
  const renewed=await expiry();assert.ok(renewed>Date.now()+6*86400000);
  await repo.findBySession('fixture');assert.equal(await expiry(),renewed,'Do not write on every request');
  await client.query("update app_sessions set expires_at=now()-interval '1 second'");
  const expired=await expiry();assert.equal(await repo.findBySession('fixture'),null);assert.equal(await expiry(),expired);
  await client.query("update app_sessions set expires_at=now()+interval '1 day'");await client.query('update app_users set banned=true');
  const banned=await expiry();assert.equal((await repo.findBySession('fixture')).banned,true);assert.equal(await expiry(),banned);
  await client.query('delete from app_sessions');assert.equal(await repo.findBySession('fixture'),null);
  console.log('PASS: active renewal, throttling, expiration, ban and revocation');
 }finally{await client.query('rollback');client.release();await pool.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
