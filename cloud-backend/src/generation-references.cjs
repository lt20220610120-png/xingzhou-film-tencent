const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const TTL_MS=48*3600*1000;
const MIME={png:['image','image/png'],jpg:['image','image/jpeg'],jpeg:['image','image/jpeg'],webp:['image','image/webp'],gif:['image','image/gif'],mp4:['video','video/mp4'],mov:['video','video/quicktime'],webm:['video','video/webm'],mp3:['audio','audio/mpeg'],wav:['audio','audio/wav'],m4a:['audio','audio/mp4'],flac:['audio','audio/flac']};
const keyPattern=/^temporary\/generation\/[a-f0-9]{32}\/[a-f0-9-]+\.(?:png|jpg|jpeg|webp|gif|mp4|mov|webm|mp3|wav|m4a|flac)$/;
const LIMITS={count:500,bytes:1024*1024*1024,totalCount:5000,totalBytes:8*1024*1024*1024};
function createGenerationReferenceStore({directory,signer,now=Date.now,fetchFn=fetch}){
 const ownerFor=user=>{if(!user?.id)throw Object.assign(Error('请先登录账号'),{status:401});return crypto.createHash('sha256').update(String(user.id)).digest('hex').slice(0,32);};
 const records=new Map();
 const read=async name=>{try{const row=JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));return keyPattern.test(row.objectKey)&&row.objectKey.split('/')[2]===row.owner&&path.basename(row.objectKey).split('.')[0]===name.slice(0,-5)&&Number.isFinite(row.expiresAt)&&Number.isSafeInteger(row.size)&&row.size>0&&/^[a-f0-9]{32}$/.test(row.owner)?{...row,id:name.slice(0,-5)}:null;}catch(error){if(error instanceof SyntaxError||error.code==='ENOENT')return null;throw error;}};
 const load=async()=>{
  const dir=await fs.opendir(directory).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(!dir)return;
  const batch=[];
  const readBatch=async()=>{for(const row of await Promise.all(batch.splice(0).map(read)))if(row)records.set(row.id,row);};
  for await(const entry of dir){
   if(!entry.isFile()||!/^[a-f0-9-]+\.json$/.test(entry.name))continue;
   batch.push(entry.name);
   if(batch.length===16)await readBatch();
  }
  await readBatch();
 };
 const rows=()=>[...records.values()];
 const write=async row=>{
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const file=path.join(directory,row.id+'.json'),tmp=file+'.'+crypto.randomUUID()+'.tmp';
  try{
   await fs.writeFile(tmp,JSON.stringify(row),{mode:0o600});
   await fs.rename(tmp,file);
   records.set(row.id,row);
  }finally{await fs.unlink(tmp).catch(()=>{});}
 };
 // All quota reservations, lease changes and deletes share one serialized lane.
 // A cleanup cannot race a new task claiming the same reference.
 let initialized=false,tail=Promise.resolve();
 const serial=work=>{
  const next=tail.then(async()=>{
   if(!initialized){records.clear();await load();initialized=true;}
   return work();
  });
  tail=next.catch(()=>{});
  return next;
 };
 const state=row=>row.expiresAt<=now()?'expired':row.tracked!==true?'legacy':Object.keys(row.leases||{}).length?'active':'unused';
 const canDelete=row=>['expired','unused'].includes(state(row));
 async function remove(targets){const result={removed:0,bytesFreed:0,failed:[],skipped:0};for(const row of targets){try{const signed=signer.signDelete({objectKey:row.objectKey});const r=await fetchFn(signed.url,{method:'DELETE',headers:{Authorization:signed.authorization},redirect:'error',signal:AbortSignal.timeout(15000)});await r.body?.cancel();if(!r.ok&&r.status!==404)throw Error('delete failed');await fs.unlink(path.join(directory,row.id+'.json'));records.delete(row.id);result.removed++;result.bytesFreed+=row.size;}catch{result.failed.push({id:row.id,name:row.filename||'临时素材',message:'云端删除暂未完成，请重试；该项仍保留。'});}}return result;}
 let pruning;
 const prune=()=>{
  if(pruning)return pruning;
  pruning=serial(()=>rows().filter(r=>r.expiresAt<=now()).slice(0,100)).then(async expired=>{
   const result={removed:0,bytesFreed:0,failed:[],skipped:0};
   for(const row of expired){
    const outcome=await serial(()=>records.get(row.id)?.expiresAt<=now()?remove([row]):{removed:0,bytesFreed:0,failed:[]});
    result.removed+=outcome.removed;
    result.bytesFreed+=outcome.bytesFreed;
    result.failed.push(...outcome.failed);
   }
   return result;
  }).finally(()=>{pruning=null;});
  return pruning;
 };
 const issue=(payload,user)=>serial(async()=>{
  const owner=ownerFor(user);if(!signer)throw Object.assign(Error('临时素材服务尚未配置'),{status:503});
  const ext=path.extname(String(payload?.filename||'')).slice(1).toLowerCase(),spec=ext==='mp4'&&payload?.kind==='audio'?['audio','audio/mp4']:MIME[ext],size=Number(payload?.size);
  if(!spec||payload.kind!==spec[0]||payload.mime!==spec[1]||!Number.isSafeInteger(size)||size<1||size>(spec[0]==='image'?20:spec[0]==='audio'?15:100)*1024*1024)throw Object.assign(Error('素材格式或大小不符合临时上传限制'),{status:400});
  const hash=/^[a-f0-9]{64}$/.test(payload.hash||'')?payload.hash:null;
  const leaseId=typeof payload.leaseId==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(payload.leaseId)?payload.leaseId:null;
  let all=rows(),own=all.filter(r=>r.owner===owner);
  const reused=hash&&leaseId&&own.find(r=>r.hash===hash&&r.size===size&&r.kind===payload.kind&&r.uploaded===true&&r.expiresAt>now()+300000);
  if(reused){await write({...reused,leases:{...reused.leases,[leaseId]:now()},tracked:true});const download=signer.signGenerationReference({objectKey:reused.objectKey,ttlSeconds:Math.floor((reused.expiresAt-now())/1000)});return {id:reused.id,reused:true,downloadUrl:download.url,expiresAt:Math.min(download.expiresAt,reused.expiresAt)};}
  const full=()=>own.length>=LIMITS.count||all.length>=LIMITS.totalCount||own.reduce((n,r)=>n+r.size,0)+size>LIMITS.bytes||all.reduce((n,r)=>n+r.size,0)+size>LIMITS.totalBytes;
  if(full()){await remove(all.filter(r=>r.expiresAt<=now()).slice(0,25));all=rows();own=all.filter(r=>r.owner===owner);}
  if(full())throw Object.assign(Error('云端临时素材额度已满。请打开“管理临时素材”，清理已到期或任务已结束的副本后重试；本机原文件保留。'),{status:429});
  const id=crypto.randomUUID(),objectKey=`temporary/generation/${owner}/${id}.${ext}`;
  const download=signer.signGenerationReference({objectKey});
  await write({id,owner,objectKey,size,kind:payload.kind,filename:path.basename(String(payload.filename)).slice(0,180),createdAt:now(),expiresAt:now()+TTL_MS,hash,tracked:!!leaseId,leases:leaseId?{[leaseId]:now()}:{},uploaded:false});
  const upload=signer.signUpload({objectKey,contentType:spec[1],contentLength:size});
  return {id,url:upload.url,authorization:upload.authorization,contentType:spec[1],objectKey,downloadUrl:download.url,expiresAt:download.expiresAt};
 });
 async function refreshOwned(owner){
  const ids=rows().filter(r=>r.owner===owner).map(r=>r.id),owned=[];
  for(let i=0;i<ids.length;i+=16){
   const batch=ids.slice(i,i+16);
   const fresh=await Promise.all(batch.map(id=>read(id+'.json')));
   fresh.forEach((row,index)=>{
    if(row?.owner===owner){records.set(row.id,row);owned.push(row);}
    else records.delete(batch[index]);
   });
  }
  return owned;
 }
 const list=user=>serial(async()=>{const own=await refreshOwned(ownerFor(user));return {count:own.length,bytes:own.reduce((s,r)=>s+r.size,0),limits:{count:LIMITS.count,bytes:LIMITS.bytes},items:own.map(r=>({id:r.id,name:r.filename||'旧版临时素材',kind:r.kind||MIME[path.extname(r.objectKey).slice(1)]?.[0],size:r.size,createdAt:r.createdAt||r.expiresAt-TTL_MS,expiresAt:r.expiresAt,state:state(r),canDelete:canDelete(r)}))};});
 const uploaded=(payload,user)=>serial(async()=>{const owner=ownerFor(user),row=records.get(payload.id);if(row?.owner!==owner||row.expiresAt<=now())throw Object.assign(Error('临时素材不存在或已到期'),{status:404});await write({...row,uploaded:true});return {ok:true};});
 const release=(payload,user)=>serial(async()=>{const owner=ownerFor(user),ids=payload.leaseIds||[payload.leaseId];if(!Array.isArray(ids)||ids.length>2000||ids.some(id=>typeof id!=='string'||id.length>100))throw Object.assign(Error('任务编号无效'),{status:400});const releasing=new Set(ids);for(const row of rows().filter(r=>r.owner===owner&&r.tracked)){const leases=Object.entries(row.leases||{}),kept=leases.filter(([id])=>!releasing.has(id));if(leases.length!==kept.length)await write({...row,leases:Object.fromEntries(kept)});}return {ok:true};});
 const cleanup=(payload,user)=>serial(async()=>{const owner=ownerFor(user);if(payload.ids!==undefined&&(!Array.isArray(payload.ids)||payload.ids.length>500||payload.ids.some(id=>typeof id!=='string')))throw Object.assign(Error('请选择要清理的临时素材'),{status:400});const own=await refreshOwned(owner),chosen=new Set(payload.ids||[]),targets=own.filter(r=>payload.mode==='expired'?state(r)==='expired':payload.mode==='unused'?canDelete(r):chosen.has(r.id));const safe=targets.filter(canDelete);return {...await remove(safe),skipped:targets.length-safe.length};});
 return {issue,prune,list,uploaded,release,cleanup};
}
module.exports={createGenerationReferenceStore,TTL_MS,MIME};
