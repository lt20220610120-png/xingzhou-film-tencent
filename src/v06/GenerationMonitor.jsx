import {useEffect,useRef} from 'react';
import {generationMediaProfiles,historicalMediaProfile} from '../../core/canvasStore.js';
export function GenerationMonitor({state,api,account}) {
 const current=useRef({state,account});current.current={state,account};
 useEffect(()=>{
  let stopped=false,busy=false;
  const refresh=async()=>{
   if(busy||!current.current.account)return;busy=true;
   try{
    const rows=await api.generationList({includeArchived:true});
    for(let job of rows){
     if(stopped)break;
     if(job.archived&&!job.clearedWhileActive)continue;
     const profile=generationMediaProfiles(current.current.state,job.kind).find(p=>p.id===job.profileId)||historicalMediaProfile(current.current.state,job.profileId);
     if((['libtv','likeai'].includes(job.provider)||job.downloadReceiptId || ((job.jobId||job.url)&&profile&&(profile.apiKey||profile.videoAdapter?.authMode==='none')))&&!['success','failed'].includes(job.status)&&(job.status!=='uncertain'||job.provider==='likeai')&&(!job.nextPollAt||Date.now()>=job.nextPollAt))job=await api.generationRefresh({id:job.id,apiKey:profile?.apiKey,endpoint:profile?.endpoint});
     if(job.status==='success'&&job.projectId&&!job.mediaId){
      try{const existing=await api.collabListMedia({projectId:job.projectId});
       const found=existing.find(m=>m.filename===job.filePath?.split(/[\\/]/).pop());
       const media=found||await api.collabRecordGeneratedMedia({projectId:job.projectId,episode:job.episode,scene:job.scene,kind:job.kind,filePath:job.filePath,note:`${job.shotLabel} [shot:${job.shotId}]`});
       await api.generationRecorded({id:job.id,mediaId:media.id});
      }catch{/* The local result remains downloadable; retry cloud upload on the next refresh. */}
     }
    }
   }catch{/* A later poll recovers transient IPC/network errors. */}finally{busy=false;}
  };
  refresh();const timer=setInterval(refresh,30000);window.addEventListener('xz-refresh-generation',refresh);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('xz-refresh-generation',refresh);};
 },[api]);
 return null;
}
