// Real PostgreSQL, throwaway schema only. Run as the DB peer user on staging.
const {Pool}=require('pg'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),schema='qa_license_'+crypto.randomBytes(6).toString('hex');
const connection={host:'/var/run/postgresql',database:'xingzhou',user:'postgres'};
const control=new Pool(connection);let pool,server;
(async()=>{await control.query('create schema '+schema);pool=new Pool({...connection,options:'-c search_path='+schema+',public'});
 try{
  await pool.query(fs.readFileSync(path.join(root,'cloud-backend/schema.sql'),'utf8'));
  await pool.query("alter table app_users add column avatar_data text default '',add column bio text default '',add column profile_tags text[] default '{}'");
  await pool.query(fs.readFileSync(path.join(root,'cloud-backend/migrations/20261023-software-license.sql'),'utf8'));
  const {hashPassword}=require('../cloud-backend/src/password.cjs'),{generateCard,cardDigest,addCalendarMonth,proofMessage}=require('../cloud-backend/shared/software-license.cjs');
  const repo=require('../cloud-backend/src/postgres-repository.cjs').createRepository('',{pool});
  const makeUser=async(name,admin=false)=>repo.createUser({username:name,email:name+'@example.invalid',displayName:name,passwordHash:hashPassword('fixture-password'),roles:['creator','director'],activeRole:'creator',isAdmin:admin,isProducer:false});
  const old=await makeUser('old',true),user=await makeUser('new'),other=await makeUser('other');
  await pool.query("insert into software_license_exemptions(user_id,reason) values($1,'QA explicit legacy')",[old.id]);
  const pair=crypto.generateKeyPairSync('ed25519'),key=pair.publicKey.export({type:'spki',format:'pem'}),key2=crypto.generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});
  const issue=async(orderId,monthNumber)=>{const code=generateCard();const row=await repo.licenseIssue({digest:cardDigest(code),hint:code.slice(-8),note:'QA',orderId,monthNumber},old.id);return {...row,code};};
  const card=await issue(),pending=await repo.licensePrepare(cardDigest(card.code),key);
  assert.equal((await repo.licenseState(user.id,key)).grant,undefined,'prepare does not consume');
  const redeemed=await Promise.all(Array.from({length:5},()=>repo.licenseRedeem(pending.activationToken,key,user.id)));
  assert.equal(new Set(redeemed.map(x=>new Date(x.expires_at).toISOString())).size,1,'retries cannot add time');
  assert.equal((await pool.query("select count(*)::int as n from software_license_audit where action='redeem'")).rows[0].n,1);
  const before=redeemed[0].expires_at,second=await issue(),pending2=await repo.licensePrepare(cardDigest(second.code),key);
  const renewed=await repo.licenseRedeem(pending2.activationToken,key,user.id);assert.equal(new Date(renewed.expires_at).toISOString(),addCalendarMonth(before));
  const third=await issue(),p3=await repo.licensePrepare(cardDigest(third.code),key2);
  await assert.rejects(repo.licenseRedeem(p3.activationToken,key2,user.id),/绑定/);
  assert.equal(await repo.licensePending(p3.activationToken,key2),true,'failed bind preserves card');
  await repo.licenseAdminChange('unbind',user.id,'QA machine change',old.id);await repo.licenseBind(key2,user.id);
  assert.equal((await repo.licenseState(user.id,key2)).grant.device_key,key2);
  assert.equal((await repo.licenseState(user.id,key)).knownDevice,true,'historical settlement survives rebinding');
  assert.equal((await repo.licenseState(user.id,key2)).knownDevice,true);
  await repo.licenseAdminChange('revoke',user.id,'QA revoke',old.id);await assert.rejects(repo.licenseRedeem(p3.activationToken,key2,user.id),/撤销/);
  await repo.licenseAdminChange('restore',user.id,'QA restore',old.id);
  const order=await repo.licenseCreateOrder('QA annual',old.id);const annual=await issue(order.id,1);await assert.rejects(issue(order.id,1),/已有有效卡/);
  await repo.licenseAdminChange('disable-card',annual.id,'Lost delivery',old.id);await issue(order.id,1);
  // Real HTTP gateway: old protocol exempt login, forbidden new login without card,
  // device proof binds action from JSON envelope, nonce replay and tamper rejected.
  server=require('../cloud-backend/src/server.cjs').createServer({API_SECRET:'qa',DATABASE_URL:'qa',PORT:'0'},{repository:repo,mailer:null,cosSigner:null,logger:{error:()=>{}}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/api/gateway';
  const call=async(action,payload={},token='')=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({...payload,action})});return {status:response.status,body:await response.json()};};
  const sign=async(action,payload={},token='')=>{const n=await call('license-challenge',{publicKey:key});const v={...payload,_licenseVersion:'2.8.66'};return {...v,_licenseProof:{publicKey:key,nonce:n.body.nonce,signature:crypto.sign(null,proofMessage({action,payload:v,token,nonce:n.body.nonce}),pair.privateKey).toString('base64')}};};
  const logged=await call('login',{username:'old',password:'fixture-password'});assert.equal(logged.status,200);assert.equal(logged.body.license.status,'exempt');
  assert.equal((await call('session',{},logged.body.token)).status,200);
  assert.equal((await call('license-check',{},logged.body.token)).body.status,'exempt');
  assert.equal((await call('license-route',{},logged.body.token)).body.status,'exempt');
  const oldHint=await call('license-route',{username:'old'});assert.equal(oldHint.body.status,'login');assert.equal(oldHint.body.allowed,false);
  assert.equal((await call('license-route',{username:'other'})).body.status,'monthly');
  assert.equal((await call('login',{username:'other',password:'fixture-password'})).status,403);
  assert.equal((await call('register',{username:'blocked',password:'fixture-password',email:'blocked@example.invalid'})).status,403);
  const invite=await repo.createInvite({code:'QA',digest:require('../cloud-backend/src/invites.cjs').digestInvite('QA'),kind:'full',role:null,maxUses:1,note:'QA'});
  await repo.saveEmailCode('register@example.invalid',require('../cloud-backend/src/email-code.cjs').hashEmailCode('123456'),new Date(Date.now()+3600000));
  // Card for a device already bound to a different account must roll back ALL registration writes.
  const blockedCard=await issue(),blockedPending=await repo.licensePrepare(cardDigest(blockedCard.code),key2);
  await assert.rejects(repo.registerAndRedeem({username:'register',email:'register@example.invalid',password:'fixture-password',emailCode:'123456',inviteCode:'QA',requestedRole:'creator'},key2,blockedPending.activationToken),/绑定/);
  assert.equal(await repo.findUser('register'),null);assert.equal((await repo.findInviteByDigest(require('../cloud-backend/src/invites.cjs').digestInvite('QA'))).used_count,0);assert(await repo.findEmailCode('register@example.invalid'));
  // Complete fresh registration through the real signed HTTP protocol.
  const freshPair=crypto.generateKeyPairSync('ed25519'),freshKey=freshPair.publicKey.export({type:'spki',format:'pem'});
  const freshSign=async(action,payload)=>{const n=await call('license-challenge',{publicKey:freshKey}),v={...payload,_licenseVersion:'2.8.66'};return {...v,_licenseProof:{publicKey:freshKey,nonce:n.body.nonce,signature:crypto.sign(null,proofMessage({action,payload:v,token:'',nonce:n.body.nonce}),freshPair.privateKey).toString('base64')}};};
  const freshCard=await issue(),freshPrep=await call('license-prepare',await freshSign('license-prepare',{code:freshCard.code}));
  const registered=await call('register',await freshSign('register',{username:'register',email:'register@example.invalid',password:'fixture-password',emailCode:'123456',inviteCode:'QA',requestedRole:'creator',_licenseActivation:freshPrep.body.activationToken}));
  assert.equal(registered.status,200,JSON.stringify(registered.body));assert.equal(registered.body.license.status,'active');assert.equal(registered.body.account.is_admin,false);assert.equal((await repo.findInviteByDigest(require('../cloud-backend/src/invites.cjs').digestInvite('QA'))).used_count,1);assert.equal(await repo.findEmailCode('register@example.invalid'),null);
  const adminCard=await call('admin-license-issue',{note:'HTTP QA'},logged.body.token);assert.equal(adminCard.status,200);assert.equal(typeof adminCard.body.code,'string');
  assert.equal((await call('admin-license-change',{changeAction:'disable-card',target:adminCard.body.id,reason:'QA',confirmed:true},logged.body.token)).status,200);
  const raw=await sign('license-check');assert.equal((await call('license-check',raw)).status,200);assert.equal((await call('license-check',raw)).status,403);
  const newCard=await issue(),prep=await call('license-prepare',await sign('license-prepare',{code:newCard.code}));assert.equal(prep.status,200);
  const activated=await call('login',await sign('login',{username:'other',password:'fixture-password',_licenseActivation:prep.body.activationToken}));assert.equal(activated.status,200);assert.equal(activated.body.license.status,'active');
  assert.equal((await call('session',{},activated.body.token)).status,403,'old version cannot reuse token');
  assert.equal((await call('session',await sign('session',{},activated.body.token),activated.body.token)).status,200);
  const bad=await sign('license-check');bad._licenseVersion='2.8.65';assert.equal((await call('license-check',bad)).status,403);
  await pool.query("update software_licenses set expires_at=now()-interval '1 second' where user_id=$1",[other.id]);
  assert.equal((await call('session',await sign('session',{},activated.body.token),activated.body.token)).status,200);
  assert.equal((await call('project-create',await sign('project-create',{name:'blocked'},activated.body.token),activated.body.token)).status,403);
  assert.equal((await repo.licenseOverview()).cards.some(c=>c.code||c.digest),false,'inventory cannot reveal secrets');
  console.log(JSON.stringify({passed:true,realPostgres:true,checks:['prepare-no-consumption','concurrent-idempotency','calendar-renewal','single-device','historical-device-settlement','revoke','annual-replacement','legacy-old-protocol','new-old-client-denial','register-rollback','signed-http-registration','admin-http-issue-disable','real-http-proof','replay-denial','paid-expiry-denial','read-only-session','digest-only-inventory']}));
 }finally{if(server)await new Promise(r=>server.close(r));await pool?.end();await control.query('drop schema '+schema+' cascade');await control.end();}
})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;});
