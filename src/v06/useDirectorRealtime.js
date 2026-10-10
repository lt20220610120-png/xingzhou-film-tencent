import {useEffect,useRef,useState} from 'react';
import {createDirectorRealtime} from '../../core/directorRealtime.js';
import {flushEditing} from '../editing.js';
export function useDirectorRealtime({project,accountId,active,api,setState,getProject}){
 const [notice,setNotice]=useState({stage:'connecting',message:''}),[directoryEpoch,setDirectoryEpoch]=useState(0);
 useEffect(()=>{const changed=()=>setDirectoryEpoch(v=>v+1);window.addEventListener('xz-storage-changed',changed);return()=>window.removeEventListener('xz-storage-changed',changed);},[]);
 const current=useRef(null),composing=useRef(false),latest=useRef(null);latest.current={getProject,setState,accountId,projectId:project?.id};
 useEffect(()=>{const on=()=>{composing.current=true;},off=()=>{composing.current=false;};document.addEventListener('compositionstart',on,true);document.addEventListener('compositionend',off,true);return()=>{document.removeEventListener('compositionstart',on,true);document.removeEventListener('compositionend',off,true);};},[]);
 useEffect(()=>{
  if(!active||!project?.cloudProjectId||!api.directorCollabSyncLive)return;
  let disposed=false;const id=project.id,projectId=project.cloudProjectId;let boundProject=project;const scopeReady=Promise.resolve(api.storageInfo?.()).then(info=>({projectId,accountId,dataDir:info?.dataDir||''}));
  const engine=createDirectorRealtime({
   readProject:()=>{if(!disposed&&latest.current.accountId===accountId&&latest.current.projectId===id)boundProject=latest.current.getProject(id)||boundProject;return boundProject;},
   applyProject:(value,receipt)=>{if(disposed)return;latest.current.setState(s=>({...s,directorProjects:s.directorProjects.map(p=>p.id!==id?p:{...p,name:value.name,masterScript:value.script,episodes:value.episodes,style:value.style,aspectRatio:value.aspectRatio,cloudLive:true,cloudBase:undefined,cloudRemote:undefined,pendingCloudSubmission:undefined,cloudConflict:'',cloudSyncError:'',cloudLocked:receipt.locked,canWrite:receipt.denied?false:true,cloudRole:receipt.myRole})}));},
   call:payload=>api.directorCollabSyncLive({projectId,...payload}),
   load:async()=>api.directorLiveLoadLocal?.(await scopeReady),save:async data=>api.directorLiveSaveLocal?.({...await scopeReady,data}),
   flush:()=>{if(disposed||latest.current.accountId!==accountId||latest.current.projectId!==id)return false;if(composing.current)return false;flushEditing();return true;},
   status:(stage,message='')=>{if(!disposed&&stage==='error'&&/同时被修改|旧版未上传修改存在冲突/.test(message))latest.current.setState(s=>({...s,directorProjects:s.directorProjects.map(p=>p.id===id?{...p,cloudConflict:message}:p)}));if(!disposed)setNotice(n=>n.stage===stage&&n.message===message?n:{stage,message});},
  });current.current=engine;
  engine.start().catch(()=>{});const timer=setInterval(()=>{if(!latest.current.getProject(id)?.cloudConflict)engine.sync().catch(()=>{});},1000);
  return()=>{disposed=true;clearInterval(timer);if(current.current===engine)current.current=null;engine.stop().catch(()=>{});};
 },[accountId,project?.cloudProjectId,active,directoryEpoch]);
 useEffect(()=>{current.current?.capture();},[project]);
 return {...notice,sync:options=>current.current?.sync(options).catch(()=>{}),ready:()=>current.current?.ready()};
}
