const fs=require('node:fs/promises'),path=require('node:path');
async function pruneStorageCaches(dataDir,{now=Date.now()}={}){
 let bytesFreed=0;
 for(const [folder,maxBytes,extension,sidecar] of [['.cloud-image-cache',512*1024*1024,'png|jpe?g|webp|gif','.json'],['.cloud-preview-cache',128*1024*1024,'webp','.sha256']]){
  const directory=path.join(dataDir,folder);let root;
  try{const s=await fs.lstat(directory);if(!s.isDirectory()||s.isSymbolicLink())continue;root=await fs.realpath(directory);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  const pattern=new RegExp(`^[a-f0-9]{64}\\.(${extension})$`),rows=[];
  for(const name of await fs.readdir(root))if(pattern.test(name)){try{const file=path.join(root,name),s=await fs.lstat(file);if(s.isFile()&&!s.isSymbolicLink())rows.push({file,size:s.size,time:s.mtimeMs});}catch(e){if(e.code!=='ENOENT')throw e;}}
  let total=rows.reduce((n,r)=>n+r.size,0);
  for(const row of rows.sort((a,b)=>a.time-b.time)){
   if(total<=maxBytes&&now-row.time<=30*86400000)continue;
   // A cache read can touch a file while the scan is pending.
   try{const current=await fs.lstat(row.file);if(!current.isFile()||current.isSymbolicLink()||current.mtimeMs!==row.time)continue;await fs.unlink(row.file);bytesFreed+=current.size;total-=row.size;const meta=row.file+sidecar;const s=await fs.lstat(meta).catch(()=>null);if(s?.isFile()&&!s.isSymbolicLink()){await fs.unlink(meta);bytesFreed+=s.size;}}catch(e){if(!['ENOENT','EPERM','EBUSY'].includes(e.code))throw e;}
  }
 }
 return {bytesFreed};
}
module.exports={pruneStorageCaches};
