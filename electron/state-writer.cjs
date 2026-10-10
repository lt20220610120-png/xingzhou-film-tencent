const {Worker,isMainThread,parentPort}=require('node:worker_threads');
const fs=require('node:fs/promises'),path=require('node:path');
if(!isMainThread){parentPort.on('message',async({id,file,data,backup})=>{try{
 await fs.mkdir(path.dirname(file),{recursive:true});
 if(backup){try{const previous=JSON.parse(await fs.readFile(file,'utf8'));if(Array.isArray(previous)&&previous.length&&data.length<previous.length)await fs.copyFile(file,file.replace(/\.json$/,'.backup.json'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}}
 const temporary=file+'.writing';await fs.writeFile(temporary,JSON.stringify(data),'utf8');await fs.rename(temporary,file);parentPort.postMessage({id,ok:true});
 }catch(e){parentPort.postMessage({id,error:e.message});}});}
else{
 let worker=null,seq=0;const pending=new Map();let chain=Promise.resolve();
 function writeStateAsync(file,data,{backup=false}={}){const work=chain.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
  if(!worker){const instance=new Worker(__filename);worker=instance;
   const failed=error=>{for(const [id,p] of pending)if(p.instance===instance){p.reject(error);pending.delete(id);}if(worker===instance)worker=null;};
   instance.on('message',reply=>{const entry=pending.get(reply.id);if(!entry||entry.instance!==instance)return;pending.delete(reply.id);reply.error?entry.reject(new Error(reply.error)):entry.resolve(true);if(![...pending.values()].some(p=>p.instance===instance))instance.unref();});
   instance.on('error',failed);instance.on('exit',code=>{if([...pending.values()].some(p=>p.instance===instance))failed(Error('后台保存线程已停止'));if(worker===instance)worker=null;});instance.unref();
  }
  const id=++seq;pending.set(id,{resolve,reject,instance:worker});worker.ref();worker.postMessage({id,file,data,backup});
 }));chain=work;return work;}
 async function flushStateWrites(){let observed;do{observed=chain;await observed;}while(chain!==observed);}
 module.exports={writeStateAsync,flushStateWrites,hasPendingStateWrites:()=>pending.size>0};
}
