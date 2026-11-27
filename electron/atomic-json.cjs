const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const delays=[15,30,60,120,240,480,960],retryable=e=>['EPERM','EBUSY','EACCES'].includes(e.code);
async function renameWithRetry(from,to,{rename=fsp.rename,sleep=(ms,signal)=>require('node:timers/promises').setTimeout(ms,undefined,{signal}),signal}={}){
 for(let attempt=0;;attempt++){
  signal?.throwIfAborted();
  try{return await rename(from,to);}catch(e){if(!retryable(e)||attempt>=delays.length)throw e;await sleep(delays[attempt],signal);}
 }
}
function renameWithRetrySync(from,to,{rename=fs.renameSync,sleep}={}){
 for(let attempt=0;;attempt++){
  try{return rename(from,to);}
  catch(error){
   if(!retryable(error)||attempt>=delays.length)throw error;
   if(sleep)sleep(delays[attempt]);else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,delays[attempt]);
  }
 }
}
function atomicWriteSync(file,bytes,retryOptions){
 const temporary=file+'.'+process.pid+'.'+crypto.randomUUID()+'.writing';
 fs.mkdirSync(path.dirname(file),{recursive:true});
 let handle;
 try{
  handle=fs.openSync(temporary,'wx',0o600);
  fs.writeFileSync(handle,bytes);fs.fsyncSync(handle);fs.closeSync(handle);handle=undefined;
  renameWithRetrySync(temporary,file,retryOptions);
 }finally{
  if(handle!==undefined)try{fs.closeSync(handle);}catch{}
  try{fs.unlinkSync(temporary);}catch{}
 }
}
// Serialize containers incrementally: never materialize a second library-sized
// JSON string and UTF-8 buffer in addition to the already cloned IPC state.
function* jsonTokens(value,key='',ancestors=new Set()){
 if(value&&typeof value.toJSON==='function')value=value.toJSON(key);
 if(value===null||typeof value!=='object'){const text=JSON.stringify(value);yield text===undefined?'null':text;return;}
 if(ancestors.has(value))throw new TypeError('Converting circular structure to JSON');ancestors.add(value);
 if(Array.isArray(value)){yield '[';for(let i=0;i<value.length;i++){if(i)yield ',';yield* jsonTokens(value[i],String(i),ancestors);}yield ']';}
 else{yield '{';let first=true;for(const k of Object.keys(value)){const v=value[k];if(v===undefined||typeof v==='function'||typeof v==='symbol')continue;if(!first)yield ',';first=false;yield JSON.stringify(k)+':';yield* jsonTokens(v,k,ancestors);}yield '}';}
 ancestors.delete(value);
}
async function writeJsonAtomic(file,data,{rename,sleep}={}){
 const temporary=file+'.'+process.pid+'.'+crypto.randomUUID()+'.writing';let handle;
 await fsp.mkdir(path.dirname(file),{recursive:true});
 try{
  handle=await fsp.open(temporary,'wx',0o600);let chunk='';
  for(const token of jsonTokens(data)){chunk+=token;if(chunk.length>=65536){await handle.writeFile(chunk,'utf8');chunk='';}}
  if(chunk)await handle.writeFile(chunk,'utf8');await handle.sync();await handle.close();handle=null;
  await renameWithRetry(temporary,file,{rename,sleep});
 }finally{if(handle)await handle.close().catch(()=>{});await fsp.unlink(temporary).catch(()=>{});}
}
module.exports={writeJsonAtomic,atomicWriteSync,renameWithRetry,renameWithRetrySync,jsonTokens};
