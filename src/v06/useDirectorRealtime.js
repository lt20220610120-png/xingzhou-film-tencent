import {directorLiveWork} from '../../core/directorLiveProjection.js';
import {useEffect,useRef,useState} from 'react';
import {createDirectorRealtime} from '../../core/directorRealtime.js';
import {flushEditing} from '../editing.js';
export function useDirectorRealtime({project,accountId,active,api,setState,getProject}){
 const [notice,setNotice]=useState({stage:'connecting',message:''}),[directoryEpoch,setDirectoryEpoch]=useState(0);
 useEffect(()=>{const changed=()=>setDirectoryEpoch(v=>v+1);window.addEventListener('xz-storage-changed',changed);return()=>window.removeEventListener('xz-storage-changed',changed);},[]);
 const current=useRef(null),composing=useRef(false),latest=useRef(null),skipCache=useRef(null);latest.current={getProject,setState,accountId,projectId:project?.id,cloudProjectId:project?.cloudProjectId,directoryEpoch};
 useEffect(()=>{const on=()=>{composing.current=true;},off=()=>{composing.current=false;};document.addEventListener('compositionstart',on,true);document.addEventListener('compositionend',off,true);return()=>{document.removeEventListener('compositionstart',on,true);document.removeEventListener('compositionend',off,true);};},[]);
 useEffect(()=>{
  if(!active||!project?.cloudProjectId||!api.directorCollabSyncLive)return;
  let disposed=false;const id=project.id,projectId=project.cloudProjectId;let boundProject=project;const scopeReady=Promise.resolve(api.storageInfo?.()).then(info=>({projectId,accountId,dataDir:info?.dataDir||''}));
  const engine=createDirectorRealtime({
   readProject:()=>{if(!disposed&&latest.current.accountId===accountId&&latest.current.projectId===id)boundProject=latest.current.getProject(id)||boundProject;return boundProject;},
   applyProject:(value,receipt)=>{if(disposed)return;latest.current.setState(s=>({...s,directorProjects:s.directorProjects.map(p=>p.id!==id?p:{...p,name:value.name,masterScript:value.script,...directorLiveWork(p,value.episodes||[],receipt.replaceHistory),style:value.style,aspectRatio:value.aspectRatio,cloudLive:true,cloudLiveNeedsRepair:false,cloudBase:undefined,cloudRemote:undefined,pendingCloudSubmission:undefined,cloudConflict:'',cloudSyncError:'',cloudLocked:receipt.locked,canWrite:receipt.denied?false:true,cloudRole:receipt.myRole})}));},
   call:payload=>api.directorCollabSyncLive({projectId,...payload}),
   archiveLocal:async version=>{if(disposed||latest.current.accountId!==accountId||latest.current.projectId!==id)return;latest.current.setState(s=>({...s,directorProjects:s.directorProjects.map(p=>p.id!==id||p.localCollaborationVersions?.some(v=>v.id===version.id)?p:{...p,localCollaborationVersions:[...(p.localCollaborationVersions||[]),{...version,createdAt:new Date().toISOString()}]})}));},
   load:async()=>{const scope=JSON.stringify([accountId,id,projectId,directoryEpoch]);if(skipCache.current===scope){skipCache.current=null;return null;}return api.directorLiveLoadLocal?.(await scopeReady);},save:async data=>api.directorLiveSaveLocal?.({...await scopeReady,data}),
   flush:()=>{if(disposed||latest.current.accountId!==accountId||latest.current.projectId!==id)return false;if(composing.current)return false;flushEditing();return true;},
   status:(stage,message='',receipt)=>{if(!disposed&&receipt)latest.current.setState(s=>({...s,directorProjects:s.directorProjects.map(p=>p.id===id?{...p,cloudRole:receipt.myRole,cloudLocked:receipt.locked,cloudLiveNeedsRepair:Boolean(receipt.repairRequired)}:p)}));if(!disposed)setNotice(n=>n.stage===stage&&n.message===message?n:{stage,message});},
  });current.current=engine;
  engine.start().catch(()=>{});const timer=setInterval(()=>{engine.sync().catch(()=>{});},1000);
  return()=>{disposed=true;clearInterval(timer);if(current.current===engine)current.current=null;engine.stop().catch(()=>{});};
 },[accountId,project?.cloudProjectId,active,directoryEpoch]);
 useEffect(()=>{current.current?.capture();},[project]);
 const adoptRestored=async cloud=>{
  // A producer-confirmed restore is authoritative. Archive local edits first,
  // then reconnect without replaying a pre-restore cache over the chosen work.
  const engine=current.current,scope=latest.current;
  flushEditing();await engine?.stop();
  const now=latest.current;if(now.accountId!==scope.accountId||now.projectId!==scope.projectId||now.cloudProjectId!==scope.cloudProjectId||now.directoryEpoch!==scope.directoryEpoch||current.current!==engine)return;
  setState(s=>({...s,directorProjects:s.directorProjects.map(p=>p.id!==project.id?p:{...p,
   localCollaborationVersions:[...(p.localCollaborationVersions||[]),{id:crypto.randomUUID(),createdAt:new Date().toISOString(),document:{name:p.name,script:p.masterScript||'',episodes:p.episodes||[]}}],
   name:cloud.name,masterScript:cloud.script||'',...directorLiveWork(p,cloud.episodes||[],true),cloudBase:{name:cloud.name,script:cloud.script||'',episodes:cloud.episodes||[]},cloudRemote:undefined,cloudConflict:'',cloudSyncError:'',cloudBaselineMissing:false,pendingCloudSubmission:undefined
  })}));
  skipCache.current=JSON.stringify([scope.accountId,scope.projectId,scope.cloudProjectId,scope.directoryEpoch+1]);setDirectoryEpoch(v=>v+1);
 };
 return {...notice,adoptRestored,repair:(action,summary)=>current.current?.repair(action,summary),sync:options=>current.current?.sync(options),ready:()=>current.current?.ready()};
}
