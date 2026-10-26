import {useEffect,useRef,useState} from 'react';
import {loadFreshBinding} from '../../core/promptArtBinding.js';
import {BINDING_SAVED_EVENT} from './useScenePromptLinks.js';

// Read-only consumers share the canonical saved prompt decisions. This never
// runs AI, builds new mappings or derives relationships from asset names.
export default function useProjectPromptBinding({api,project,assets,accountId,localSources}){
 const [value,setValue]=useState({data:null,loading:Boolean(api.promptArtLoad&&api.promptArtStatus)}),ticket=useRef(0);
 useEffect(()=>{
  let alive=true;
  const load=async()=>{
   const request=++ticket.current;
   if(!api.promptArtLoad||!api.promptArtStatus){setValue({data:null,loading:false});return;}
   try{
    const status=await api.promptArtStatus();
    const data=status?.enabled?await loadFreshBinding({api,projectId:project.id,accountId,localSources:localSources||[],allowUnbound:true}):null;
    if(alive&&request===ticket.current)setValue({data,loading:false});
   }catch(error){if(alive&&request===ticket.current)setValue({data:{error:error.message},loading:false});}
  };
  void load();
  const sync=event=>{if(event.detail.projectId===project.id&&event.detail.accountId===accountId)void load();};
  window.addEventListener(BINDING_SAVED_EVENT,sync);
  return()=>{alive=false;ticket.current++;window.removeEventListener(BINDING_SAVED_EVENT,sync);};
 },[api,project.id,project.episodes,project.analysis_progress,assets,accountId,localSources]);
 return value;
}
