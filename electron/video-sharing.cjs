function createVideoSharing({getJob,getProject,listMedia,download,upload,saveLocal,markRecorded,guard}){
 const active=new Map();
 return p=>{
  const key=p.owner+':'+p.projectId+':'+p.jobId;
  if(active.has(key))return active.get(key);
  const work=(async()=>{
   await guard(p);const job=getJob(p.jobId),project=await getProject(p.projectId);
   if(!job||job.projectVideoDeleted||job.projectId!==p.projectId||job.kind!=='video'||job.status!=='success'||(job.referenceAccountId&&String(job.referenceAccountId)!==p.owner))throw Error('找不到当前账号在这个项目的已完成视频');
   if(project.locked||!['producer','collaborator','artist_collaborator'].includes(project.myRole))throw Error('项目已锁定或没有上传权限');
   const rows=await listMedia(p.projectId),marker=`[generation:${job.id}]`;
   const existing=rows.find(m=>m.id===job.mediaId||String(m.note||'').includes(marker));
   await guard(p);
   if(existing){await markRecorded(job.id,existing.id);return existing;}
   const filePath=job.filePath||await download(job);
   await guard(p);await saveLocal(job.id,filePath);
   const result=await upload({projectId:p.projectId,episode:job.episode,scene:job.scene,kind:'video',filePath,note:`${job.shotLabel||''} [shot:${job.shotId||''}] ${marker}`});
   await guard(p);await markRecorded(job.id,result.id);return result;
  })().finally(()=>active.delete(key));active.set(key,work);return work;
 };
}
async function shareProjectVideos({owner,projectId,jobIds,share,signal}){
 if(!Array.isArray(jobIds)||!jobIds.length||jobIds.length>10000||jobIds.some(id=>typeof id!=='string'||!id||id.length>128))throw Error('请选择要上传的视频');
 const shared=[],errors=[];
 for(const jobId of new Set(jobIds)){
  signal?.throwIfAborted();
  try{const media=await share({owner,projectId,jobId});shared.push({jobId,mediaId:media.id});}
  catch(error){signal?.throwIfAborted();errors.push({jobId,message:error.message||'上传失败'});}
 }
 return {shared,errors};
}
module.exports={createVideoSharing,shareProjectVideos};
