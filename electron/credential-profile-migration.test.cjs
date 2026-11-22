const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { repairWindowsCredentials } = require('./credential-profile-migration.cjs');

function encrypt(key, value) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  return Buffer.concat([Buffer.from('v10'), nonce, cipher.update(value,'utf8'), cipher.final(), cipher.getAuthTag()]);
}

function fixture(t) {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(),'xz-credential-repair-'));
  t.after(()=>fs.rmSync(appData,{recursive:true,force:true}));
  const userData = path.join(appData,'行舟影视-腾讯云版');
  const legacy = path.join(appData,'行舟影视（腾讯云版）','Local State');
  const currentKey = crypto.randomBytes(32), legacyKey = crypto.randomBytes(32);
  const dpapiBlob = Buffer.from('mock-user-bound-dpapi');
  function write(file, value) {
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,value);
  }
  const localState = JSON.stringify({os_crypt:{encrypted_key:Buffer.concat([Buffer.from('DPAPI'),dpapiBlob]).toString('base64')}});
  write(legacy,localState);
  write(path.join(appData,'other app','Local State'),localState);
  function store(name,value,key=legacyKey,version) {
    const ciphertext = encrypt(key,value);
    write(path.join(userData,name),version ? JSON.stringify({version,fixture:'retained',encrypted:ciphertext.toString('base64')}) : ciphertext);
  }
  const safeStorage = {
    isEncryptionAvailable:()=>true,
    encryptString:value=>encrypt(currentKey,value),
    decryptString(bytes) {
      const decipher=crypto.createDecipheriv('aes-256-gcm',currentKey,bytes.subarray(3,15));
      decipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([decipher.update(bytes.subarray(15,-16)),decipher.final()]).toString('utf8');
    }
  };
  const raw = name => fs.readFileSync(path.join(userData,name));
  const read = (name,version)=>safeStorage.decryptString(version?Buffer.from(JSON.parse(raw(name)).encrypted,'base64'):raw(name));
  const options={appData,userData,safeStorage,platform:'win32',unprotect:async blobs=>{
    assert.deepEqual(blobs,[dpapiBlob]);
    return [Buffer.from(legacyKey)];
  }};
  return {legacy,localState,currentKey,legacyKey,store,raw,read,options};
}

test('the same Windows user can reseal all app-owned credential types without changing their content',async t=>{
  const f=fixture(t);
  const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
  const identity=JSON.stringify({privateKey:privateKey.export({type:'pkcs8',format:'pem'}),publicKey:publicKey.export({type:'spki',format:'pem'})});
  const values=[
    ['cloud-session.json',JSON.stringify({token:'fixture-session',account:{id:'old'}}),2],
    ['software-device-key.json',identity,1],
    ['software-license-card.json','FIXTURE-CARD',1],
    ['like-connector/browser-token.enc','b'.repeat(64)],
    [`libtv/accounts/${'a'.repeat(32)}/credentials.enc`,JSON.stringify({token:'fixture-libtv'})],
  ];
  for(const [name,value,version] of values)f.store(name,value,f.legacyKey,version);
  await repairWindowsCredentials(f.options);
  for(const [name,value,version] of values){
    assert.equal(f.read(name,version),value);
    if(version)assert.equal(JSON.parse(f.raw(name)).fixture,'retained');
  }
  assert.equal(fs.readFileSync(f.legacy,'utf8'),f.localState);
});

test('a healthy current credential keeps its original bytes and does not start legacy DPAPI',async t=>{
  const f=fixture(t);
  f.store('cloud-session.json','{"token":"current"}',f.currentKey,2);
  const before=f.raw('cloud-session.json');
  let unlocks=0;
  await repairWindowsCredentials({...f.options,unprotect:async()=>{unlocks++;return [];}});
  assert.equal(unlocks,0);
  assert.deepEqual(f.raw('cloud-session.json'),before);
});

test('a replacement that native storage cannot round trip leaves the old envelope untouched',async t=>{
  const f=fixture(t);
  f.store('cloud-session.json','{"token":"old"}',f.legacyKey,2);
  const old=f.raw('cloud-session.json');
  const safeStorage={...f.options.safeStorage,encryptString:()=>encrypt(f.currentKey,'different')};
  await repairWindowsCredentials({...f.options,safeStorage});
  assert.deepEqual(f.raw('cloud-session.json'),old);
});

test('wrong key, invalid recovered payload, outside scope, and concurrent replacement keep existing bytes',async t=>{
  const f=fixture(t);
  f.store('cloud-session.json','{"token":"old"}',f.legacyKey,2);
  f.store('software-license-card.json','foreign key',crypto.randomBytes(32),1);
  f.store('software-device-key.json','{"privateKey":"invalid"}',f.legacyKey,1);
  const unowned='libtv/accounts/invalid/credentials.enc';
  f.store(unowned,'{"token":"not an app account"}',f.legacyKey);
  const preserved=['software-license-card.json','software-device-key.json',unowned].map(name=>[name,f.raw(name)]);
  const originalUnprotect=f.options.unprotect;
  await repairWindowsCredentials({...f.options,unprotect:blobs=>{
    f.store('cloud-session.json','{"token":"new"}',f.currentKey,2);
    return originalUnprotect(blobs);
  }});
  assert.equal(f.read('cloud-session.json',2),'{"token":"new"}');
  for(const [name,bytes] of preserved)assert.deepEqual(f.raw(name),bytes);
});
