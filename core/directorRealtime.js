import {Y,editDocument,readDocument,projectDocument,encode64,decode64,documentEpoch,documentProtocol,LIVE_PROTOCOL} from '../cloud-backend/shared/directorSharedDocument.mjs';
import {threeWayMerge} from './threeWayMerge.js';
export function createDirectorRealtime({readProject,applyProject,call,load=async()=>null,save=async()=>{},archiveLocal=async()=>{},flush=()=>{},status=()=>{}}){
 let doc=null,baseline=null,serverVector=null,pending=null,live=false,inFlight=null,lifecycle=0,initializing=false,denied=false,retryAt=0,repairing=false;
 let changeCount=0,ackCount=0,lastProject=null,lastCheckpoint=null,documentRevision=0,fileBase=null;
 const request=p=>call({protocol:LIVE_PROTOCOL,...p});
 const checkpoint=()=>{if(!doc)return Promise.resolve();const stamp=JSON.stringify([documentEpoch(doc),documentRevision,changeCount,ackCount,pending?.updateId]);if(stamp===lastCheckpoint)return Promise.resolve();return Promise.resolve(save({protocol:LIVE_PROTOCOL,epoch:documentEpoch(doc),state:encode64(Y.encodeStateAsUpdate(doc)),baseline,vector:serverVector,pending,changeCount,ackCount,fileBase,savedAt:Date.now()})).then(()=>{lastCheckpoint=stamp;});};
 function attach(next){doc?.destroy();doc=next;doc.on('update',(_u,origin)=>{documentRevision++;if(origin==='local')changeCount++;});}
 function capture(){if(!doc||!baseline)return;const project=readProject();if(!project||project===lastProject)return;const next=projectDocument(project);editDocument(doc,baseline,next,'local');baseline=next;lastProject=project;}
 async function archive(value,reason,id){await archiveLocal({document:{...value,promptHistory:readProject()?.promptHistory||[]},reason,id:id||`${reason}:${doc?documentEpoch(doc):'legacy'}`});}
 function paused(result){if(!result.repairRequired&&!result.migrationRequired)return false;retryAt=Date.now()+5000;status(result.repairRequired?'repair':'locked',result.repairRequired?'检测到旧版协作合并异常，已暂停同步。请制片预览并修复；本地内容仍保留。':'项目已锁定，解锁后才能升级协作数据',result);return true;}
 function canonical(result){if(!result.update)throw Error('协作服务没有返回可用基准');const d=new Y.Doc();try{Y.applyUpdate(d,decode64(result.update));if(documentProtocol(d)!==LIVE_PROTOCOL||!documentEpoch(d)||result.epoch&&result.epoch!==documentEpoch(d))throw Error('协作基准无效，请更新软件或稍后重连');return d;}catch(e){d.destroy();throw e;}}
 async function adopt(result,reason){const generation=lifecycle;await archive(projectDocument(readProject()),reason);if(!live||generation!==lifecycle)return;attach(canonical(result));changeCount=ackCount=0;pending=null;documentRevision=0;lastCheckpoint=null;baseline=readDocument(doc);serverVector=result.vector;fileBase=baseline;applyProject(baseline,{...result,replaceHistory:true});lastProject=readProject();await checkpoint();status(result.locked?'locked':'synced');}
 async function start(){if(initializing||repairing)return;live=true;const generation=++lifecycle;initializing=true;status('connecting');let cachedDoc;
  try{const cached=await load();if(!live||generation!==lifecycle)return;
   while(flush()===false){if(!live||generation!==lifecycle)return;await new Promise(r=>setTimeout(r,20));}
   if(cached?.state){cachedDoc=new Y.Doc();Y.applyUpdate(cachedDoc,decode64(cached.state));}
   const result=await request({});if(!live||generation!==lifecycle)return;if(paused(result))return;
   while(flush()===false){if(!live||generation!==lifecycle)return;await new Promise(r=>setTimeout(r,20));}
   const remoteDoc=canonical(result),compatible=cachedDoc&&documentProtocol(cachedDoc)===LIVE_PROTOCOL&&documentEpoch(cachedDoc)===documentEpoch(remoteDoc);
   if(compatible){attach(cachedDoc);cachedDoc=null;changeCount=cached.changeCount||0;ackCount=cached.ackCount||0;pending=cached.pending||null;fileBase=cached.fileBase||cached.baseline;baseline=readDocument(doc);
    if(Date.parse(readProject()?.updatedAt||0)>Number(cached.savedAt||0)){const local=projectDocument(readProject());let merged;try{merged=threeWayMerge(fileBase||baseline,local,baseline);}catch(e){if(!/同时被修改/.test(e.message))throw e;await archive(baseline,'重启前的协作缓存稿',`restart-cache:${cached.savedAt}`);await archive(local,'重启时较新的本地稿',`restart-file:${cached.savedAt}`);merged=threeWayMerge(fileBase||baseline,local,baseline,'文档','local');}if(!live||generation!==lifecycle){remoteDoc.destroy();return;}editDocument(doc,baseline,merged,'local');}
    Y.applyUpdate(doc,Y.encodeStateAsUpdate(remoteDoc),'remote');remoteDoc.destroy();
   }else{const local=projectDocument(readProject()),remote=readDocument(remoteDoc);if(cachedDoc){const recovered=readDocument(cachedDoc);if(JSON.stringify(recovered)!==JSON.stringify(local))await archive(recovered,'旧协作缓存中的离线稿',`cache:${cached.savedAt||'legacy'}`);}if(cached?.state||JSON.stringify(local)!==JSON.stringify(remote))await archive(local,'协作基准升级前本地副本',`baseline:${cached?.savedAt||documentEpoch(remoteDoc)}`);if(!live||generation!==lifecycle){remoteDoc.destroy();return;}attach(remoteDoc);changeCount=ackCount=0;pending=null;fileBase=remote;}
   lastCheckpoint=null;serverVector=result.vector;baseline=readDocument(doc);denied=false;retryAt=0;
   applyProject(baseline,{...result,replaceHistory:!compatible});lastProject=readProject();await checkpoint();status(result.locked?'locked':changeCount>ackCount?'syncing':'synced');
  }catch(e){if(live&&generation===lifecycle){baseline=null;if(e.status===403||e.status===401||/不在协作项目|不可访问|没有.*权限|请先登录|已被停用/.test(e.message)){denied=true;applyProject(projectDocument(readProject()),{locked:true,denied:true,myRole:readProject()?.cloudRole});lastProject=readProject();}status('error',e.message);throw e;}}finally{cachedDoc?.destroy();initializing=false;}
 }
 async function sync({checkpoint:archiveCheckpoint=false}={}){
  if(!live||initializing||repairing||!doc||!baseline)return;if(inFlight)return archiveCheckpoint?inFlight.then(()=>sync({checkpoint:true})):inFlight;
  const generation=lifecycle;
  inFlight=Promise.resolve().then(async()=>{try{
   if(!live||generation!==lifecycle)return;
   if(flush()===false)return;capture();const delta=Y.encodeStateAsUpdate(doc,serverVector?decode64(serverVector):undefined);
   if(!pending&&changeCount>ackCount)pending={update:encode64(delta),updateId:crypto.randomUUID(),revision:changeCount};
   await checkpoint();if(!live||generation!==lifecycle)return;status(pending?'syncing':'synced');
   const result=await request({epoch:documentEpoch(doc),vector:encode64(Y.encodeStateVector(doc)),...(!denied&&!readProject()?.cloudLocked&&pending?{update:pending.update,updateId:pending.updateId}:{}),...(archiveCheckpoint&&!denied&&!readProject()?.cloudLocked?{checkpoint:true}:{})});
   if(!live||generation!==lifecycle)return;denied=false;if(paused(result))return;
   // Flush human changes made during the request BEFORE integrating peers.
   if(flush()===false)return;capture();
   if(result.reset||result.epoch&&result.epoch!==documentEpoch(doc)){await adopt(result,'共享历史恢复前本地副本');return;}
   const revisionBefore=documentRevision;Y.applyUpdate(doc,decode64(result.update),'remote');serverVector=result.vector;
   if(pending&&result.ack===pending.updateId){ackCount=Math.max(ackCount,pending.revision||changeCount);pending=null;}
   if(revisionBefore!==documentRevision||result.locked!==Boolean(readProject()?.cloudLocked)){baseline=readDocument(doc);applyProject(baseline,result);lastProject=readProject();}
   await checkpoint();status(result.locked?'locked':changeCount>ackCount?'syncing':'synced');
  }catch(e){if(live&&generation===lifecycle){
    if(e.status===423||/锁定/.test(e.message)){if(flush()!==false)capture();applyProject(projectDocument(readProject()),{locked:true,myRole:readProject()?.cloudRole});lastProject=readProject();await checkpoint();status('locked',e.message);}
    else if(e.status===403||e.status===401||/不在协作项目|不可访问|没有.*权限/.test(e.message)){denied=true;if(flush()!==false)capture();applyProject(projectDocument(readProject()),{locked:true,denied:true,myRole:readProject()?.cloudRole});lastProject=readProject();await checkpoint();status('error',e.message);}
    else status('error',e.message);
   }}finally{inFlight=null;}});return inFlight;
 }
 return {start,sync:options=>baseline?sync(options):Date.now()<retryAt?Promise.resolve():start().then(()=>sync(options)),capture,
  async repair(action,summary){repairing=true;try{if(inFlight)await inFlight;if(flush()===false)throw Error('请先结束当前文字输入，再预览修复');capture();const generation=lifecycle;const result=await request({repair:action,expectedRevision:summary?.revision,fingerprint:summary?.fingerprint});if(!live||generation!==lifecycle)throw Error('项目或账号已切换，请重新打开修复预览');if(action==='apply'){if(paused(result))throw Error('修复未完成，请重新预览');await adopt(result,'协作修复前本地副本');retryAt=0;}return result;}finally{repairing=false;}},
  async stop(){live=false;lifecycle++;flush();capture();await checkpoint();doc?.destroy();doc=null;baseline=null;serverVector=null;pending=null;},ready:()=>Boolean(doc&&baseline&&!initializing),getDocument:()=>doc};
}
