const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const TTL_MS=48*3600*1000;
const MIME={png:['image','image/png'],jpg:['image','image/jpeg'],jpeg:['image','image/jpeg'],webp:['image','image/webp'],gif:['image','image/gif'],mp4:['video','video/mp4'],mov:['video','video/quicktime'],webm:['video','video/webm'],mp3:['audio','audio/mpeg'],wav:['audio','audio/wav'],m4a:['audio','audio/mp4'],flac:['audio','audio/flac']};
const keyPattern=/^temporary\/generation\/[a-f0-9]{32}\/[a-f0-9-]+\.(?:png|jpg|jpeg|webp|gif|mp4|mov|webm|mp3|wav|m4a|flac)$/;
function createGenerationReferenceStore({directory,signer,now=Date.now,fetchFn=fetch}){
 const files=()=>fs.existsSync(directory)?fs.readdirSync(directory).filter(n=>/\.json$/.test(n)):[];
 const read=name=>{try{const row=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));return keyPattern.test(row.objectKey)&&Number.isFinite(row.expiresAt)&&Number.isFinite(row.size)&&/^[a-f0-9]{32}$/.test(row.owner)?row:null;}catch{return null;}};
 let cleaning;
 const prune=()=>{if(cleaning)return cleaning;cleaning=(async()=>{let removed=0;for(const name of files()){const row=read(name);if(!row||row.expiresAt>now())continue;try{const signed=signer.signDelete({objectKey:row.objectKey});const r=await fetchFn(signed.url,{method:'DELETE',headers:{Authorization:signed.authorization},redirect:'error',signal:AbortSignal.timeout(15000)});await r.body?.cancel();if(!r.ok&&r.status!==404)continue;fs.unlinkSync(path.join(directory,name));removed++;}catch{/* Persist metadata for the next cleanup; never lose an owned object. */}}return {removed};})().finally(()=>cleaning=null);return cleaning;};
 async function issue(payload,user){
  if(!user?.id)throw Object.assign(Error('请先登录账号'),{status:401});if(!signer)throw Object.assign(Error('临时素材服务尚未配置'),{status:503});
  const ext=path.extname(String(payload?.filename||'')).slice(1).toLowerCase(),spec=ext==='mp4'&&payload?.kind==='audio'?['audio','audio/mp4']:MIME[ext],size=Number(payload?.size);
  if(!spec||payload.kind!==spec[0]||payload.mime!==spec[1]||!Number.isSafeInteger(size)||size<1||size>(spec[0]==='image'?20:spec[0]==='audio'?15:100)*1024*1024)throw Object.assign(Error('素材格式或大小不符合临时上传限制'),{status:400});
  const owner=crypto.createHash('sha256').update(String(user.id)).digest('hex').slice(0,32),rows=files().map(read).filter(Boolean),own=rows.filter(r=>r.owner===owner);
  if(own.length>=100||rows.length>=2000||own.reduce((n,r)=>n+r.size,0)+size>1024*1024*1024||rows.reduce((n,r)=>n+r.size,0)+size>8*1024*1024*1024)throw Object.assign(Error('临时素材额度已满，请等待到期清理后重试'),{status:429});
  const id=crypto.randomUUID(),objectKey=`temporary/generation/${owner}/${id}.${ext}`;
  fs.mkdirSync(directory,{recursive:true,mode:0o700});const download=signer.signGenerationReference({objectKey});
  fs.writeFileSync(path.join(directory,id+'.json'),JSON.stringify({owner,objectKey,size,expiresAt:now()+TTL_MS}),{flag:'wx',mode:0o600});
  const upload=signer.signUpload({objectKey,contentType:spec[1],contentLength:size});
  return {url:upload.url,authorization:upload.authorization,contentType:spec[1],objectKey,downloadUrl:download.url,expiresAt:download.expiresAt};
 }
 return {issue,prune};
}
module.exports={createGenerationReferenceStore,TTL_MS,MIME};
