const test=require('node:test'),assert=require('node:assert/strict');
const {rolesForInvite}=require('../src/invites.cjs');
const {register}=require('../src/auth.cjs');
const {hashEmailCode}=require('../src/email-code.cjs');
test('generic registration derives role from the invitation, explicit legacy choices retain validation',()=>{
 assert.deepEqual(rolesForInvite({kind:'role',role:'director'}).roles,['director']);
 assert.deepEqual(rolesForInvite({kind:'role',role:'creator'}).roles,['creator']);
 assert.deepEqual(rolesForInvite({kind:'full'}).roles,['creator','director']);
 assert.match(rolesForInvite({kind:'role',role:'director'},'creator').error,/不能开通/);
 assert.match(rolesForInvite({kind:'unlock',role:'director'}).error,/不能用于注册/);
});

for(const role of ['director','creator'])test('normal registration follows '+role+' invitation without a card-page role',async()=>{
 let created;const repository={findEmailCode:async()=>({code_hash:hashEmailCode('123456'),expires_at:'2099-01-01'}),findInviteByDigest:async()=>({id:'invite',kind:'role',role}),findUser:async()=>null,findEmail:async()=>null,createUser:async user=>{created=user;return {id:'new',...user};},consumeInvite:async()=>{},deleteEmailCode:async()=>{},createSession:async()=> 'session'};
 const result=await register({username:'new_user',email:'user@example.com',password:'secret123',emailCode:'123456',inviteCode:'ROLE'},repository);assert.equal(result.status,200);assert.deepEqual(created.roles,[role]);assert.equal(created.activeRole,role);
});
for(const role of ['director','creator'])test('card registration transaction follows '+role+' invitation and preserves redemption',async()=>{
 let created,redeemed=0;const client={release(){},async query(sql,values){
  if(sql.startsWith('select email,code_hash'))return {rows:[{code_hash:hashEmailCode('123456'),expires_at:'2099-01-01'}]};
  if(sql.includes('from invites where'))return {rows:[{id:'invite',kind:'role',role}]};
  if(sql.startsWith('select 1 from app_users'))return {rowCount:0,rows:[]};
  if(sql.includes('from software_license_pending'))return {rows:[{card_id:'card'}]};
  if(sql.includes('from software_license_cards'))return {rows:[{id:'card'}]};
  if(sql.startsWith('insert into app_users')){created=values;return {rows:[{id:'new',roles:values[4]}]};}
  if(sql.startsWith('update invites'))return {rowCount:1};return {rows:[],rowCount:1};
 }};
 const repository=require('../src/software-license-repository.cjs').extendLicenseRepository({connect:async()=>client});repository.licenseRedeemInTransaction=async(_c,activation,key,id)=>{assert.deepEqual([activation,key,id],['activation','device','new']);redeemed++;return {device_key:key};};
 const result=await repository.registerAndRedeem({username:'new_user',email:'user@example.com',password:'secret123',emailCode:'123456',inviteCode:'ROLE'},'device','activation');assert.deepEqual(created[4],[role]);assert.equal(created[5],role);assert.equal(redeemed,1);assert(result.token);
});
