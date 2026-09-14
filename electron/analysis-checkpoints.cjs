const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function createAnalysisCheckpoints(root,accountId){
 const file=projectId=>path.join(root,'analysis-checkpoints',crypto.createHash('sha256').update(String(accountId())+':'+String(projectId)).digest('hex')+'.json');
 return {
  load({projectId}){try{return JSON.parse(fs.readFileSync(file(projectId),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw new Error('分析进度读取失败，请检查本地资料文件');}},
  save({projectId,data}){const dest=file(projectId);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest+'.tmp',JSON.stringify(data),'utf8');fs.renameSync(dest+'.tmp',dest);return true;},
 };
}
module.exports={createAnalysisCheckpoints};
