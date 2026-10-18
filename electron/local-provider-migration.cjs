const fs=require('node:fs'),path=require('node:path');
// Optional owner-side plan, stored in userData by maintenance, never bundled or applied to other users.
function applyLocalProviderMigration(userData,dataDir){
 const planFile=path.join(userData,'local-provider-migration.json'),file=path.join(dataDir,'xingzhou-data.json');
 if(!fs.existsSync(planFile)||!fs.existsSync(file))return false;
 const plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
 if(plan.appliedAt||path.resolve(plan.dataDir)!==path.resolve(dataDir))return false;
 if(!Array.isArray(plan.profiles)||plan.profiles.some(p=>!p.id||!['image','video'].includes(p.kind)||new URL(p.endpoint).origin!=='https://fanke2026.xyz'))throw Error('本机接口维护计划无效，原配置保留');
 const original=fs.readFileSync(file,'utf8'),state=JSON.parse(original),old=state.mediaProfiles||[];
 const retired=old.filter(p=>{try{return new URL(p.endpoint).hostname==='feituokuajing.com';}catch{return false;}}).map(p=>p.id);
 const profiles=old.map(p=>retired.includes(p.id)?{...p,legacyTaskOnly:true,name:'FT旧站（仅查询原任务）'}:p);
 for(const candidate of plan.profiles){
  const existing=profiles.find(p=>p.id===candidate.id);
  if(existing)continue; // Never overwrite a Key the user has just entered.
  profiles.push({...candidate,provider:'fnko',apiKey:'',createdAt:new Date().toISOString()});
 }
 const next={...state,mediaProfiles:profiles};
 if(retired.includes(state.activeVideoApiId))next.activeVideoApiId=plan.profiles.find(p=>p.kind==='video')?.id||null;
 if(retired.includes(state.activeImageApiId))next.activeImageApiId=plan.profiles.find(p=>p.kind==='image')?.id||null;
 const backup=path.join(dataDir,'repair-backups','fnko-2.8.50-'+Date.now());fs.mkdirSync(backup,{recursive:true});fs.writeFileSync(path.join(backup,'xingzhou-data.json'),original);
 // Startup only, before the renderer can write its in-memory snapshot.
 fs.writeFileSync(file+'.fnko-tmp',JSON.stringify(next));fs.renameSync(file+'.fnko-tmp',file);
 fs.writeFileSync(planFile,JSON.stringify({...plan,appliedAt:Date.now(),backup}));return true;
}
module.exports={applyLocalProviderMigration};
