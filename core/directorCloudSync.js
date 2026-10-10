/** One save per project in flight, independent of the page currently selected. */
export function createDirectorCloudSync({getContext,updateProject,acknowledge,onConflict=()=>{},delayMs=900,manualOnly=false}){
 const dirty=new Set(),timers=new Map(),inFlight=new Map();let disposed=false,epoch=0;
 const flush=(id,submission)=>{
  if(inFlight.has(id))return inFlight.get(id);
  if(disposed)return submission?Promise.reject(new Error('上传已停止，本地版本已保留')):Promise.resolve();
  clearTimeout(timers.get(id));timers.delete(id);dirty.add(id);
  const version=epoch;
  const task=(async()=>{let acknowledged=false;
   while(dirty.has(id)&&!disposed&&version===epoch){
    dirty.delete(id);
    const context=getContext(),accountId=context.accountId,project=context.projects?.find(p=>p.id===id);
    if(!accountId||!project?.cloudProjectId||(!project.cloudBase&&!submission?.base)||project.cloudLocked||(project.cloudConflict&&!submission)||project.canWrite===false||project.permissions?.canWrite===false){if(submission)throw new Error('项目已锁定、移除或权限已变化，未上传；本地版本已保留');return;}
    const submitted=structuredClone(submission?.document||{name:project.name,script:project.masterScript||'',episodes:project.episodes||[]});
    if(!submission&&JSON.stringify(submitted)===JSON.stringify(project.cloudBase))continue;
    try{
     const cloud=await updateProject({projectId:project.cloudProjectId,base:structuredClone(submission?.base||project.cloudBase),updates:submitted,...(submission?{submissionId:submission.id,conflictOnly:submission.conflictOnly===true}:{})});
     if(disposed||version!==epoch||getContext().accountId!==accountId)return;
     await acknowledge({cloud,submitted,projectId:id});
     acknowledged=true;
     const latest=getContext().projects?.find(p=>p.id===id);
     if(!manualOnly&&latest&&JSON.stringify({name:latest.name,script:latest.masterScript||'',episodes:latest.episodes||[]})!==JSON.stringify(latest.cloudBase))dirty.add(id);
    }catch(error){if(!disposed&&version===epoch&&getContext().accountId===accountId){onConflict({projectId:id,message:error.message||'云端保存失败'});throw error;}return;}
   }
   return {acknowledged};
  })().finally(()=>{if(inFlight.get(id)===task)inFlight.delete(id);});
  inFlight.set(id,task);return task;
 };
 return {
  enqueue(id){if(disposed)return;dirty.add(id);if(inFlight.has(id))return;clearTimeout(timers.get(id));timers.set(id,setTimeout(()=>{timers.delete(id);flush(id).catch(()=>{});},delayMs));},
  flush,isSaving:id=>id?inFlight.has(id):inFlight.size>0,
  pause(){epoch++;dirty.clear();for(const timer of timers.values())clearTimeout(timer);timers.clear();},
  activate(){disposed=false;},dispose(){disposed=true;this.pause();},
 };
}
