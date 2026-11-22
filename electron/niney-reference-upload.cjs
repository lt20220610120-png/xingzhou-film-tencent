const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Readable} = require('node:stream');
const {cacheIdentity} = require('./cos-image-cache.cjs');
const MIME={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.flac':'audio/flac'};

function createNineyReferenceUploader({getSession,gateway=require('./cloud-access-service.cjs').gateway,fetchFn=fetch,now=Date.now,compress,readLocalOriginal}) {
  const cache = new Map(), pending = new Map();
  async function prepareReferences(input,{localFiles=false}={}) {
    const refs=input.references||[];
    const session=getSession(), account=session?.account?.id;
    const needsLocal=ref=>localFiles && ref.filePath && !/^https:\/\//i.test(ref.url||'');
    const canShrinkShared=ref=>compress && ref.kind==='image' && cacheIdentity(ref.url,account);
    if (!refs.some(ref=>needsLocal(ref)||canShrinkShared(ref))) return input;
    if (!account || !session.token) throw Error('请先登录行舟账号，以临时上传本次参考素材');

    const ensureCurrent=()=>{
      input.signal?.throwIfAborted();
      const current=getSession();
      if(current?.account?.id!==account || current?.token!==session.token) throw Error('登录账号已变化，本次素材准备已停止');
    };
    for(const [key,item] of cache) if(item.expiresAt<now()+300000) cache.delete(key);

    async function publish(ref,{filename,mime,size,open,hash,optional}) {
      const key=JSON.stringify([account,session.token,input.referenceTaskId||'',ref.kind,hash,size]);
      const previous=cache.get(key);
      if(previous) return previous.url;
      const upload=async()=>{
        const requestOptions=optional?{singleAttempt:true,timeoutMs:1800}:undefined;
        const signed=await gateway('generation-reference-upload-url',{filename,kind:ref.kind,mime,size,hash,leaseId:input.referenceTaskId},session.token,requestOptions);
        ensureCurrent();
        const download=new URL(signed.downloadUrl),target=new URL(signed.reused?signed.downloadUrl:signed.url);
        if(target.protocol!=='https:' || !target.hostname.endsWith('.myqcloud.com') || download.origin!==target.origin
          || download.pathname!==target.pathname || !target.pathname.startsWith('/temporary/generation/')
          || target.username || target.password || download.username || download.password
          || !Number.isFinite(signed.expiresAt) || signed.expiresAt<=now()+300000) throw Error('临时素材服务返回了无效上传地址');
        if(!signed.reused) {
          const stream=open();
          try {
            const response=await fetchFn(target.href,{
              method:'PUT',headers:{Authorization:signed.authorization,'Content-Type':signed.contentType||mime,'Content-Length':String(size)},
              body:stream,duplex:'half',redirect:'error',
              signal:AbortSignal.any([AbortSignal.timeout(optional?3500:120000),...(input.signal?[input.signal]:[])]),
            });
            await response.body?.cancel();
            if(!response.ok) throw Error('素材上传失败（HTTP '+response.status+'），生成任务尚未提交');
          } finally { stream.destroy(); }
          if(signed.id) {
            await gateway('generation-reference-uploaded',{id:signed.id},session.token,requestOptions);
            ensureCurrent();
          }
        }
        ensureCurrent();
        const saved={url:download.href,expiresAt:signed.expiresAt};
        if(cache.size>=100) cache.delete(cache.keys().next().value);
        cache.set(key,saved);
        return saved.url;
      };
      // Do not bind a second task to the first consumer's cancellation signal.
      if(input.signal) return upload();
      if(!pending.has(key)) pending.set(key,upload().finally(()=>pending.delete(key)));
      return pending.get(key);
    }

    const jpegUpload=(ref,bytes,filename,optional=false)=>publish(ref,{
      filename:path.basename(filename,path.extname(filename))+'.jpg',mime:'image/jpeg',size:bytes.length,
      open:()=>Readable.from([bytes]),hash:crypto.createHash('sha256').update(bytes).digest('hex'),optional,
    });
    const references=[];
    for(const ref of refs) {
      ensureCurrent();
      if (canShrinkShared(ref)) {
        // A cold shared reference already has a working URL. Avoid a speculative download.
        try {
          const original=await readLocalOriginal?.(ref.url,account);
          const compact=original && compress(original.bytes,original.mime,ref);
          if(compact) {
            const url=await jpegUpload(ref,compact,ref.filename||'reference.jpg',true);
            references.push({...ref,url,filename:path.basename(ref.filename||'reference',path.extname(ref.filename||''))+'.jpg',mime:'image/jpeg'});
            continue;
          }
        } catch {
          ensureCurrent();
        }
      }
      if(!needsLocal(ref)) { references.push(ref); continue; }
      const ext=path.extname(ref.filePath).toLowerCase();
      const mime=ext==='.mp4'&&ref.kind==='audio'?'audio/mp4':MIME[ext];
      const stat=await fs.promises.stat(ref.filePath);
      if(!stat.isFile() || !mime || !mime.startsWith(ref.kind+'/')) throw Error('参考素材格式无效，请重新选择文件');
      const filename=path.basename(ref.filePath);
      if(compress && /^image\/(?:png|jpeg)$/.test(mime) && stat.size>=256*1024 && stat.size<=32*1024*1024) {
        const compact=compress(await fs.promises.readFile(ref.filePath),mime,ref);
        if(compact) {
          const url=await jpegUpload(ref,compact,filename);
          references.push({...ref,url,filename:path.basename(filename,ext)+'.jpg',mime:'image/jpeg'});
          continue;
        }
      }
      const limit=ref.kind==='image'?20:ref.kind==='audio'?15:100;
      if(stat.size<1 || stat.size>limit*1024*1024) throw Error(`本次参考${ref.kind==='image'?'图片':ref.kind==='audio'?'音频':'视频'}大小须小于 ${limit} MB`);
      const open=()=>fs.createReadStream(ref.filePath), digest=crypto.createHash('sha256');
      for await(const bytes of open()) { ensureCurrent(); digest.update(bytes); }
      const url=await publish(ref,{filename,mime,open,size:stat.size,hash:digest.digest('hex')});
      references.push({...ref,url});
    }
    ensureCurrent();
    return {...input,references};
  }

  const prepare=async input=>{
    if(input.kind==='image') return input;
    const {effectiveVideoProtocol}=await import('../core/videoProviderConfig.js');
    const protocol=effectiveVideoProtocol(input);
    if(['muse','videos-multipart'].includes(protocol)
      || protocol==='custom' && (input.videoAdapter?.bodyType==='multipart'||input.videoAdapter?.referenceMode==='multipart')
      || protocol==='feituo' && input.references?.some(ref=>ref.filePath)) return input;
    return prepareReferences(input,{localFiles:['niney','autodl'].includes(protocol)});
  };
  prepare.publicImages=prepareReferences;
  prepare.clearCache=()=>cache.clear();
  prepare.release=async job=>{
    const session=getSession();
    if(!job.referenceAccountId || session?.account?.id!==job.referenceAccountId || !session.token || !['success','failed'].includes(job.status)) return;
    await gateway('generation-reference-release',{leaseId:job.id},session.token);
  };
  return prepare;
}
module.exports={createNineyReferenceUploader};
