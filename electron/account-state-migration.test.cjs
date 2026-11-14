const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {migrateLegacyAccountState}=require('./account-state-migration.cjs');

test('legacy cloud session and license files migrate once without overwriting new state',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-account-migration-')),appData=path.join(root,'app'),legacy=path.join(appData,'行舟影视'),userData=path.join(appData,'行舟影视-腾讯云版');
 fs.mkdirSync(legacy,{recursive:true});
 for(const name of ['cloud-session.json','software-device-key.json','software-license-card.json','software-license-route.json'])fs.writeFileSync(path.join(legacy,name),name);
 fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(path.join(userData,'cloud-session.json'),'new');
 try{
  assert.deepEqual(migrateLegacyAccountState({appData,userData}),['software-device-key.json','software-license-card.json','software-license-route.json']);
  assert.equal(fs.readFileSync(path.join(userData,'cloud-session.json'),'utf8'),'new');
  assert.deepEqual(migrateLegacyAccountState({appData,userData}),[]);
  fs.unlinkSync(path.join(userData,'cloud-session.json'));
  assert.deepEqual(migrateLegacyAccountState({appData,userData}),[], '注销或失效后不得重新导入旧会话');
  assert.equal(fs.existsSync(path.join(userData,'cloud-session.json')),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
