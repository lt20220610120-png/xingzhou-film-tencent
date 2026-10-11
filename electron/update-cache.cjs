const fs=require('node:fs/promises'),path=require('node:path');
async function pruneUpdateCache(dir,{keep=2,now=Date.now(),protectedFiles=[]}={}){
 let root;try{const stat=await fs.lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink())return;root=await fs.realpath(dir);}catch{return;}
 const protectedSet=new Set(protectedFiles.map(f=>path.resolve(f))),rows=[];
 for(const name of await fs.readdir(root)){
  if(!/^Xingzhou-Film-(?:Tencent-)?Setup-[0-9A-Za-z._-]+\.exe(?:\.[a-f0-9]{64}\.part|\.blockmap)?$/.test(name))continue;
  const file=path.join(root,name),stat=await fs.lstat(file);if(stat.isFile()&&!stat.isSymbolicLink())rows.push({name,file,time:stat.mtimeMs});
 }
 const installers=rows.filter(r=>r.name.endsWith('.exe')).sort((a,b)=>b.time-a.time);
 const retained=new Set([...installers.slice(0,keep).map(r=>r.file),...protectedSet]);
 for(const r of rows){
  if(protectedSet.has(r.file))continue;
  const obsolete=r.name.endsWith('.exe')?!retained.has(r.file):r.name.endsWith('.blockmap')?!retained.has(r.file.slice(0,-9)):now-r.time>7*86400000;
  if(obsolete){const stat=await fs.lstat(r.file);if(stat.isFile()&&!stat.isSymbolicLink())await fs.unlink(r.file);}
 }
}
module.exports={pruneUpdateCache};
