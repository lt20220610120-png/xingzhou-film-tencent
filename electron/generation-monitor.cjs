// Read/download only. This supervisor never calls a generation POST and remains
// independent of the production submit queue, Agent and currently visible page.
function createGenerationMonitor({jobs,getProfiles,authorize,concurrency=4,now=Date.now,onUpdate=()=>{}}){
 const active=new Map(),cooldown=new Map();
 let epoch=0;
 return {async pump(){
  const expected=epoch,owner=await authorize();if(!owner?.id||expected!==epoch)return;const manager=jobs(),tasks=manager.list({includeArchived:true});
  const due=tasks.filter(j=>j.kind==='video'&&!['success','failed'].includes(j.status)&&(j.jobId||j.status==='downloading'&&(j.url||j.urls?.length))&&j.referenceAccountId===String(owner.id)&&!active.has(j.id)&&Math.max(j.nextPollAt||0,cooldown.get(j.id)||0)<=now()).sort((a,b)=>(a.checkedAt?Date.parse(a.checkedAt):0)-(b.checkedAt?Date.parse(b.checkedAt):0));
  if(!due.length||active.size>=concurrency)return;
  const profiles=await getProfiles();if(expected!==epoch)return;
  const work=[];for(const job of due){if(active.size>=concurrency)break;
   if(active.has(job.id)||(cooldown.get(job.id)||0)>now())continue;
   const profile=profiles.find(p=>p.id===job.profileId);let match=false;try{match=profile&&new URL(profile.endpoint).origin===new URL(job.endpoint).origin;}catch{}
   if(!match&&!['libtv','likeai'].includes(job.provider))continue;
   const controller=new AbortController();active.set(job.id,controller);cooldown.set(job.id,now()+5000);
   work.push((async()=>{try{const live=await authorize();if(controller.signal.aborted||String(live?.id)!==String(owner.id))return;const result=await manager.refresh({id:job.id,apiKey:profile?.apiKey,endpoint:profile?.endpoint,accountId:String(owner.id),signal:controller.signal});if(!controller.signal.aborted)onUpdate(result);}catch{if(!controller.signal.aborted)cooldown.set(job.id,now()+30000);}finally{active.delete(job.id);}})());
  }await Promise.allSettled(work);
 },cancel(){epoch++;for(const controller of active.values())controller.abort();cooldown.clear();},get activeCount(){return active.size;}};
}
module.exports={createGenerationMonitor};
