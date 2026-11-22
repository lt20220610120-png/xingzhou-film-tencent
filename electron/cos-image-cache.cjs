const fs = require('node:fs/promises');
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
const hashBytes=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
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
  let entries,total=0,writeTail=Promise.resolve();
  const remove=async file=>{await Promise.all([file,file+'.json'].map(name=>fs.unlink(name).catch(()=>{})));};
  const remember = (file, size, time) => {
    if (!entries) return;
    total += size - (entries.get(file)?.size || 0);
    if (size) entries.set(file,{file,size,time});
    else entries.delete(file);
  };
  const prune = async currentFile => {
    if (!entries) {
      entries = new Map();
      for (const name of await fs.readdir(directory)) {
        if (!entryName.test(name)) continue;
        const file = path.join(directory,name);
        try {
          const stat = await fs.lstat(file);
          if (!stat.isFile()) continue;
          if (Date.now()-stat.mtimeMs > maxAgeMs || !await fs.lstat(file+'.json').then(s=>s.isFile(),()=>false)) { await remove(file); continue; }
          remember(file,stat.size,stat.mtimeMs);
        } catch {}
      }
    }
    if (total <= maxBytes) return;
    for (const entry of [...entries.values()].sort((a,b)=>a.time-b.time)) {
      if (total <= maxBytes) break;
      if (entry.file === currentFile) continue;
      await remove(entry.file);
      remember(entry.file,0,0);
    }
  };
  const peekFile = async (identity, scope, withBytes) => {
    if (!identity) return null;
    const filePath = path.join(directory,identity);
    try {
      const stat = await fs.lstat(filePath);
      if (!stat.isFile() || stat.size < 1 || stat.size > maxEntryBytes || Date.now()-stat.mtimeMs > maxAgeMs) return null;
      const metaFile = filePath+'.json';
      const metaStat = await fs.lstat(metaFile);
      if (!metaStat.isFile() || metaStat.size > 1024) return null;
      const meta = JSON.parse(await fs.readFile(metaFile,'utf8'));
      if (!mediaMime.test(meta.mime) || (meta.scope && meta.scope !== hash(scope))) return null;
      const bytes = withBytes || !meta.scope ? await fs.readFile(filePath) : null;
      if (bytes && meta.sha256 !== await hashBytes(bytes)) return null;
      if (!meta.scope) await require('./atomic-json.cjs').writeJsonAtomic(metaFile,{...meta,scope:hash(scope)});
      const now = new Date();
      await fs.utimes(filePath,now,now);
      remember(filePath,stat.size,+now);
      return {filePath,mime:meta.mime,...(withBytes?{bytes}:{})};
    } catch { return null; }
  };
  const store = async (identity, scope, result) => {
    if (!identity || !result?.bytes?.length || result.bytes.length > Math.min(maxEntryBytes,maxBytes)
      || !mediaMime.test(result.mime)) return result;
    const filePath = path.join(directory,identity);
    const tmp = filePath+'.'+crypto.randomUUID()+'.tmp';
    try {
      await fs.mkdir(directory,{recursive:true});
      const root=await fs.lstat(directory);
      if (!root.isDirectory() || root.isSymbolicLink()) return result;
      await fs.writeFile(tmp,result.bytes);
      await fs.writeFile(tmp+'.json',JSON.stringify({mime:result.mime,sha256:await hashBytes(result.bytes),scope:hash(scope)}));
      await fs.rename(tmp,filePath);
      await fs.rename(tmp+'.json',filePath+'.json');
      remember(filePath,result.bytes.length,Date.now());
      await prune(filePath);
      return {...result,filePath};
    } catch {
      await remove(tmp);
      return result;
    }
  };
  const write=(identity,scope,result)=>{
    if(!identity)return result;
    const work=writeTail.then(()=>store(identity,scope,result));
    writeTail=work.catch(()=>{});return work;
  };
  const read = async (address,scope,load,{signal}={}) => {
    signal?.throwIfAborted();
    const identity = cacheIdentity(address,scope);
    if (!identity) return load();
    const local = await peekFile(identity,scope,true);
    signal?.throwIfAborted();
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
    async seed(address,scope,result) {
      const url = projectObject(address);
      const stored=await write(scope && url && !url.search ? objectIdentity(url,scope) : null,scope,result);
      if(stored?.filePath) onRead('uploadSeed',stored.bytes.length);
      return stored;
    },
  };
}
module.exports={createCosImageCache,cacheIdentity,COS_HOST,CACHE_EXTENSIONS,CACHE_MAX_BYTES,CACHE_MAX_AGE};
