import {Y,editDocument,readDocument,projectDocument,encode64,decode64} from '../cloud-backend/shared/directorSharedDocument.mjs';
import {threeWayMerge} from './threeWayMerge.js';
export function createDirectorRealtime({readProject,applyProject,call,load=async()=>null,save=async()=>{},flush=()=>{},status=()=>{}}){
 let doc=null,baseline=null,serverVector=null,pending=null,live=false,inFlight=null,epoch=0,initializing=false,denied=false;
 let changeCount=0,ackCount=0,lastProject=null,lastCheckpoint=null,documentRevision=0,fileBase=null;
 const checkpoint=()=>{if(!doc)return Promise.resolve();const stamp=JSON.stringify([documentRevision,changeCount,ackCount,pending?.updateId]);if(stamp===lastCheckpoint)return Promise.resolve();return Promise.resolve(save({state:encode64(Y.encodeStateAsUpdate(doc)),baseline,vector:serverVector,pending,changeCount,ackCount,fileBase,savedAt:Date.now()})).then(()=>{lastCheckpoint=stamp;});};
 function capture(){if(!doc||!baseline)return;const project=readProject();if(!project||project===lastProject)return;const next=projectDocument(project);editDocument(doc,baseline,next,'local');baseline=next;lastProject=project;}
 async function start(){if(initializing)return;live=true;const generation=++epoch;initializing=true;status('connecting');
  try{const cached=await load();if(!live||generation!==epoch)return;
   while(flush()===false){if(!live||generation!==epoch)return;await new Promise(r=>setTimeout(r,20));}
   doc?.destroy();doc=new Y.Doc();changeCount=cached?.changeCount||0;ackCount=cached?.ackCount||0;doc.on('update',(_u,origin)=>{documentRevision++;if(origin==='local'||origin==='migration')changeCount++;});if(cached?.state){Y.applyUpdate(doc,decode64(cached.state),'cache');baseline=cached.baseline||readDocument(doc);serverVector=cached.vector;pending=cached.pending||null;fileBase=cached.fileBase||baseline;if(Date.parse(readProject()?.updatedAt||0)>Number(cached.savedAt||0)){const local=projectDocument(readProject()),recovered=readDocument(doc);const merged=threeWayMerge(fileBase,local,recovered);editDocument(doc,recovered,merged,'local');}else{applyProject(readDocument(doc),{locked:Boolean(readProject()?.cloudLocked),myRole:readProject()?.cloudRole||'collaborator'});}baseline=readDocument(doc);lastProject=readProject();}
   const result=await call({vector:doc?encode64(Y.encodeStateVector(doc)):undefined});if(!live||generation!==epoch)return;
   while(flush()===false){if(!live||generation!==epoch)return;await new Promise(r=>setTimeout(r,20));}
   const old=readProject(),local=projectDocument(old);if(!fileBase)fileBase=local;Y.applyUpdate(doc,decode64(result.update),'remote');const remote=readDocument(doc);
   if(!cached?.state){
    const base=old.cloudBase?{...remote,...old.cloudBase,style:old.cloudBase.style??(remote.style?local.style:''),aspectRatio:old.cloudBase.aspectRatio??(remote.aspectRatio?local.aspectRatio:'')}:remote;
    if(old.cloudConflict)throw Error('旧版未上传修改存在冲突，请先在协作版本中保留并选择内容后，再开启实时协作');
    const merged=threeWayMerge(base,local,remote);editDocument(doc,remote,merged,'migration');
   }
   serverVector=result.vector;baseline=readDocument(doc);
   applyProject(baseline,result);lastProject=readProject();await checkpoint();if(live)status(result.locked?'locked':'synced');
  }catch(e){if(live&&generation===epoch){baseline=null;if(e.status===403||e.status===401||/不在协作项目|不可访问|没有.*权限|请先登录|已被停用/.test(e.message)){denied=true;const value=doc?readDocument(doc):null;applyProject(value||projectDocument(readProject()),{locked:true,denied:true,myRole:readProject()?.cloudRole});lastProject=readProject();}status('error',e.message);throw e;}}finally{initializing=false;}
 }
 async function sync({checkpoint:archive=false}={}){
  if(!live||initializing||!doc||!baseline)return;if(inFlight)return archive?inFlight.then(()=>sync({checkpoint:true})):inFlight;
  const generation=epoch;
  inFlight=(async()=>{try{
   if(flush()===false)return;capture();
   const delta=Y.encodeStateAsUpdate(doc,serverVector?decode64(serverVector):undefined);
   if(!pending&&changeCount>ackCount)pending={update:encode64(delta),updateId:crypto.randomUUID(),revision:changeCount};
   await checkpoint();if(!live||generation!==epoch)return;
   status(pending?'syncing':'synced');
   const result=await call({vector:encode64(Y.encodeStateVector(doc)),...(!denied&&!readProject()?.cloudLocked&&pending?{update:pending.update,updateId:pending.updateId}:{}),...(archive&&!denied&&!readProject()?.cloudLocked?{checkpoint:true}:{})});
   if(!live||generation!==epoch)return;denied=false;
   // Flush human changes made during the request BEFORE integrating peers.
   if(flush()===false){serverVector=result.vector;if(pending&&result.ack===pending.updateId){ackCount=Math.max(ackCount,pending.revision||changeCount);pending=null;}return;}
   capture();const revisionBefore=documentRevision;Y.applyUpdate(doc,decode64(result.update),'remote');
   serverVector=result.vector;if(pending&&result.ack===pending.updateId){ackCount=Math.max(ackCount,pending.revision||changeCount);pending=null;}
   if(revisionBefore!==documentRevision||result.locked!==Boolean(readProject()?.cloudLocked)){const materialized=readDocument(doc);baseline=materialized;applyProject(materialized,result);lastProject=readProject();}
   await checkpoint();status(result.locked?'locked':changeCount>ackCount?'syncing':'synced');
  }catch(e){if(live&&generation===epoch){
    if(e.status===423||/锁定/.test(e.message)){try{const receipt=await call({vector:encode64(Y.encodeStateVector(doc))});if(live&&generation===epoch){capture();Y.applyUpdate(doc,decode64(receipt.update),'remote');baseline=readDocument(doc);applyProject(baseline,receipt);lastProject=readProject();status('locked',e.message);}}catch{status('error',e.message);}}
    else if(e.status===403||/不在协作项目|不可访问|没有.*权限/.test(e.message)){denied=true;applyProject(readDocument(doc),{locked:true,denied:true,myRole:readProject()?.cloudRole});lastProject=readProject();status('error',e.message);}
    else status('error',e.message);
   }}finally{inFlight=null;}})();return inFlight;
 }
 return {start,sync:options=>baseline?sync(options):start().then(()=>sync(options)),capture,async stop(){live=false;epoch++;flush();capture();await checkpoint();doc?.destroy();doc=null;baseline=null;serverVector=null;pending=null;},ready:()=>Boolean(doc&&baseline&&!initializing),getDocument:()=>doc};
}
