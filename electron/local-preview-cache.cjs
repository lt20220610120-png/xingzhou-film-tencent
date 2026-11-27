const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {cacheIdentity,CACHE_MAX_AGE}=require('./cos-image-cache.cjs');
function createLocalPreviewCache({directory,maxBytes=512*1024*1024,maxAgeMs=CACHE_MAX_AGE}) {
 const filename=(url,account)=>{
  const identity=cacheIdentity(url,'preview-v1:'+account);
  return account&&identity?path.join(typeof directory==='function'?directory():directory,identity.replace(/\.[^.]+$/,'.webp')):null;
 };
 const local=file=>'xzmedia://local/'+encodeURIComponent(file);
 const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 let cache;
 function directoryCache(dir){
  if(cache?.dir!==dir)cache={dir,entries:new Map(),bytes:0,ready:false,tail:Promise.resolve(),nextSweep:0};
  return cache;
 }
 async function initialize(index){
  if(index.ready)return;
  await fs.mkdir(index.dir,{recursive:true});
  const dir=await fs.opendir(index.dir);
  const entries=new Map();
  for await(const entry of dir)if(entry.isFile()&&/^[a-f0-9]{64}\.webp$/.test(entry.name)){
   const file=path.join(index.dir,entry.name),stat=await fs.stat(file).catch(()=>null);
   if(stat)entries.set(file,{size:stat.size,time:stat.mtimeMs});
  }
  index.entries=entries;
  index.bytes=[...entries.values()].reduce((sum,entry)=>sum+entry.size,0);
  index.ready=true;
 }
 async function prune(index,preserved,time){
  if(index.bytes<=maxBytes&&time<index.nextSweep)return;
  index.nextSweep=time+60*1000;
  for(const [file,entry] of [...index.entries].sort((a,b)=>a[1].time-b[1].time)){
   if(file===preserved||(index.bytes<=maxBytes&&time-entry.time<=maxAgeMs))continue;
   try {await fs.unlink(file);}catch(error){if(error.code!=='ENOENT')continue;}
   await fs.unlink(file+'.sha256').catch(()=>{});
   index.entries.delete(file);
   index.bytes-=entry.size;
  }
 }
 return {
  async get(url,account) {
   const file=filename(url,account);if(!file)return null;
   try {
    const stat=await fs.stat(file);if(stat.size>2*1024*1024 || Date.now()-stat.mtimeMs>maxAgeMs)return null;
    const bytes=await fs.readFile(file),digest=await fs.readFile(file+'.sha256','utf8');
    if(hash(bytes)!==digest)return null;
    const time=Date.now();
    await fs.utimes(file,new Date(time),new Date(time)).catch(()=>{});
    const entry=cache?.entries.get(file);
    if(entry)entry.time=time;
    return local(file);
   } catch {return null;}
  },
  async put(url,account,dataUrl) {
   const file=filename(url,account);
   if(!file || !/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(dataUrl||'') || dataUrl.length>2*1024*1024)return null;
   const index=directoryCache(path.dirname(file)),bytes=Buffer.from(dataUrl.split(',')[1],'base64');
   if(bytes.length>maxBytes)return null;
   const next=index.tail.then(async()=>{
    await initialize(index);
    await fs.writeFile(file,bytes);
    const time=Date.now();
    index.bytes+=bytes.length-(index.entries.get(file)?.size||0);
    index.entries.set(file,{size:bytes.length,time});
    await fs.writeFile(file+'.sha256',hash(bytes));
    await prune(index,file,time);
    return local(file);
   }).catch(()=>null);
   index.tail=next;
   return next;
  },
 };
}
module.exports={createLocalPreviewCache};
