const {Worker,isMainThread,parentPort}=require('node:worker_threads');
const fs=require('node:fs/promises'),path=require('node:path');
if(!isMainThread){
 const {writeJsonAtomic}=require('./atomic-json.cjs'),arrayCounts=new Map();
 const previousArray=async file=>{
  const stat=await fs.stat(file),cached=arrayCounts.get(file);
  if(cached&&cached.size===stat.size&&cached.mtime===stat.mtimeMs)return {length:cached.length};
  const previous=JSON.parse(await fs.readFile(file,'utf8'));return Array.isArray(previous)?{length:previous.length}:null;
 };
 parentPort.on('message',async({id,file,data,backup,epochBackup})=>{try{
  await fs.mkdir(path.dirname(file),{recursive:true});
  if(backup){try{const previous=await previousArray(file);if(previous&&previous.length&&data.length<previous.length)await fs.copyFile(file,file.replace(/\.json$/,'.backup.json'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}}
  if(epochBackup){try{const previous=JSON.parse(await fs.readFile(file,'utf8'));if(previous.state&&(previous.epoch!==data.epoch||previous.protocol!==data.protocol)){const digest=require('node:crypto').createHash('sha256').update(previous.state).digest('hex');await fs.copyFile(file,file+'.'+digest+'.baseline-backup');}}catch(e){if(e.code!=='ENOENT')throw e;}}
  await writeJsonAtomic(file,data);
  if(Array.isArray(data)){const stat=await fs.stat(file);arrayCounts.set(file,{size:stat.size,mtime:stat.mtimeMs,length:data.length});}
  parentPort.postMessage({id,ok:true});
 }catch(e){parentPort.postMessage({id,error:e.message,code:e.code});}});
}else{
 let worker=null,seq=0;const pending=new Map();let chain=Promise.resolve();
 function writeStateAsync(file,data,{backup=false,epochBackup=false}={}){const work=chain.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
  if(!worker){const instance=new Worker(__filename);worker=instance;
   const failed=error=>{for(const [id,p] of pending)if(p.instance===instance){p.reject(error);pending.delete(id);}if(worker===instance)worker=null;};
   instance.on('message',reply=>{const entry=pending.get(reply.id);if(!entry||entry.instance!==instance)return;pending.delete(reply.id);reply.error?entry.reject(Object.assign(new Error(reply.error),{code:reply.code})):entry.resolve(true);if(![...pending.values()].some(p=>p.instance===instance))instance.unref();});
   instance.on('error',failed);instance.on('exit',()=>{if([...pending.values()].some(p=>p.instance===instance))failed(Error('后台保存线程已停止'));if(worker===instance)worker=null;});instance.unref();
  }
  const id=++seq;pending.set(id,{resolve,reject,instance:worker});worker.ref();
  try{worker.postMessage({id,file,data,backup,epochBackup});}catch(error){pending.delete(id);if(!pending.size)worker.unref();reject(error);}
 }));chain=work;return work;}
 async function flushStateWrites(){let observed;do{observed=chain;await observed;}while(chain!==observed);}
 module.exports={writeStateAsync,flushStateWrites,hasPendingStateWrites:()=>pending.size>0};
}
