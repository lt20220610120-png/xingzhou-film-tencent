const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
function createSessionStore(directory,safeStorage) {
 const file=path.join(directory,'cloud-session.json');
 const available=()=>safeStorage?.isEncryptionAvailable()===true;
 function write(value){
  // Never fall back to plaintext if the operating system key provider is unavailable.
  if(!available())throw new Error('系统凭证加密暂不可用，登录信息未保存，请稍后重试');
  const encrypted=safeStorage.encryptString(JSON.stringify(value)).toString('base64');
  fs.mkdirSync(directory,{recursive:true});const temporary=file+'.'+crypto.randomUUID()+'.tmp';
  try{fs.writeFileSync(temporary,JSON.stringify({version:2,encrypted}),{flag:'wx',mode:0o600});fs.renameSync(temporary,file);}
  finally{try{fs.unlinkSync(temporary);}catch{}}
 }
 function read(){
  try{
   const saved=JSON.parse(fs.readFileSync(file,'utf8'));
   if(saved.version===2){if(!available()||typeof saved.encrypted!=='string')return null;const value=JSON.parse(safeStorage.decryptString(Buffer.from(saved.encrypted,'base64')));return typeof value.token==='string'?value:null;}
   // Existing installations keep their session; migrate before making network requests.
   if(typeof saved.token!=='string')return null;
   if(available())write(saved);
   return saved;
  }catch{return null;}
 }
 function clear(){try{fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}}
 return {read,write,clear};
}
module.exports={createSessionStore};
