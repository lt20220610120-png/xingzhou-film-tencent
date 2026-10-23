const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {addCalendarMonth,generateCard,cardDigest,proofMessage,verifyDeviceProof,licenseDecision}=require('../shared/software-license.cjs');
test('北京时间对应日月卡包含月底、闰年且不变成固定30天',()=>{
 assert.equal(addCalendarMonth('2026-10-23T02:15:00Z'),'2026-11-23T02:15:00.000Z');
 assert.equal(addCalendarMonth('2026-01-31T14:15:00Z'),'2026-02-28T14:15:00.000Z');
 assert.equal(addCalendarMonth('2028-01-31T14:15:00Z'),'2028-02-29T14:15:00.000Z');
 assert.equal(addCalendarMonth('2026-01-30T18:15:00Z'),'2026-02-27T18:15:00.000Z');
});
test('卡密具有192位随机熵，规范化摘要且不保存明文',()=>{
 const a=generateCard(),b=generateCard();assert.match(a,/^XZ-(?:[A-F0-9]{8}-){5}[A-F0-9]{8}$/);assert.notEqual(a,b);
 assert.equal(cardDigest(a.toLowerCase().replaceAll('-','')),cardDigest(a));assert.equal(cardDigest(a).length,64);
 assert.throws(()=>cardDigest('XZ-123456'));
});
test('挑战证明绑定完整动作、参数、会话，不能挪用或篡改',()=>{
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');const pem=publicKey.export({type:'spki',format:'pem'});
 const value={action:'login',payload:{username:'a',password:'p'},token:'t',nonce:'nonce'};
 const signature=crypto.sign(null,proofMessage(value),privateKey).toString('base64');
 assert.equal(verifyDeviceProof({...value,publicKey:pem,signature}),true);
 for(const changed of [{token:'x'},{nonce:'x'},{action:'register'},{payload:{username:'b',password:'p'}}])assert.equal(verifyDeviceProof({...value,...changed,publicKey:pem,signature}),false);
});
test('仅明确豁免记录放行，管理员或本地安装时间不自动豁免',()=>{
 assert.equal(licenseDecision({exempt:true,banned:false},null,0).status,'exempt');
 assert.equal(licenseDecision({is_admin:true},null,0).status,'required');
 assert.equal(licenseDecision({exempt:true,banned:true},null,0).status,'banned');
 assert.equal(licenseDecision({}, {expires_at:'2026-11-23T00:00:00Z',revoked:false,device_key:'a'},Date.parse('2026-11-22'),'a').status,'active');
 assert.equal(licenseDecision({}, {expires_at:'2026-11-23T00:00:00Z',revoked:false,device_key:'a'},Date.parse('2026-11-22'),'b').status,'other-device');
 assert.equal(licenseDecision({}, {expires_at:'2026-11-23T00:00:00Z',revoked:false,device_key:'a'},Date.parse('2026-11-23'),'a').status,'expired');
});
