const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const exists=async p=>{try{await fs.lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const inside=(root,p)=>{const rel=path.relative(root,p);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
function rewritePaths(value,source,target){
 if(typeof value==='string'){
  if(value.startsWith('xzmedia:///')){try{const p=decodeURIComponent(value.slice(11));if(inside(source,p))return 'xzmedia:///'+encodeURIComponent(path.join(target,path.relative(source,p)));}catch{}return value;}
  return path.isAbsolute(value)&&inside(source,path.resolve(value))?path.join(target,path.relative(source,value)):value;
 }
 if(Array.isArray(value))return value.map(v=>rewritePaths(v,source,target));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewritePaths(v,source,target)]));
 return value;
}
async function readState(file){try{const state=JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));if(!state||typeof state!=='object'||Array.isArray(state))throw Error();return state;}catch{throw new Error('资料文件无法解析，未切换资料目录');}}
async function prepareDataDirectory(source,target,currentState,{deferCommit=false}={}){
 const requestedSource=path.resolve(source),requestedTarget=path.resolve(target);
 if(requestedSource===requestedTarget)return {mode:'same'};
 if(inside(requestedSource,requestedTarget)||inside(requestedTarget,requestedSource))throw new Error('资料目录不能相互嵌套');
 const sourceStat=await fs.lstat(requestedSource);if(sourceStat.isSymbolicLink())throw new Error('资料目录不能使用符号链接');
 const old=await fs.realpath(requestedSource);await fs.mkdir(requestedTarget,{recursive:true});
 const targetStat=await fs.lstat(requestedTarget);if(targetStat.isSymbolicLink())throw new Error('资料目录不能使用符号链接');
 const next=await fs.realpath(requestedTarget);
 if(old===next)return {mode:'same'};
 if(inside(old,next)||inside(next,old))throw new Error('资料目录不能相互嵌套');
 // An existing destination is another workspace, not a merge destination.
 if(await exists(path.join(next,'xingzhou-data.json'))){await readState(path.join(next,'xingzhou-data.json'));return {mode:'existing'};}
 // Copy the entire configured data directory, including user-created reference
 // folders. Rewriting every in-root path is safe only when its files follow.
 const entries=await fs.readdir(old);
 for(const name of entries)if(await exists(path.join(next,name)))throw new Error('目标目录已有部分资料，请选择空目录，避免覆盖现有文件');
 const stage=path.join(next,'.xz-migration-'+crypto.randomUUID()),created=[],sources=[];let deferred=false,settled=false;
 await fs.mkdir(stage);
 try{
  async function copy(from,to){const stat=await fs.lstat(from);if(stat.isSymbolicLink())throw new Error('资料含符号链接，未切换目录');
   if(stat.isDirectory()){await fs.mkdir(to);for(const name of await fs.readdir(from))await copy(path.join(from,name),path.join(to,name));return;}
   if(!stat.isFile())throw new Error('资料文件类型异常，未切换目录');
   sources.push({file:from,size:stat.size,time:stat.mtimeMs});
   if(from.endsWith('.json')){let value;try{value=JSON.parse((await fs.readFile(from,'utf8')).replace(/^\uFEFF/,''));}catch{throw new Error('资料文件无法解析，未切换资料目录');}await fs.writeFile(to,JSON.stringify(rewritePaths(value,old,next)),'utf8');}
   else {await fs.copyFile(from,to);const statAfter=await fs.stat(from);if(statAfter.size!==stat.size||statAfter.mtimeMs!==stat.mtimeMs||(await fs.stat(to)).size!==stat.size)throw new Error('素材在迁移时发生变化，请停止生成后重试');}
  }
  for(const name of entries)if(await exists(path.join(old,name)))await copy(path.join(old,name),path.join(stage,name));
  if(!await exists(path.join(stage,'xingzhou-data.json')))await fs.writeFile(path.join(stage,'xingzhou-data.json'),JSON.stringify(rewritePaths(currentState||{},old,next)),'utf8');
  await readState(path.join(stage,'xingzhou-data.json'));
  for(const item of sources){const s=await fs.stat(item.file);if(s.size!==item.size||s.mtimeMs!==item.time)throw new Error('资料在迁移时发生变化，请停止编辑或生成后重试');}
  async function commit(){
   if(settled)throw new Error('迁移已经提交或取消');
   try{
    for(const item of sources){const s=await fs.stat(item.file);if(s.size!==item.size||s.mtimeMs!==item.time)throw new Error('资料在迁移时发生变化，请停止编辑或生成后重试');}
    // Commit the main state last. Cancelled preparation never becomes a workspace.
    const names=(await fs.readdir(stage)).sort((a,b)=>a==='xingzhou-data.json'?1:b==='xingzhou-data.json'?-1:a.localeCompare(b));
    for(const name of names){const dest=path.join(next,name);if(await exists(dest))throw new Error('目标目录内容已变化，迁移停止');await fs.rename(path.join(stage,name),dest);created.push(dest);}
   }catch(e){for(const dest of created.reverse())if(inside(next,dest))await fs.rm(dest,{recursive:true,force:true});throw e;}
   finally{settled=true;if(inside(next,stage))await fs.rm(stage,{recursive:true,force:true});}
  }
  async function cancel(){if(settled)return;settled=true;if(inside(next,stage))await fs.rm(stage,{recursive:true,force:true});}
  if(deferCommit){deferred=true;return {mode:'prepared',commit,cancel};}
  await commit();return {mode:'migrated'};
 }catch(e){for(const dest of created.reverse())if(inside(next,dest))await fs.rm(dest,{recursive:true,force:true});throw e;}
 finally{if(!deferred&&inside(next,stage))await fs.rm(stage,{recursive:true,force:true});}
}
module.exports={prepareDataDirectory,rewritePaths};
