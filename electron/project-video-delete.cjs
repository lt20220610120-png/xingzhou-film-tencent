async function deleteProjectVideos({project,ids,jobs,media,deleteMedia,hideJobs,guard=async()=>{}}){
 if(!Array.isArray(ids)||ids.length>20000||ids.some(i=>!i||!!i.jobId===!!i.mediaId||typeof(i.jobId||i.mediaId)!=='string'))throw Error('请选择有效的生成记录');
 if(project.locked||!['producer','collaborator','artist_collaborator'].includes(project.myRole))throw Error('项目已锁定或没有删除权限');
 const seen=new Set(),removedKeys=[],errors=[];let removed=0;
 for(const item of ids){const key=item.jobId?'job:'+item.jobId:'media:'+item.mediaId;if(seen.has(key))continue;seen.add(key);
  try{
   await guard();
   const job=item.jobId?jobs.find(j=>j.id===item.jobId&&j.projectId===project.id&&j.kind==='video'):jobs.find(j=>j.mediaId===item.mediaId&&j.projectId===project.id&&j.kind==='video');
   const mid=item.mediaId||job?.mediaId,cloud=mid&&media.find(m=>m.id===mid&&m.kind==='video'&&(!m.projectId||m.projectId===project.id)&&(!m.project_id||m.project_id===project.id));
   if(!job&&!cloud){errors.push('生成记录已变化，请刷新');continue;}
   if(job)seen.add('job:'+job.id);if(mid)seen.add('media:'+mid);
   if(job?.projectVideoDeleted&&!cloud){removedKeys.push('job:'+job.id);if(mid)removedKeys.push('media:'+mid);continue;}
   if(cloud)await deleteMedia({projectId:project.id,mediaId:cloud.id});
   await guard();if(job)await hideJobs({projectId:project.id,ids:[job.id]});
   removed++;removedKeys.push(key);if(job)removedKeys.push('job:'+job.id);if(mid)removedKeys.push('media:'+mid);
  }catch(e){errors.push(e.message);}
 }
 return {removed,removedKeys:[...new Set(removedKeys)],errors};
}
module.exports={deleteProjectVideos};
