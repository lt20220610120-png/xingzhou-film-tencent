const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MIME={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.flac':'audio/flac'};
function createNineyReferenceUploader({getSession,gateway=require('./cloud-access-service.cjs').gateway,fetchFn=fetch,now=Date.now}){
 const cache=new Map(),pending=new Map();
 const prepare=async input=>{
  const {effectiveVideoProtocol}=await import('../core/videoProviderConfig.js');if(input.kind==='image'||!['niney','autodl'].includes(effectiveVideoProtocol(input))||!input.references?.some(r=>r.filePath&&!/^https:\/\//i.test(r.url||'')))return input;
  const session=getSession(),account=session?.account?.id;if(!account||!session.token)throw Error('请先登录行舟账号，以临时上传本次参考素材');
  const ensureCurrent=()=>{if(input.signal?.aborted)throw input.signal.reason||Error('已取消素材上传');const current=getSession();if(current?.account?.id!==account||current?.token!==session.token)throw Error('登录账号已变化，本次素材准备已停止');};
  for(const [key,item] of cache)if(item.expiresAt<now()+300000)cache.delete(key);
  const references=[];
  for(const ref of input.references){
    ensureCurrent();if(!ref.filePath||/^https:\/\//i.test(ref.url||'')){references.push(ref);continue;}
    const ext=path.extname(ref.filePath).toLowerCase(),stat=await fs.promises.stat(ref.filePath),mime=ext==='.mp4'&&ref.kind==='audio'?'audio/mp4':MIME[ext];
    if(!stat.isFile()||!mime||!mime.startsWith(ref.kind+'/'))throw Error('参考素材格式无效，请重新选择文件');
    const limit=ref.kind==='image'?20:ref.kind==='audio'?15:100;if(stat.size<1||stat.size>limit*1024*1024)throw Error(`本次参考${ref.kind==='image'?'图片':ref.kind==='audio'?'音频':'视频'}大小须小于 ${limit} MB`);
    const key=JSON.stringify([account,input.referenceTaskId||'',ref.kind,ref.filePath,stat.size,stat.mtimeMs]);let cached=cache.get(key);
    if(!cached){
     if(!pending.has(key))pending.set(key,(async()=>{
     const digest=crypto.createHash('sha256');for await(const bytes of fs.createReadStream(ref.filePath)){ensureCurrent();digest.update(bytes);}
     const signed=await gateway('generation-reference-upload-url',{filename:path.basename(ref.filePath),kind:ref.kind,mime,size:stat.size,hash:digest.digest('hex'),leaseId:input.referenceTaskId},session.token);ensureCurrent();
     const download=new URL(signed.downloadUrl),target=new URL(signed.reused?signed.downloadUrl:signed.url);
     if(target.protocol!=='https:'||!target.hostname.endsWith('.myqcloud.com')||download.origin!==target.origin||download.pathname!==target.pathname||!target.pathname.startsWith('/temporary/generation/')||target.username||target.password||download.username||download.password||!Number.isFinite(signed.expiresAt)||signed.expiresAt<=now()+300000)throw Error('临时素材服务返回了无效上传地址');
     if(!signed.reused){const stream=fs.createReadStream(ref.filePath);try{const response=await fetchFn(target.href,{method:'PUT',headers:{Authorization:signed.authorization,'Content-Type':signed.contentType||mime,'Content-Length':String(stat.size)},body:stream,duplex:'half',redirect:'error',signal:input.signal?AbortSignal.any([input.signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)});await response.body?.cancel();if(!response.ok)throw Error('素材上传失败（HTTP '+response.status+'），生成任务尚未提交');}finally{stream.destroy();}
      if(signed.id){await gateway('generation-reference-uploaded',{id:signed.id},session.token);ensureCurrent();}
     }
     ensureCurrent();cached={url:download.href,expiresAt:signed.expiresAt};if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,cached);
     return cached;
     })().finally(()=>pending.delete(key)));
     cached=await pending.get(key);ensureCurrent();
    }
    references.push({...ref,url:cached.url});
  }
  ensureCurrent();return {...input,references};
 };
 prepare.clearCache=()=>cache.clear();
 prepare.release=async job=>{const session=getSession();if(!job.referenceAccountId||session?.account?.id!==job.referenceAccountId||!session.token||!['success','failed'].includes(job.status))return;await gateway('generation-reference-release',{leaseId:job.id},session.token);};
 return prepare;
}
module.exports={createNineyReferenceUploader};
