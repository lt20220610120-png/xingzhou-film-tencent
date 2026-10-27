const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function createAnalysisCheckpoints(root,accountId,folder='analysis-checkpoints'){
 const scoped=payload=>{if(payload.accountId!==undefined&&String(payload.accountId)!==String(accountId()))throw Error('账号已变化，后台任务已保留在原账号，请重新登录后继续');return payload;};
 const file=projectId=>path.join(root,folder,crypto.createHash('sha256').update(String(accountId())+':'+String(projectId)).digest('hex')+'.json');
 return {
  load(payload){const {projectId}=scoped(payload);try{return JSON.parse(fs.readFileSync(file(projectId),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw new Error('分析进度读取失败，请检查本地资料文件');}},
  save(payload){const {projectId,data}=scoped(payload),dest=file(projectId);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest+'.tmp',JSON.stringify(data),'utf8');fs.renameSync(dest+'.tmp',dest);return true;},
  saveAsync(payload){const {projectId,data}=scoped(payload);return require('./state-writer.cjs').writeStateAsync(file(projectId),data,{epochBackup:folder==='director-live-local'});},
 };
}
module.exports={createAnalysisCheckpoints};
