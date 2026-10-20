const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const TTL_MS=48*3600*1000;
const MIME={png:['image','image/png'],jpg:['image','image/jpeg'],jpeg:['image','image/jpeg'],webp:['image','image/webp'],gif:['image','image/gif'],mp4:['video','video/mp4'],mov:['video','video/quicktime'],webm:['video','video/webm'],mp3:['audio','audio/mpeg'],wav:['audio','audio/wav'],m4a:['audio','audio/mp4'],flac:['audio','audio/flac']};
const keyPattern=/^temporary\/generation\/[a-f0-9]{32}\/[a-f0-9-]+\.(?:png|jpg|jpeg|webp|gif|mp4|mov|webm|mp3|wav|m4a|flac)$/;
const LIMITS={count:500,bytes:1024*1024*1024,totalCount:5000,totalBytes:8*1024*1024*1024};
function createGenerationReferenceStore({directory,signer,now=Date.now,fetchFn=fetch}){
 const ownerFor=user=>{if(!user?.id)throw Object.assign(Error('请先登录账号'),{status:401});return crypto.createHash('sha256').update(String(user.id)).digest('hex').slice(0,32);};
 const files=()=>fs.existsSync(directory)?fs.readdirSync(directory).filter(n=>/^[a-f0-9-]+\.json$/.test(n)):[];
 const read=name=>{try{const row=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));return keyPattern.test(row.objectKey)&&row.objectKey.split('/')[2]===row.owner&&path.basename(row.objectKey).split('.')[0]===name.slice(0,-5)&&Number.isFinite(row.expiresAt)&&Number.isSafeInteger(row.size)&&row.size>0&&/^[a-f0-9]{32}$/.test(row.owner)?{...row,id:name.slice(0,-5)}:null;}catch{return null;}};
 const rows=()=>files().map(read).filter(Boolean);
 const write=row=>{fs.mkdirSync(directory,{recursive:true,mode:0o700});const file=path.join(directory,row.id+'.json'),tmp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(row),{mode:0o600});fs.renameSync(tmp,file);};
 // All quota reservations, lease changes and deletes share one serialized lane.
 // A cleanup cannot race a new task claiming the same reference.
 let tail=Promise.resolve();const serial=work=>{const next=tail.then(work);tail=next.catch(()=>{});return next;};
 const state=row=>row.expiresAt<=now()?'expired':row.tracked!==true?'legacy':Object.keys(row.leases||{}).length?'active':'unused';
 const canDelete=row=>['expired','unused'].includes(state(row));
 async function remove(targets){const result={removed:0,bytesFreed:0,failed:[],skipped:0};for(const row of targets){try{const signed=signer.signDelete({objectKey:row.objectKey});const r=await fetchFn(signed.url,{method:'DELETE',headers:{Authorization:signed.authorization},redirect:'error',signal:AbortSignal.timeout(15000)});await r.body?.cancel();if(!r.ok&&r.status!==404)throw Error('delete failed');fs.unlinkSync(path.join(directory,row.id+'.json'));result.removed++;result.bytesFreed+=row.size;}catch{result.failed.push({id:row.id,name:row.filename||'临时素材',message:'云端删除暂未完成，请重试；该项仍保留。'});}}return result;}
 const prune=()=>serial(()=>remove(rows().filter(r=>r.expiresAt<=now())));
 const issue=(payload,user)=>serial(async()=>{
  const owner=ownerFor(user);if(!signer)throw Object.assign(Error('临时素材服务尚未配置'),{status:503});
  const ext=path.extname(String(payload?.filename||'')).slice(1).toLowerCase(),spec=ext==='mp4'&&payload?.kind==='audio'?['audio','audio/mp4']:MIME[ext],size=Number(payload?.size);
  if(!spec||payload.kind!==spec[0]||payload.mime!==spec[1]||!Number.isSafeInteger(size)||size<1||size>(spec[0]==='image'?20:spec[0]==='audio'?15:100)*1024*1024)throw Object.assign(Error('素材格式或大小不符合临时上传限制'),{status:400});
  const hash=/^[a-f0-9]{64}$/.test(payload.hash||'')?payload.hash:null;
  const leaseId=typeof payload.leaseId==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(payload.leaseId)?payload.leaseId:null;
  let all=rows(),own=all.filter(r=>r.owner===owner);
  const reused=hash&&leaseId&&own.find(r=>r.hash===hash&&r.size===size&&r.kind===payload.kind&&r.uploaded===true&&r.expiresAt>now()+300000);
  if(reused){reused.leases={...reused.leases,[leaseId]:now()};reused.tracked=true;write(reused);const download=signer.signGenerationReference({objectKey:reused.objectKey,ttlSeconds:Math.floor((reused.expiresAt-now())/1000)});return {id:reused.id,reused:true,downloadUrl:download.url,expiresAt:Math.min(download.expiresAt,reused.expiresAt)};}
  const full=()=>own.length>=LIMITS.count||all.length>=LIMITS.totalCount||own.reduce((n,r)=>n+r.size,0)+size>LIMITS.bytes||all.reduce((n,r)=>n+r.size,0)+size>LIMITS.totalBytes;
  if(full()){await remove(all.filter(r=>r.expiresAt<=now()));all=rows();own=all.filter(r=>r.owner===owner);}
  if(full())throw Object.assign(Error('云端临时素材额度已满。请打开“管理临时素材”，清理已到期或任务已结束的副本后重试；本机原文件保留。'),{status:429});
  const id=crypto.randomUUID(),objectKey=`temporary/generation/${owner}/${id}.${ext}`;
  fs.mkdirSync(directory,{recursive:true,mode:0o700});const download=signer.signGenerationReference({objectKey});
  write({id,owner,objectKey,size,kind:payload.kind,filename:path.basename(String(payload.filename)).slice(0,180),createdAt:now(),expiresAt:now()+TTL_MS,hash,tracked:!!leaseId,leases:leaseId?{[leaseId]:now()}:{},uploaded:false});
  const upload=signer.signUpload({objectKey,contentType:spec[1],contentLength:size});
  return {id,url:upload.url,authorization:upload.authorization,contentType:spec[1],objectKey,downloadUrl:download.url,expiresAt:download.expiresAt};
 });
 const list=user=>serial(()=>{const owner=ownerFor(user),own=rows().filter(r=>r.owner===owner);return {count:own.length,bytes:own.reduce((s,r)=>s+r.size,0),limits:{count:LIMITS.count,bytes:LIMITS.bytes},items:own.map(r=>({id:r.id,name:r.filename||'旧版临时素材',kind:r.kind||MIME[path.extname(r.objectKey).slice(1)]?.[0],size:r.size,createdAt:r.createdAt||r.expiresAt-TTL_MS,expiresAt:r.expiresAt,state:state(r),canDelete:canDelete(r)}))};});
 const uploaded=(payload,user)=>serial(()=>{const row=rows().find(r=>r.id===payload.id&&r.owner===ownerFor(user));if(!row)throw Object.assign(Error('临时素材不存在或已到期'),{status:404});row.uploaded=true;write(row);return {ok:true};});
 const release=(payload,user)=>serial(()=>{const owner=ownerFor(user),ids=payload.leaseIds||[payload.leaseId];if(!Array.isArray(ids)||ids.length>2000||ids.some(id=>typeof id!=='string'||id.length>100))throw Object.assign(Error('任务编号无效'),{status:400});for(const row of rows().filter(r=>r.owner===owner&&r.tracked)){let changed=false;for(const id of ids)if(row.leases?.[id]){delete row.leases[id];changed=true;}if(changed)write(row);}return {ok:true};});
 const cleanup=(payload,user)=>serial(async()=>{const owner=ownerFor(user);if(payload.ids!==undefined&&(!Array.isArray(payload.ids)||payload.ids.length>500||payload.ids.some(id=>typeof id!=='string')))throw Object.assign(Error('请选择要清理的临时素材'),{status:400});const own=rows().filter(r=>r.owner===owner),chosen=new Set(payload.ids||[]),targets=own.filter(r=>payload.mode==='expired'?state(r)==='expired':payload.mode==='unused'?canDelete(r):chosen.has(r.id));const safe=targets.filter(canDelete);return {...await remove(safe),skipped:targets.length-safe.length};});
 return {issue,prune,list,uploaded,release,cleanup};
}
module.exports={createGenerationReferenceStore,TTL_MS,MIME};
