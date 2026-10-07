// Runs against temporary tables inside a rolled-back transaction; no real account is modified.
const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');const {execFileSync}=require('node:child_process');
const source=path.resolve(process.argv[2]||path.join(__dirname,'../src'));
const {createRepository}=require(path.join(source,'postgres-repository.cjs'));
const {recover,session,login}=require(path.join(source,'auth.cjs'));
const {hashPassword}=require(path.join(source,'password.cjs'));
const {hashEmailCode}=require(path.join(source,'email-code.cjs'));
async function run(){
 let databaseUrl=process.env.DATABASE_URL;
 if(!databaseUrl){const pid=execFileSync('systemctl',['show','xingzhou-cloud-backend','-p','MainPID','--value'],{encoding:'utf8'}).trim();databaseUrl=fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0').find(value=>value.startsWith('DATABASE_URL='))?.slice(13);}
 assert.ok(databaseUrl,'Database configuration unavailable');
 const {Pool}=require(path.join(source,'../node_modules/pg'));
 const pool=new Pool({connectionString:databaseUrl});const client=await pool.connect();
 try{
  await client.query('begin');
  await client.query(`create temporary table app_users(id text primary key,username text,display_name text,email text,roles text[],active_role text,is_admin boolean default false,is_producer boolean default false,banned boolean default false,created_at timestamptz default now(),updated_at timestamptz default now(),avatar_data text,bio text,profile_tags text[],password_hash text)`);
  await client.query('create temporary table app_sessions(user_id text,token_hash text,expires_at timestamptz)');
  await client.query('create temporary table email_codes(email text primary key,code_hash text,expires_at timestamptz)');
  let savepoint=0;
  const wrapped={query:async(sql,args)=>{if(sql==='begin')return client.query(`savepoint security_smoke_${++savepoint}`);if(sql==='commit')return client.query(`release savepoint security_smoke_${savepoint}`);if(sql==='rollback')return client.query(`rollback to savepoint security_smoke_${savepoint}`);return client.query(sql,args);},release(){}};
  const repo=createRepository('unused',{pool:{query:(sql,args)=>client.query(sql,args),connect:async()=>wrapped}});
  const initial=hashPassword('synthetic-old-password');
  await client.query("insert into app_users(id,username,email,roles,active_role,password_hash) values ('security-test','securitytest','test@example.invalid',ARRAY['creator'],'creator',$1)",[initial]);
  const oldToken=await repo.createSession('security-test','synthetic-old-token',initial);
  assert.equal((await session(oldToken,repo)).status,200);
  await client.query("insert into email_codes(email,code_hash,expires_at) values ('test@example.invalid',$1,now()+interval '5 minutes')",[hashEmailCode('123456')]);
  assert.equal((await recover({username:'securitytest',email:'test@example.invalid',emailCode:'123456',newPassword:'synthetic-new-password'},repo)).status,200);
  assert.equal((await session(oldToken,repo)).status,401);
  assert.equal(await repo.createSession('security-test','late-old-password-token',initial),null);
  assert.equal((await login({username:'securitytest',password:'synthetic-old-password'},repo)).status,401);
  const next=await login({username:'securitytest',password:'synthetic-new-password'},repo);assert.equal(next.status,200);
  await repo.setBanned('security-test',true);assert.equal((await session(next.body.token,repo)).status,401);
  assert.equal((await login({username:'securitytest',password:'synthetic-new-password'},repo)).status,401);
  // Existing previously banned sessions are denied even if they predate the new revocation path.
  await client.query("insert into app_sessions(user_id,token_hash,expires_at) values ('security-test',$1,now()+interval '1 hour')",[require('node:crypto').createHash('sha256').update('synthetic-legacy-banned').digest('hex')]);
  assert.equal((await session('synthetic-legacy-banned',repo)).status,403);
  console.log('SECURITY_PG_SMOKE_PASS: password reset, old-token denial, login race and ban revocation; temporary tables only.');
 }finally{await client.query('rollback');client.release();await pool.end();}
}
run().catch(()=>{console.error('SECURITY_PG_SMOKE_FAILED');process.exitCode=1;});
