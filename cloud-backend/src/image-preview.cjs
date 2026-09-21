const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash, randomUUID} = require('node:crypto');

// The production host is in the COS bucket's region: its bucket DNS resolves
// to the internal network. Originals stay in COS; only disposable previews live here.
function createImagePreview({directory, host, fetchFn = fetch, maxBytes = 256*1024*1024, queueWaitMs = 6000}) {
  const pending = new Map(), waiters = [];
  let active = 0, lastTrim = 0;
  const slot = async () => {
    if (active < 2) { active++; return true; }
    if (waiters.length>=64) return false;
    return new Promise(resolve => {
      const waiter={resolve};
      waiter.timer=setTimeout(()=>{
        const index=waiters.indexOf(waiter);if(index>=0)waiters.splice(index,1);
        resolve(false);
      },queueWaitMs);
      waiters.push(waiter);
    });
  };
  const release = () => {
    const next=waiters.shift();
    if(next) { clearTimeout(next.timer);next.resolve(true); } else active--;
  };
  const trim = async () => {
    if (Date.now()-lastTrim < 60000) return;
    lastTrim = Date.now();
    const files = await fs.readdir(directory);
    const entries = await Promise.all(files.filter(name=>/^[a-f0-9]{64}\.webp$/.test(name)).map(async name=>{
      try { const stat=await fs.stat(path.join(directory,name)); return {name,size:stat.size,time:stat.mtimeMs}; } catch { return null; }
    }));
    const valid=entries.filter(Boolean).sort((a,b)=>a.time-b.time);
    let total=valid.reduce((sum,item)=>sum+item.size,0);
    for (const item of valid) {
      if (total<=maxBytes) break;
      await fs.unlink(path.join(directory,item.name)).catch(()=>{}); total-=item.size;
    }
  };
  return async image => {
    let url;
    try { url = new URL(image.url); } catch { return null; }
    if (url.protocol!=='https:' || url.host!==host || url.username || url.password
      || !/^projects\/[\w-]+\/image\/[\w.-]+\.(png|jpe?g|webp)$/i.test(image.objectKey || '')
      || decodeURIComponent(url.pathname)!=='/'+image.objectKey) return null;
    const key=createHash('sha256').update(`preview-v1:${host}:${image.objectKey}`).digest('hex');
    if (pending.has(key)) return pending.get(key);
    const work=(async()=>{
      let temporary, acquired=false;
      try {
        await fs.mkdir(directory,{recursive:true,mode:0o700});
        const filename=path.join(directory,key+'.webp');
        try {
          const bytes=await fs.readFile(filename);
          await fs.utimes(filename,new Date(),new Date()).catch(()=>{});
          return 'data:image/webp;base64,'+bytes.toString('base64');
        } catch (error) { if (error.code!=='ENOENT') throw error; }
        acquired=await slot();
        if(!acquired) return null;
        const response=await fetchFn(url.href,{redirect:'error',signal:AbortSignal.timeout(15000)});
        const limit=32*1024*1024;
        if (!response.ok || Number(response.headers.get('content-length'))>limit) {
          await response.body?.cancel(); return null;
        }
        const chunks=[]; let length=0;
        for await (const chunk of response.body) {
          length+=chunk.length;
          if (length>limit) throw Error('preview_input_too_large');
          chunks.push(Buffer.from(chunk));
        }
        const sharp=require('sharp');
        const bytes=await sharp(Buffer.concat(chunks),{limitInputPixels:40000000})
          .rotate().resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).webp({quality:80}).toBuffer();
        temporary=filename+'.'+randomUUID()+'.tmp';
        await fs.writeFile(temporary,bytes,{mode:0o600});
        await fs.rename(temporary,filename); temporary=null;
        await trim();
        return 'data:image/webp;base64,'+bytes.toString('base64');
      } catch { return null; } // Original-link fallback keeps viewing available.
      finally { if (temporary) await fs.unlink(temporary).catch(()=>{}); if(acquired)release(); }
    })().finally(()=>pending.delete(key));
    pending.set(key,work);
    return work;
  };
}
module.exports={createImagePreview};
