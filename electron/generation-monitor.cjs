// Read/download only. This supervisor never calls a generation POST and remains
// independent of the production submit queue, Agent and currently visible page.
function createGenerationMonitor({jobs,getProfiles,authorize,concurrency=4,now=Date.now,onUpdate=()=>{}}){
 const active=new Set(),cooldown=new Map();
 return {async pump(){
  const owner=await authorize();if(!owner?.id)return;const manager=jobs(),profiles=await getProfiles(),tasks=manager.list({includeArchived:true});
  const due=tasks.filter(j=>j.kind==='video'&&!['success','failed'].includes(j.status)&&(j.jobId||j.status==='downloading'&&(j.url||j.urls?.length))&&j.referenceAccountId===String(owner.id)&&!active.has(j.id)&&Math.max(j.nextPollAt||0,cooldown.get(j.id)||0)<=now()).sort((a,b)=>(a.checkedAt?Date.parse(a.checkedAt):0)-(b.checkedAt?Date.parse(b.checkedAt):0));
  const work=[];for(const job of due){if(active.size>=concurrency)break;
   const profile=profiles.find(p=>p.id===job.profileId);let match=false;try{match=profile&&new URL(profile.endpoint).origin===new URL(job.endpoint).origin;}catch{}
   if(!match&&!['libtv','likeai'].includes(job.provider))continue;
   active.add(job.id);cooldown.set(job.id,now()+5000);
   work.push((async()=>{try{const live=await authorize();if(String(live?.id)!==String(owner.id))return;const result=await manager.refresh({id:job.id,apiKey:profile?.apiKey,endpoint:profile?.endpoint,accountId:String(owner.id)});onUpdate(result);}catch{cooldown.set(job.id,now()+30000);/* Retry reads only; never a paid POST. */}finally{active.delete(job.id);}})());
  }await Promise.allSettled(work);
 },get activeCount(){return active.size;}};
}
module.exports={createGenerationMonitor};
