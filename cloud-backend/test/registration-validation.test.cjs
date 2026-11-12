const test = require('node:test');
const assert = require('node:assert/strict');
const { register } = require('../src/auth.cjs');
const { extendLicenseRepository } = require('../src/software-license-repository.cjs');

const valid = { username: 'staff_001', password: 'secret123', email: 'qa@example.com', inviteCode: 'QA-ONLY', emailCode: '123456' };
const usernameMessage = '账号需为 3–32 位英文字母、数字或下划线（不区分大小写），不能含中文、空格或其他符号';
const invalid = [
  ...['', 'ab', 'a'.repeat(33), '张导演', 'staff 001', 'staff-001', 'staff.001', 'ｓｔａｆｆ'].map(username => ({ patch: { username }, field: 'username', message: usernameMessage })),
  { patch: { password: '' }, field: 'password', message: '密码至少需要 6 位' },
  { patch: { password: '12345' }, field: 'password', message: '密码至少需要 6 位' },
  { patch: { email: 'qa@invalid' }, field: 'email', message: '邮箱地址格式不正确' },
  { patch: { email: 'qa @example.com' }, field: 'email', message: '邮箱地址格式不正确' },
  { patch: { inviteCode: '  ' }, field: 'inviteCode', message: '请输入管理员发放的邀请码' },
];
for (const [index, { patch, message }] of invalid.entries()) {
  test(`普通与激活注册返回相同的可执行字段提示，且不消费注册资源 #${index + 1}`, async () => {
    const normal = await register({ ...valid, ...patch }, new Proxy({}, { get() { assert.fail('格式错误不应读取或写入仓储'); } }));
    assert.deepEqual(normal, { status: 400, body: { error: message } });
    const queries = [];
    const repository = extendLicenseRepository({ connect: async () => ({
      release() {}, async query(sql) { queries.push(sql); if (!['begin', 'rollback', 'commit'].includes(sql)) assert.fail('格式错误不应读取或消费验证码、邀请码、卡密或账号'); return { rows: [] }; },
    }) });
    await assert.rejects(repository.registerAndRedeem({ ...valid, ...patch }, 'qa-device', 'qa-activation'), error => error.status === 400 && error.message === message);
    assert.equal(queries.includes('commit'), false);
  });
}

for (const username of ['abc', 'a'.repeat(32), ' STAFF_001 ']) test(`合法边界及旧大小写/首尾空白规则保持兼容: ${username}`, async () => {
  const {hashEmailCode}=require('../src/email-code.cjs'),{verifyPassword}=require('../src/password.cjs');
  let normalCreated, cardCreated;
  const code={code_hash:hashEmailCode(valid.emailCode),expires_at:'2099-01-01'};
  const invite={id:'qa-invite',kind:'role',role:'creator'};
  const password=' secret123 ',payload={...valid,username,email:' QA@Example.COM ',password};
  const consumed=[];
  const result=await register(payload,{
    findEmailCode:async()=>code,findInviteByDigest:async()=>invite,findUser:async()=>null,findEmail:async()=>null,
    createUser:async data=>{normalCreated=data;return {id:'qa-user',...data};},
    consumeInvite:async()=>consumed.push('invite'),deleteEmailCode:async()=>consumed.push('email'),createSession:async()=> 'qa-session',
  });
  assert.equal(result.status,200);assert.deepEqual(consumed,['invite','email']);
  let redeemed=0;const sqlLog=[];
  const repo=extendLicenseRepository({connect:async()=>({release(){},async query(sql,values){
    sqlLog.push(sql);
    if(sql.startsWith('select email,code_hash'))return {rows:[code]};
    if(sql.includes('from invites where'))return {rows:[invite]};
    if(sql.startsWith('select 1 from app_users'))return {rowCount:0};
    if(sql.includes('from software_license_pending'))return {rows:[{card_id:'qa-card'}]};
    if(sql.includes('from software_license_cards'))return {rows:[{id:'qa-card'}]};
    if(sql.startsWith('insert into app_users')){cardCreated=values;return {rows:[{id:'qa-user'}]};}
    return {rows:[],rowCount:1};
  }})});
  repo.licenseRedeemInTransaction=async()=>{redeemed++;return {};};
  await repo.registerAndRedeem(payload,'qa-device','qa-activation');
  assert.equal(redeemed,1);assert.equal(sqlLog.at(-1),'commit');
  assert.equal(normalCreated.username,username.trim().toLowerCase());assert.equal(cardCreated[0],normalCreated.username);
  assert.equal(normalCreated.email,'qa@example.com');assert.equal(cardCreated[2],normalCreated.email);
  assert(verifyPassword(password,normalCreated.passwordHash));assert(verifyPassword(password,cardCreated[3]));
  assert.equal(verifyPassword(password.trim(),cardCreated[3]),false,'不能悄悄裁剪密码');
});

for(const licensed of [false,true]) test(`HTTP register 返回具体字段提示且保留设备门禁 (licensed=${licensed})`,async t=>{
  const {createServer}=require('../src/server.cjs');
  const crypto=require('node:crypto'),{proofMessage}=require('../shared/software-license.cjs');
  const pair=crypto.generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({type:'spki',format:'pem'});
  const repo=licensed?{
    ...extendLicenseRepository({connect:async()=>({release(){},async query(sql){assert(['begin','rollback'].includes(sql));return {rows:[]};}})}),
    licenseState:async()=>({}),licenseConsumeChallenge:async()=>true,licensePending:async()=>true,
  }:{};
  const server=createServer({API_SECRET:'isolated-test',DATABASE_URL:'postgres://unused'},{repository:repo,mailer:null,cosSigner:null});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const call=payload=>fetch(`http://127.0.0.1:${server.address().port}/api/gateway`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'register',...payload})});
  if(licensed){const denied=await call(valid);assert.equal(denied.status,403);assert.match((await denied.json()).error,/先验证有效卡密/);}
  for(const {patch,message}of [invalid[3],invalid[9],invalid[10],invalid[12]]){
    let payload={...valid,...patch};
    if(licensed){payload={...payload,_licenseVersion:'2.8.154',_licenseActivation:'qa-only'};const nonce=crypto.randomUUID();payload={...payload,_licenseProof:{publicKey,nonce,signature:crypto.sign(null,proofMessage({action:'register',payload,token:'',nonce}),pair.privateKey).toString('base64')}};}
    const response=await call(payload);assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:message});
  }
});
