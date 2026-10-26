const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

function createPromptArtStore(root,accountId){
 const folder=path.join(root,'prompt-art-bindings');
 const scope=payload=>{
  const account=String(accountId()||'');
  if(!account||account==='local'||String(payload?.accountId)!==account)throw Error('账号已变化，请重新打开提示词关联');
  if(typeof payload.projectId!=='string'||!payload.projectId)throw Error('项目身份无效');
  const file=path.join(folder,crypto.createHash('sha256').update(account+':'+payload.projectId).digest('hex')+'.json');
  return {account,file};
 };
 const load=payload=>{
  const {file}=scope(payload);
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw Error('提示词关联读取失败，原文件已保留');}
 };
 return {
  load,
  save(payload){
   const {file,account}=scope(payload),previous=load(payload),data=payload.data;
   if((previous?.revision||0)!==payload.baseRevision)throw Error('关联记录已被另一窗口更新，请重新读取');
   if(!data||data.snapshot?.projectId!==payload.projectId||!Array.isArray(data.snapshot?.cards)||!Array.isArray(data.snapshot?.entries))throw Error('关联记录格式无效');
   const versions={...previous?.versions,...data.versions};
   for(const [id,row] of Object.entries(versions))if(row?.id!==id||row.snapshot?.projectId!==payload.projectId||!Array.isArray(row.snapshot?.entries)||!Array.isArray(row.snapshot?.cards))throw Error('提示词版本记录无效');
   const sceneDistributionAttempts=data.sceneDistributionAttempts||previous?.sceneDistributionAttempts||{};
   if(typeof sceneDistributionAttempts!=='object'||Array.isArray(sceneDistributionAttempts)||Object.values(sceneDistributionAttempts).some(row=>!row||typeof row.stamp!=='string'||!['running','failed','done'].includes(row.status)))throw Error('自动分发记录格式无效');
   const next={schema:2,accountId:account,enabled:Boolean(data.enabled),snapshot:data.snapshot,decisions:data.decisions||{},versions,sceneDistributionAttempts,selectedVersionId:data.selectedVersionId||'',revision:(previous?.revision||0)+1,updatedAt:new Date().toISOString()};
   const content=JSON.stringify(next);if(content.length>32*1024*1024)throw Error('关联记录过大，请分集核对');
   fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(file+'.tmp',content,'utf8');fs.renameSync(file+'.tmp',file);return next;
  },
  list(payload){
   const account=String(accountId()||'');if(!account||String(payload?.accountId)!==account)throw Error('账号已变化');
   if(!fs.existsSync(folder))return [];
   return fs.readdirSync(folder).filter(file=>file.endsWith('.json')).map(file=>{try{return JSON.parse(fs.readFileSync(path.join(folder,file),'utf8'));}catch{return null;}}).filter(row=>row?.accountId===account&&row.enabled).map(row=>({projectId:row.snapshot.projectId,name:row.snapshot.name,updatedAt:row.updatedAt}));
  }
 };
}
module.exports={createPromptArtStore};
