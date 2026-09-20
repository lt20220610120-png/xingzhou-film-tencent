const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const COS_HOST = 'xingzhou-media-test-1469762028.cos.ap-guangzhou.myqcloud.com';
const AUTH_PARAMS = new Set(['q-sign-algorithm','q-ak','q-sign-time','q-key-time','q-header-list','q-url-param-list','q-signature']);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

// Only original images in this app's append-only COS object namespace qualify.
// Never strip arbitrary query parameters or cache third-party/unsigned URLs.
function cacheIdentity(address, scope, now = Date.now()) {
  try {
    const url = new URL(address);
    const [start,end] = (url.searchParams.get('q-key-time') || '').split(';').map(Number);
    if (!scope || url.protocol !== 'https:' || url.host !== COS_HOST || url.username || url.password
      || !url.searchParams.get('q-signature') || !Number.isFinite(start) || !Number.isFinite(end)
      || start * 1000 > now || end * 1000 <= now
      || [...url.searchParams.keys()].some(key=>!AUTH_PARAMS.has(key))
      || !/^\/projects\/[^/]+\/image\/[^/]+\.(png|jpe?g|webp|gif)$/i.test(url.pathname)) return null;
    return hash(`${scope}\n${url.origin}${url.pathname}`) + path.extname(url.pathname).toLowerCase();
  } catch { return null; }
}

function createCosImageCache({directory,maxBytes=512*1024*1024,maxEntryBytes=32*1024*1024,maxAgeMs=30*86400000}) {
  const pending = new Map();
  const remove = file => { for (const name of [file,file+'.json']) { try { fs.unlinkSync(name); } catch {} } };
  const prune = currentFile => {
    const entries = [];
    for (const name of fs.readdirSync(directory)) {
      if (!/^[a-f0-9]{64}\.(png|jpe?g|webp|gif)$/.test(name)) continue;
      const file = path.join(directory,name), stat = fs.statSync(file);
      if (Date.now()-stat.mtimeMs > maxAgeMs || !fs.existsSync(file+'.json')) {remove(file);continue;}
      entries.push({file,size:stat.size,time:stat.mtimeMs});
    }
    let total = entries.reduce((sum,e)=>sum+e.size,0);
    for (const entry of entries.filter(e=>e.file!==currentFile).sort((a,b)=>a.time-b.time)) {
      if(total<=maxBytes)break;
      remove(entry.file);total-=entry.size;
    }
  };
  const read = async (address,scope,load) => {
    const identity = cacheIdentity(address,scope);
    if(!identity)return load();
    if(pending.has(identity))return pending.get(identity);
    const work = (async()=>{
      const filePath=path.join(directory,identity);
      try {
        const meta=JSON.parse(fs.readFileSync(filePath+'.json','utf8'));
        const stat=fs.statSync(filePath);
        if(stat.size>0 && stat.size<=maxEntryBytes && Date.now()-stat.mtimeMs<=maxAgeMs) {
          const bytes=fs.readFileSync(filePath);
          if(meta.sha256===hash(bytes) && /^image\/(png|jpeg|webp|gif)$/.test(meta.mime)) {
            fs.utimesSync(filePath,new Date(),new Date());
            return {bytes,mime:meta.mime,filePath};
          }
        }
      } catch {}
      remove(filePath);
      const result=await load();
      if(!result.bytes?.length || result.bytes.length>Math.min(maxEntryBytes,maxBytes) || !/^image\/(png|jpeg|webp|gif)$/.test(result.mime))return result;
      // Cache failures must never turn a successful download into a failed export.
      try {
        fs.mkdirSync(directory,{recursive:true});
        fs.writeFileSync(filePath,result.bytes);
        fs.writeFileSync(filePath+'.json',JSON.stringify({mime:result.mime,sha256:hash(result.bytes)}));
        prune(filePath);
        return {...result,filePath};
      } catch {remove(filePath);return result;}
    })().finally(()=>pending.delete(identity));
    pending.set(identity,work);
    return work;
  };
  return {read};
}
module.exports={createCosImageCache,cacheIdentity,COS_HOST};
