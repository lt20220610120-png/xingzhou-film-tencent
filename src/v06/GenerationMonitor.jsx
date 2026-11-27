import {useEffect,useRef} from 'react';
import {generationMediaProfiles,historicalMediaProfile} from '../../core/canvasStore.js';
export function GenerationMonitor({state,api,account}) {
 const current=useRef({state,account});current.current={state,account};
 useEffect(()=>{
  let stopped=false,busy=false;
  const refresh=async()=>{
   const owner=current.current.account?.id;
   if(busy||!owner)return;busy=true;
   const active=()=>!stopped&&current.current.account?.id===owner;
   try{
    const rows=await api.generationList({includeArchived:true});
    for(let job of rows){
     if(!active())break;
     if(job.referenceAccountId&&String(job.referenceAccountId)!==String(owner))continue;
     try{
     if(job.archived&&!job.clearedWhileActive)continue;
     if(job.provider==='libtv'&&!job.libtvNodeId)continue;
     const profile=generationMediaProfiles(current.current.state,job.kind).find(p=>p.id===job.profileId)||historicalMediaProfile(current.current.state,job.profileId);
     if((['libtv','likeai'].includes(job.provider)||job.downloadReceiptId || ((job.jobId||job.url)&&profile&&(profile.apiKey||profile.videoAdapter?.authMode==='none')))&&!['success','failed'].includes(job.status)&&(job.status!=='uncertain'||job.provider==='likeai')&&(!job.nextPollAt||Date.now()>=job.nextPollAt))job=await api.generationRefresh({id:job.id,apiKey:profile?.apiKey,endpoint:profile?.endpoint});
     if(active()&&job.status==='success'&&job.kind!=='video'&&job.projectId&&!job.mediaId){
       const existing=await api.collabListMedia({projectId:job.projectId});
       if(!active())break;
       const found=existing.find(m=>m.filename===job.filePath?.split(/[\\/]/).pop());
       const media=found||await api.collabRecordGeneratedMedia({projectId:job.projectId,episode:job.episode,scene:job.scene,kind:job.kind,filePath:job.filePath,note:`${job.shotLabel} [shot:${job.shotId}]`});
       if(active())await api.generationRecorded({id:job.id,mediaId:media.id});
     }
     }catch{/* Retry this task on a later pass while the other tasks continue. */}
    }
   }catch{/* A later poll recovers transient IPC/network errors. */}finally{busy=false;}
  };
  refresh();const timer=setInterval(refresh,30000);window.addEventListener('xz-refresh-generation',refresh);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('xz-refresh-generation',refresh);};
 },[api,account?.id]);
 return null;
}
