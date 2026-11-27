const {Worker,isMainThread,parentPort}=require('node:worker_threads');
const fs=require('node:fs/promises'),path=require('node:path');
if(!isMainThread){
 const {writeJsonAtomic}=require('./atomic-json.cjs'),arrayCounts=new Map();
 let workspaceCache;
 const readJson=async(file,otherwise)=>{
  try{return JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));}
  catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return otherwise;throw error;}
 };
 async function writeWorkspace(file,directorFile,delta){
  let base=workspaceCache;
  if(base?.file!==file||base.directorFile!==directorFile){
   const primary=await readJson(file,{});
   const secondary=await readJson(directorFile,null);
   const {mergeDirectorSnapshot}=await import('../core/projectStore.js');
   const merged=mergeDirectorSnapshot(primary,Array.isArray(secondary)?secondary:await readJson(directorFile.replace(/\.json$/,'.backup.json'),null));
   const {directorProjects=[],...state}=merged;
   base={file,directorFile,state,projects:directorProjects};
  }
  const state=delta.workspace?{...base.state,...delta.workspace.set}:base.state;
  for(const key of delta.workspace?.remove||[])delete state[key];
  let projects=base.projects;
  if(delta.directors){
   const byId=new Map(projects.map(project=>[project.id,project]));
   for(const project of delta.directors.changed)byId.set(project.id,project);
   projects=delta.directors.order.map(id=>{
    const match=byId.get(id);
    if(!match)throw Error('导演项目保存基线缺失，请重新加载资料');
    return match;
   });
  }
  try{
   await writeJsonAtomic(file,{...state,directorProjects:projects});
   if(delta.directors){
    if(projects.length<base.projects.length){
     try{await fs.copyFile(directorFile,directorFile.replace(/\.json$/,'.backup.json'));}
     catch(error){if(error.code!=='ENOENT')throw error;}
    }
    await writeJsonAtomic(directorFile,projects);
    arrayCounts.delete(directorFile);
   }
   workspaceCache={file,directorFile,state,projects};
  }catch(error){workspaceCache=null;throw error;}
 }
 const previousArray=async file=>{
  const stat=await fs.stat(file),cached=arrayCounts.get(file);
  if(cached&&cached.size===stat.size&&cached.mtime===stat.mtimeMs)return {length:cached.length};
  const previous=JSON.parse(await fs.readFile(file,'utf8'));return Array.isArray(previous)?{length:previous.length}:null;
 };
 parentPort.on('message',async({id,file,data,backup,epochBackup,directorFile})=>{try{
  if(directorFile){await writeWorkspace(file,directorFile,data);parentPort.postMessage({id,ok:true});return;}
  if(workspaceCache&&(file===workspaceCache.file||file===workspaceCache.directorFile))workspaceCache=null;
  await fs.mkdir(path.dirname(file),{recursive:true});
  if(backup){try{const previous=await previousArray(file);if(previous&&previous.length&&data.length<previous.length)await fs.copyFile(file,file.replace(/\.json$/,'.backup.json'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}}
  if(epochBackup){try{const previous=JSON.parse(await fs.readFile(file,'utf8'));if(previous.state&&(previous.epoch!==data.epoch||previous.protocol!==data.protocol)){const digest=require('node:crypto').createHash('sha256').update(previous.state).digest('hex');await fs.copyFile(file,file+'.'+digest+'.baseline-backup');}}catch(e){if(e.code!=='ENOENT')throw e;}}
  await writeJsonAtomic(file,data);
  if(Array.isArray(data)){const stat=await fs.stat(file);arrayCounts.set(file,{size:stat.size,mtime:stat.mtimeMs,length:data.length});}
  parentPort.postMessage({id,ok:true});
 }catch(e){parentPort.postMessage({id,error:e.message,code:e.code});}});
}else{
 let worker=null,seq=0,inFlight=0;const pending=new Map();let chain=Promise.resolve();
 function writeStateAsync(file,data,{backup=false,epochBackup=false,directorFile}={}){const work=chain.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
  if(!worker){const instance=new Worker(__filename);worker=instance;
   const failed=error=>{for(const [id,p] of pending)if(p.instance===instance){p.reject(error);pending.delete(id);}if(worker===instance)worker=null;};
   instance.on('message',reply=>{const entry=pending.get(reply.id);if(!entry||entry.instance!==instance)return;pending.delete(reply.id);reply.error?entry.reject(Object.assign(new Error(reply.error),{code:reply.code})):entry.resolve(true);if(![...pending.values()].some(p=>p.instance===instance))instance.unref();});
   instance.on('error',failed);instance.on('exit',()=>{if([...pending.values()].some(p=>p.instance===instance))failed(Error('后台保存线程已停止'));if(worker===instance)worker=null;});instance.unref();
  }
  const id=++seq;pending.set(id,{resolve,reject,instance:worker});worker.ref();
  try{worker.postMessage({id,file,data,backup,epochBackup,directorFile});}catch(error){pending.delete(id);if(!pending.size)worker.unref();reject(error);}
 }));inFlight++;chain=work;work.then(()=>inFlight--,()=>inFlight--);return work;}
 async function flushStateWrites(){let observed;while(inFlight&&observed!==chain){observed=chain;await observed;}}
 module.exports={writeStateAsync,flushStateWrites,hasPendingStateWrites:()=>inFlight>0};
}
