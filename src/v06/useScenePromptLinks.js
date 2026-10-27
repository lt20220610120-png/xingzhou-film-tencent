import {useEffect,useMemo,useRef,useState} from 'react';
import {bindingSnapshot} from '../../core/promptArtBinding.js';
import {selectBindingVersion,saveBindingVersion} from '../../core/promptBindingVersions.js';
import {assignCardToPrompts,cardPromptIds} from '../../core/scenePromptAssignments.js';
import {getPromptDistributionService} from '../../core/promptDistributionService.js';
import {getArtDistributionController} from '../../core/artAnalysisPipeline.js';
import {getArtReviewStore} from '../../core/artReviewPersistence.js';
import {resolvePromptMissingReferences,promptHumanReviewSignature} from '../../core/promptReviewBatch.js';

export const BINDING_SAVED_EVENT='xingzhou-prompt-binding-saved';
export function notifyBindingSaved(projectId,accountId,data){window.dispatchEvent(new CustomEvent(BINDING_SAVED_EVENT,{detail:{projectId,accountId,data}}));}

export default function useScenePromptLinks({project,ledger,assets,api,accountId,enabled,canEdit}){
 const [saved,setSaved]=useState(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const resolving=useRef(false);
 useEffect(()=>{let alive=true;setLoaded(false);setSaved(null);
  if(enabled)Promise.resolve(api.promptArtLoad({projectId:project.id,accountId})).then(data=>{if(alive){setSaved(data);setLoaded(true);}}).catch(e=>alive&&setError(e.message));
  const sync=event=>{const d=event.detail;if(d.projectId===project.id&&d.accountId===accountId&&alive){setSaved(d.data);setLoaded(true);}};
  window.addEventListener(BINDING_SAVED_EVENT,sync);return()=>{alive=false;window.removeEventListener(BINDING_SAVED_EVENT,sync);};
 },[api,project.id,accountId,enabled]);
 const current=useMemo(()=>bindingSnapshot(project,ledger,assets,saved?.snapshot),[project,ledger,assets,saved?.snapshot]);
 const {snapshot,decisions}=useMemo(()=>selectBindingVersion(current,saved),[current,saved]);
 const store=getArtReviewStore({api,projectId:project.id,accountId});
 const service=useMemo(()=>getPromptDistributionService({api,projectId:project.id,accountId,getContext:()=>({project,ledger:store.snapshot(),assets}),onSaved:data=>notifyBindingSaved(project.id,accountId,data)}),[api,project.id,accountId]);
 service.configure(()=>({project,ledger:store.snapshot(),assets}));
 const distributionController=useMemo(()=>getArtDistributionController({api,projectId:project.id,accountId}),[api,project.id,accountId]);
 distributionController.configure({project,store,existingAssets:assets,onBindingSaved:data=>notifyBindingSaved(project.id,accountId,data)});
 const [,render]=useState(0);useEffect(()=>{const update=()=>render(n=>n+1),a=service.subscribe(update),b=distributionController.subscribe(update);return()=>{a();b();};},[service,distributionController]);
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
 const skipMissingBatch=async(targets,versionId)=>{
  if(!canEdit||!loaded||busy||resolving.current)throw Error('正在读取或保存关联，请稍后再试');
  resolving.current=true;setBusy(true);setError('');
  try{
   const data=await resolvePromptMissingReferences({service,targets,versionId});
   setSaved(data);notifyBindingSaved(project.id,accountId,data);return data;
  }catch(e){setError(e.message);throw e;}finally{resolving.current=false;setBusy(false);}
 };
 const skipMissing=async(entryId,needId,versionId)=>{
  const selected=await service.read(versionId),entry=selected.snapshot.entries.find(e=>e.id===entryId);
  if(!entry)throw Error('提示词已变化，请重新打开');
  return skipMissingBatch([{entryId,needId,signature:promptHumanReviewSignature(selected.snapshot,entry,selected.decisions[entryId])}],selected.snapshot.versionId);
 };
 return {links,assign,skipMissing,skipMissingBatch,busy,error,loaded,service,distributionController,state:{snapshot,decisions,saved,ctx:{project,ledger,assets}}};
}
