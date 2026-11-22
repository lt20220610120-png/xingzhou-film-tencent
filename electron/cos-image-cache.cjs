const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const COS_HOST = 'xingzhou-media-test-1469762028.cos.ap-guangzhou.myqcloud.com';
const AUTH_PARAMS = new Set(['q-sign-algorithm','q-ak','q-sign-time','q-key-time','q-header-list','q-url-param-list','q-signature']);
const IMAGE_EXTENSIONS = 'png|jpe?g|webp|gif';
const AUDIO_EXTENSIONS = 'wav|mp3|m4a|aac|ogg|flac';
const CACHE_EXTENSIONS = IMAGE_EXTENSIONS + '|' + AUDIO_EXTENSIONS;
const CACHE_MAX_BYTES = 24 * 1024 ** 3;
const CACHE_MAX_AGE = 90 * 86400000;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const projectPath = new RegExp('^/projects/[\\w-]+/(?:image/[\\w.-]+\\.(?:'+IMAGE_EXTENSIONS+')|audio/[\\w.-]+\\.(?:'+AUDIO_EXTENSIONS+'))$', 'i');
const entryName = new RegExp('^[a-f0-9]{64}\\.(?:'+CACHE_EXTENSIONS+')$');

function projectObject(address) {
  try {
    const url = new URL(address);
    if (url.protocol === 'https:' && url.host === COS_HOST && !url.username && !url.password
      && !url.hash && projectPath.test(url.pathname)) return url;
  } catch {}
  return null;
}

function cacheIdentity(address, scope, now = Date.now()) {
  const url = projectObject(address);
  if (!scope || !url) return null;
  const [start,end] = (url.searchParams.get('q-key-time') || '').split(';').map(Number);
  if (!url.searchParams.get('q-signature') || !Number.isFinite(start) || !Number.isFinite(end)
    || start * 1000 > now || end * 1000 <= now
    || [...url.searchParams.keys()].some(key=>!AUTH_PARAMS.has(key))) return null;
  return objectIdentity(url, scope);
}
const objectIdentity = (url, scope) => hash(scope+'\n'+url.origin+url.pathname) + path.extname(url.pathname).toLowerCase();
const mediaMime = /^(?:image\/(?:png|jpeg|webp|gif)|audio\/(?:wav|x-wav|wave|mpeg|mp3|mp4|aac|x-aac|ogg|flac|x-flac))$/;

function createCosImageCache({directory,maxBytes=CACHE_MAX_BYTES,maxEntryBytes=64*1024*1024,maxAgeMs=CACHE_MAX_AGE,onRead=()=>{}}) {
  const pending = new Map();
  let entries, total = 0;
  const remove = file => { for (const name of [file,file+'.json']) { try { fs.unlinkSync(name); } catch {} } };
  const remember = (file, size, time) => {
    if (!entries) return;
    total += size - (entries.get(file)?.size || 0);
    if (size) entries.set(file,{file,size,time});
    else entries.delete(file);
  };
  const prune = currentFile => {
    if (!entries) {
      entries = new Map();
      for (const name of fs.readdirSync(directory)) {
        if (!entryName.test(name)) continue;
        const file = path.join(directory,name);
        try {
          const stat = fs.lstatSync(file);
          if (!stat.isFile()) continue;
          if (Date.now()-stat.mtimeMs > maxAgeMs || !fs.existsSync(file+'.json')) { remove(file); continue; }
          remember(file,stat.size,stat.mtimeMs);
        } catch {}
      }
    }
    if (total <= maxBytes) return;
    for (const entry of [...entries.values()].sort((a,b)=>a.time-b.time)) {
      if (total <= maxBytes) break;
      if (entry.file === currentFile) continue;
      remove(entry.file);
      remember(entry.file,0,0);
    }
  };
  const peekFile = (identity, scope, withBytes) => {
    if (!identity) return null;
    const filePath = path.join(directory,identity);
    try {
      const stat = fs.lstatSync(filePath);
      if (!stat.isFile() || stat.size < 1 || stat.size > maxEntryBytes || Date.now()-stat.mtimeMs > maxAgeMs) return null;
      const metaFile = filePath+'.json';
      const metaStat = fs.lstatSync(metaFile);
      if (!metaStat.isFile() || metaStat.size > 1024) return null;
      const meta = JSON.parse(fs.readFileSync(metaFile,'utf8'));
      if (!mediaMime.test(meta.mime) || (meta.scope && meta.scope !== hash(scope))) return null;
      const bytes = withBytes || !meta.scope ? fs.readFileSync(filePath) : null;
      if (bytes && meta.sha256 !== hash(bytes)) return null;
      if (!meta.scope) fs.writeFileSync(metaFile,JSON.stringify({...meta,scope:hash(scope)}));
      const now = new Date();
      fs.utimesSync(filePath,now,now);
      remember(filePath,stat.size,+now);
      return {filePath,mime:meta.mime,...(withBytes?{bytes}:{})};
    } catch { return null; }
  };
  const write = (identity, scope, result) => {
    if (!identity || !result?.bytes?.length || result.bytes.length > Math.min(maxEntryBytes,maxBytes)
      || !mediaMime.test(result.mime)) return result;
    const filePath = path.join(directory,identity);
    const tmp = filePath+'.'+crypto.randomUUID()+'.tmp';
    try {
      fs.mkdirSync(directory,{recursive:true});
      if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) return result;
      fs.writeFileSync(tmp,result.bytes);
      fs.writeFileSync(tmp+'.json',JSON.stringify({mime:result.mime,sha256:hash(result.bytes),scope:hash(scope)}));
      fs.renameSync(tmp,filePath);
      fs.renameSync(tmp+'.json',filePath+'.json');
      remember(filePath,result.bytes.length,Date.now());
      prune(filePath);
      return {...result,filePath};
    } catch {
      remove(tmp);
      try { fs.unlinkSync(tmp+'.json'); } catch {}
      return result;
    }
  };
  const read = async (address,scope,load,{signal}={}) => {
    signal?.throwIfAborted();
    const identity = cacheIdentity(address,scope);
    if (!identity) return load();
    const local = peekFile(identity,scope,true);
    if (local) { onRead('cacheHit',local.bytes.length); return local; }
    // A cancellable consumer owns its network request. It can still use any
    // complete local copy and will cache its own successful response.
    if (!signal && pending.has(identity)) return pending.get(identity);
    const work = (async()=>{
      const result = await load();
      signal?.throwIfAborted();
      return write(identity,scope,result);
    })();
    if (signal) return work;
    pending.set(identity,work);
    try { return await work; } finally { pending.delete(identity); }
  };
  return {
    read,
    peek: (address,scope)=>peekFile(cacheIdentity(address,scope),scope,false),
    seed(address,scope,result) {
      const url = projectObject(address);
      const stored=write(scope && url && !url.search ? objectIdentity(url,scope) : null,scope,result);
      if(stored?.filePath) onRead('uploadSeed',stored.bytes.length);
      return stored;
    },
  };
}
module.exports={createCosImageCache,cacheIdentity,COS_HOST,CACHE_EXTENSIONS,CACHE_MAX_BYTES,CACHE_MAX_AGE};
