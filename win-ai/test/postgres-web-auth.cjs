// Real transactions in an isolated schema; never touches existing accounts.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Pool}=require('/opt/xingzhou-cloud-backend/node_modules/pg');
const {extendWinAIRepository}=require('../../cloud-backend/src/win-ai-repository.cjs');
(async()=>{
 const line=fs.readFileSync('/opt/xingzhou-cloud-backend/.env','utf8').split('\n').find(s=>s.startsWith('DATABASE_URL='));
 const url=line.slice(13).trim().replace(/^['"]|['"]$/g,''),schema='winai_web_test_'+crypto.randomBytes(8).toString('hex');
 const admin=new Pool({connectionString:url});await admin.query('create schema '+schema);
 const pool=new Pool({connectionString:url,options:'-c search_path='+schema});
 try{
  await pool.query("create table app_users(id uuid primary key default gen_random_uuid(),username text unique,email text unique,display_name text,password_hash text,roles text[],active_role text,is_admin boolean,is_producer boolean);create table email_codes(email text primary key,code_hash text,expires_at timestamptz)");
  const r=extendWinAIRepository(pool),input={username:'testuser',email:'test@example.invalid',passwordHash:'test-hash',emailCodeHash:'code-hash'};
  await pool.query("insert into email_codes values($1,$2,now()+interval '1 hour')",[input.email,input.emailCodeHash]);
  const results=await Promise.allSettled([r.winAIRegister(input),r.winAIRegister(input)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const user=(await pool.query('select * from app_users')).rows[0];assert.deepEqual(user.roles,[]);assert.equal(user.active_role,null);assert.equal(user.is_admin,false);assert.equal(user.is_producer,false);assert.equal((await pool.query('select * from email_codes')).rowCount,0);
  await pool.query("insert into email_codes values($1,$2,now()+interval '1 hour')",['second@example.invalid','code-hash']);
  await assert.rejects(()=>r.winAIRegister({...input,email:'second@example.invalid'}),e=>e.status===409);
  assert.equal((await pool.query('select * from email_codes')).rowCount,1,'failed duplicate account must not consume verification');
  await assert.rejects(()=>r.winAIRegister({...input,username:'another',email:'second@example.invalid',emailCodeHash:'wrong'}),e=>e.status===400);
  console.log('PASS: public signup real PostgreSQL atomic code consumption, race, empty roles, duplicate rollback and wrong code');
 }finally{await pool.end();await admin.query('drop schema '+schema+' cascade');await admin.end();}
})().catch(()=>{console.error('Public signup PostgreSQL verification failed');process.exitCode=1;});
