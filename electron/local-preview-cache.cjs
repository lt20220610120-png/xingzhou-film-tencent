const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {cacheIdentity}=require('./cos-image-cache.cjs');
function createLocalPreviewCache({directory,maxBytes=128*1024*1024,maxAgeMs=30*86400000}) {
 const filename=(url,account)=>{
  const identity=cacheIdentity(url,'preview-v1:'+account);
  return account&&identity?path.join(typeof directory==='function'?directory():directory,identity.replace(/\.[^.]+$/,'.webp')):null;
 };
 const local=file=>'xzmedia:///'+encodeURIComponent(file);
 const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 return {
  async get(url,account) {
   const file=filename(url,account);if(!file)return null;
   try {
    const stat=await fs.stat(file);if(stat.size>2*1024*1024 || Date.now()-stat.mtimeMs>maxAgeMs)return null;
    const bytes=await fs.readFile(file),digest=await fs.readFile(file+'.sha256','utf8');
    if(hash(bytes)!==digest)return null;
    await fs.utimes(file,new Date(),new Date());return local(file);
   } catch {return null;}
  },
  async put(url,account,dataUrl) {
   const file=filename(url,account);
   if(!file || !/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(dataUrl||'') || dataUrl.length>2*1024*1024)return null;
   try {
    const dir=path.dirname(file),bytes=Buffer.from(dataUrl.split(',')[1],'base64');
    await fs.mkdir(dir,{recursive:true});await fs.writeFile(file,bytes);await fs.writeFile(file+'.sha256',hash(bytes));
    const entries=[];
    for(const name of await fs.readdir(dir))if(/^[a-f0-9]{64}\.webp$/.test(name)){
     try {const stat=await fs.stat(path.join(dir,name));entries.push({file:path.join(dir,name),size:stat.size,time:stat.mtimeMs});}catch{}
    }
    let total=entries.reduce((sum,e)=>sum+e.size,0);
    for(const entry of entries.sort((a,b)=>a.time-b.time)){
     if(entry.file===file || (total<=maxBytes && Date.now()-entry.time<=maxAgeMs))continue;
     await fs.unlink(entry.file).catch(()=>{});await fs.unlink(entry.file+'.sha256').catch(()=>{});total-=entry.size;
    }
    return local(file);
   } catch {return null;}
  },
 };
}
module.exports={createLocalPreviewCache};
