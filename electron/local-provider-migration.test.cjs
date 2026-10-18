const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {applyLocalProviderMigration}=require('./local-provider-migration.cjs');
test('owner-only local plan applies once, keeps projects/skills/other keys/old jobs credentials and does nothing without plan',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xz-plan-'));try{
 const data=path.join(root,'data'),user=path.join(root,'user');fs.mkdirSync(data);fs.mkdirSync(user);const file=path.join(data,'xingzhou-data.json');
 const before={directorProjects:[{id:'mine'}],skills:[{id:'custom',content:'private'}],mediaProfiles:[{id:'old',kind:'video',endpoint:'https://feituokuajing.com',apiKey:'old-fixture',model:'retired'},{id:'other',kind:'image',apiKey:'other-key'}],activeVideoApiId:'old'};fs.writeFileSync(file,JSON.stringify(before));
 assert.equal(applyLocalProviderMigration(user,data),false);assert.deepEqual(JSON.parse(fs.readFileSync(file)),before);
 fs.writeFileSync(path.join(user,'local-provider-migration.json'),JSON.stringify({dataDir:data,profiles:[{id:'fnko-v',kind:'video',name:'FT兼容',endpoint:'https://fanke2026.xyz/v1',model:'current',modelCatalog:[{id:'current',kind:'video'}]}]}));
 assert.equal(applyLocalProviderMigration(user,data),true);const after=JSON.parse(fs.readFileSync(file));assert.deepEqual(after.directorProjects,before.directorProjects);assert.deepEqual(after.skills,before.skills);assert.equal(after.mediaProfiles.find(p=>p.id==='old').apiKey,'old-fixture');assert(after.mediaProfiles.find(p=>p.id==='old').legacyTaskOnly);assert.equal(after.mediaProfiles.find(p=>p.id==='other').apiKey,'other-key');assert.equal(after.mediaProfiles.find(p=>p.id==='fnko-v').apiKey,'');assert.equal(after.activeVideoApiId,'fnko-v');assert.equal(applyLocalProviderMigration(user,data),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
