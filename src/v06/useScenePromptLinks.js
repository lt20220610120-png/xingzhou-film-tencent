import {useEffect,useMemo,useState} from 'react';
import {bindingSnapshot} from '../../core/promptArtBinding.js';
import {selectBindingVersion,saveBindingVersion} from '../../core/promptBindingVersions.js';
import {assignCardToPrompts,cardPromptIds} from '../../core/scenePromptAssignments.js';

export const BINDING_SAVED_EVENT='xingzhou-prompt-binding-saved';
export function notifyBindingSaved(projectId,accountId,data){window.dispatchEvent(new CustomEvent(BINDING_SAVED_EVENT,{detail:{projectId,accountId,data}}));}

export default function useScenePromptLinks({project,ledger,assets,api,accountId,enabled,canEdit}){
 const [saved,setSaved]=useState(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let alive=true;setLoaded(false);setSaved(null);
  if(enabled)Promise.resolve(api.promptArtLoad({projectId:project.id,accountId})).then(data=>{if(alive){setSaved(data);setLoaded(true);}}).catch(e=>alive&&setError(e.message));
  const sync=event=>{const d=event.detail;if(d.projectId===project.id&&d.accountId===accountId&&alive){setSaved(d.data);setLoaded(true);}};
  window.addEventListener(BINDING_SAVED_EVENT,sync);return()=>{alive=false;window.removeEventListener(BINDING_SAVED_EVENT,sync);};
 },[api,project.id,accountId,enabled]);
 const current=useMemo(()=>bindingSnapshot(project,ledger,assets,saved?.snapshot),[project,ledger,assets,saved?.snapshot]);
 const {snapshot,decisions}=useMemo(()=>selectBindingVersion(current,saved),[current,saved]);
 const links=(sceneId,item)=>{
  const card=snapshot.cards.find(card=>card.sceneIds.includes(sceneId)&&card.category===item.category&&card.name===item.name);
  const ids=card?cardPromptIds(snapshot,decisions,sceneId,card.uid):[];
  return {card,ids,entries:snapshot.entries.filter(entry=>entry.sceneId===sceneId)};
 };
 const assign=async(sceneId,item,ids)=>{
  if(!canEdit||!loaded||busy)throw Error('正在读取或保存关联，请稍后再试');
  setBusy(true);setError('');try{
   const latest=await api.promptArtLoad({projectId:project.id,accountId}),fresh=bindingSnapshot(project,ledger,assets,latest?.snapshot),selected=selectBindingVersion(fresh,latest);
   const card=selected.snapshot.cards.find(card=>card.sceneIds.includes(sceneId)&&card.category===item.category&&card.name===item.name);
   if(!card)throw Error('本场资产已变化，请重新打开关联');
   const nextDecisions=assignCardToPrompts(selected.snapshot,selected.decisions,sceneId,card.uid,ids);
   const data=await api.promptArtSave({projectId:project.id,accountId,baseRevision:latest?.revision||0,data:saveBindingVersion(latest,selected.snapshot,nextDecisions)});
   setSaved(data);notifyBindingSaved(project.id,accountId,data);
  }catch(e){setError(e.message);throw e;}finally{setBusy(false);}
 };
 return {links,assign,busy,error,loaded};
}
