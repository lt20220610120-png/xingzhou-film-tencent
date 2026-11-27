const fs=require('node:fs');const path=require('node:path');
const {atomicWriteSync}=require('./atomic-json.cjs');
const {isDeepStrictEqual}=require('node:util');
function createSessionStore(directory,safeStorage) {
 const file=path.join(directory,'cloud-session.json');
 const available=()=>safeStorage?.isEncryptionAvailable()===true;
 let cached;
 const stamp=()=>{const s=fs.lstatSync(file,{bigint:true});if(!s.isFile())throw Error('会话文件无效');return `${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;};
 function remember(value,version){
  const immutable=object=>{if(object&&typeof object==='object'){for(const item of Object.values(object))immutable(item);Object.freeze(object);}return object;};
  cached={stamp:version,value:immutable(structuredClone(value))};
  return cached.value;
 }
 function write(value){
  // Never fall back to plaintext if the operating system key provider is unavailable.
  if(!available())throw new Error('系统凭证加密暂不可用，登录信息未保存，请稍后重试');
  if(cached&&isDeepStrictEqual(cached.value,value)){
   try{if(stamp()===cached.stamp)return;}catch{}
  }
  const encrypted=safeStorage.encryptString(JSON.stringify(value)).toString('base64');
  atomicWriteSync(file,JSON.stringify({version:2,encrypted}));remember(value,stamp());
 }
 function read(){
  try{
   const version=stamp();
   if(cached&&cached.stamp===version&&available())return cached.value;
   cached=undefined;
   const saved=JSON.parse(fs.readFileSync(file,'utf8'));
   if(saved.version===2){if(!available()||typeof saved.encrypted!=='string')return null;const value=JSON.parse(safeStorage.decryptString(Buffer.from(saved.encrypted,'base64')));return typeof value.token==='string'&&stamp()===version?remember(value,version):null;}
   // Existing installations keep their session; migrate before making network requests.
   if(typeof saved.token!=='string')return null;
   if(available()){write(saved);return cached.value;}
   return saved;
  }catch{cached=undefined;return null;}
 }
 function clear(){cached=undefined;try{fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}}
 return {read,write,clear};
}
module.exports={createSessionStore};
