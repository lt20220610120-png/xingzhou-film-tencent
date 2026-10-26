import {useEffect,useRef,useState} from 'react';
import {currentEntryBinding,saveDistribution} from '../../core/promptArtBinding.js';
import {saveBindingVersion} from '../../core/promptBindingVersions.js';
import {applySceneDistribution,sceneDistributionMessages,sceneDistributionStamp,shouldDistributeSceneEntry} from '../../core/scenePromptDistribution.js';
import {runBindingRepair} from '../../core/importedArtBinding.js';

// A claim is persisted before a request. Failed/interrupted claims require a
// deliberate retry; remounting or image publication must not create retry loops.
export default function useScenePromptDistribution({snapshot,decisions,saved,ready,loaded,canEdit,profile,api,persist,setError,setNotice,busy}){
 const latest=useRef();latest.current={snapshot,decisions,saved,canEdit};
 const active=useRef(false),mounted=useRef(false),attempted=useRef(new Set()),stopped=useRef(false);
 const [working,setWorking]=useState(false),[paused,setPaused]=useState(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const keyFor=(source,entry)=>source.versionId+':'+entry.id;
 async function distribute(entry,manual=false){
  if(active.current||busy||!profile||!loaded||!canEdit)return;
  active.current=true;stopped.current=false;setWorking(true);setError('');
  const captured=latest.current,stamp=sceneDistributionStamp(captured.snapshot,entry),key=keyFor(captured.snapshot,entry);
  attempted.current.add(key+':'+stamp);
  const seed=currentEntryBinding(captured.snapshot,entry,captured.decisions[entry.id]);
  const isStopped=()=>!mounted.current||stopped.current||!latest.current.canEdit;
  let claimed;
  try{
   const claim={stamp,status:'running',label:entry.label};
   claimed=await persist({...saveBindingVersion(captured.saved,captured.snapshot,captured.decisions),sceneDistributionAttempts:{...captured.saved?.sceneDistributionAttempts,[key]:claim}});
   if(isStopped())return;
   setNotice(`${manual?'重新':'自动'}分发 ${entry.label}…`);
   const result=await runBindingRepair({messages:sceneDistributionMessages(captured.snapshot,entry,seed),call:messages=>api.aiChat({...profile,profileId:profile.id,messages,taskId:crypto.randomUUID(),maxOutputTokens:8192}),isStopped,validate:raw=>applySceneDistribution(captured.snapshot,entry,seed,raw)});
   if(isStopped())return;
   if(latest.current.snapshot.signature!==captured.snapshot.signature)throw Error('来源已变化，旧分发未应用');
   if(Number(latest.current.saved?.revision||0)>claimed.revision)throw Error('分发期间关联已被修改，已保留最新人工选择，请重新分发');
   const base=latest.current.saved?.revision>=claimed.revision?latest.current.saved:claimed;
   const next=saveBindingVersion(base,captured.snapshot,{...captured.decisions,[entry.id]:saveDistribution(captured.snapshot,entry,result)});
   await persist({...next,sceneDistributionAttempts:{...base.sceneDistributionAttempts,[key]:{stamp,status:'done',label:entry.label}}});
   if(mounted.current)setNotice(`已分发 ${entry.label}`);
  }catch(problem){
   if(mounted.current){
    setError(`${entry.label}：${problem.message}。可手动关联或重新分发。`);
    // CAS prevents an older task from overwriting another window's edits.
    if(claimed&&latest.current.snapshot.signature===captured.snapshot.signature){
     const base=latest.current.saved?.revision>=claimed.revision?latest.current.saved:claimed;
     try{await persist({...base,sceneDistributionAttempts:{...base.sceneDistributionAttempts,[key]:{stamp,status:'failed',label:entry.label,error:problem.message}}});}catch{/* persist exposes the conflict */}
     if(mounted.current)setError(`${entry.label}：${problem.message}。可手动关联或重新分发。`);
    }
   }
  }finally{active.current=false;if(mounted.current)setWorking(false);}
 }
 useEffect(()=>{
  if(!loaded||!canEdit||!profile||busy||working||paused||active.current)return;
  const target=snapshot.entries.find(entry=>!attempted.current.has(keyFor(snapshot,entry)+':'+sceneDistributionStamp(snapshot,entry))&&shouldDistributeSceneEntry(snapshot,entry,ready,decisions[entry.id],saved?.sceneDistributionAttempts?.[keyFor(snapshot,entry)]));
  if(target)void distribute(target);
 },[loaded,canEdit,profile,busy,working,paused,snapshot,decisions,saved,ready]);
 return {working,paused,redistribute:entry=>distribute(entry,true),stop:()=>{stopped.current=true;setPaused(true);setNotice('已停止自动分发，可继续人工审核');},resume:()=>{stopped.current=false;setPaused(false);}};
}
