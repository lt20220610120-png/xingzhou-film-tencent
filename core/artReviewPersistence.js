import {importLegacyArtReview,isReviewCurrent,isSceneVerified,reviewSceneSignature} from './artReview.js';
import {listCollabEpisodes} from './collabEpisodes.js';

const stores=new Map();
const fullyPublished=record=>Boolean(record?.scenes?.length&&record.scenes.every(scene=>record.published?.[scene.id]?.signature===reviewSceneSignature(scene)));
const hasLocalDraft=record=>Boolean(record?.pending||record&&record.status!=='empty'&&!fullyPublished(record));
export function getArtReviewStore({api,projectId,accountId=''}){
 const key=`${accountId}:${projectId}`;
 if(stores.has(key))return stores.get(key);
 let ledger={episodes:{}},loaded=false,episodes=[],chain=Promise.resolve(),cloudChain=Promise.resolve();const listeners=new Set();
 const notify=()=>listeners.forEach(fn=>{try{fn();}catch{}});
 const enqueue=fn=>{const promise=chain.then(fn);chain=promise.catch(()=>{});return promise;};
 const enqueueCloud=fn=>{const promise=cloudChain.then(fn);cloudChain=promise.catch(()=>{});return promise;};
 const patchRecord=(number,reduce)=>enqueue(()=>persistRecord(number,reduce(structuredClone(ledger.episodes[number]))));
 // Do not expose an edit or cloud acknowledgement until its local checkpoint succeeds.
 const persist=async next=>{await api.artReviewSaveLocal({projectId,data:structuredClone(next)});ledger=next;notify();};
 const persistRecord=async(number,record)=>{const next=structuredClone(ledger);next.episodes[number]=record;await persist(next);return record;};
 const publishFailure=async(number,error)=>{await patchRecord(number,r=>({...r,syncError:String(error.message||error)}));throw error;};
 const alreadyUploaded=record=>Boolean(!record.pending&&(record.version||0)>0||record.writeId&&record.uploadedWriteId===record.writeId);
 const remoteData=record=>{const data=structuredClone(record);for(const key of ['pending','writeId','syncError','publishRequest','uploadedWriteId','cloudReceipt'])delete data[key];return data;};
 const acknowledge=(number,receipt,saved)=>patchRecord(number,current=>{
  const unchanged=current.writeId===receipt.draftWriteId;
  // Recover only the cloud version and publication metadata. A newer local draft
  // keeps its descriptions, approvals, generation result and new write ID.
  const next={...current,version:saved.version,lastWriteId:saved.lastWriteId,published:structuredClone(saved.published||{}),managedAssetNames:structuredClone(saved.managedAssetNames||[]),updatedAt:saved.updatedAt,updatedBy:saved.updatedBy};
  delete next.cloudReceipt;delete next.syncError;
  if(receipt.kind==='save'&&unchanged)next.uploadedWriteId=current.writeId;
  if(receipt.kind==='publish'){
   delete next.publishRequest;delete next.uploadedWriteId;
   if(unchanged){next.pending=false;delete next.writeId;}
  }
  return next;
 });
 const resolveReceipt=async number=>{
  const current=ledger.episodes[number],receipt=current.cloudReceipt;if(!receipt)return current;
  let saved;
  try{saved=receipt.kind==='publish'?await api.collabArtReviewPublish({projectId,...receipt.params}):await api.collabArtReviewSave({projectId,...receipt.params});}
  catch(error){return publishFailure(number,error);}
  return acknowledge(number,receipt,saved);
 };
 // Only the episode explicitly selected for publication is uploaded.
 const uploadForPublish=async(number,snapshot)=>{
  const recovered=await resolveReceipt(number);
  let r={...structuredClone(snapshot),version:recovered.version};
  if(recovered.writeId===r.writeId&&alreadyUploaded(recovered)||!r.pending&&alreadyUploaded(r))return r;
  if(!r.writeId){r.writeId=crypto.randomUUID();await patchRecord(number,current=>current.writeId?current:{...current,writeId:r.writeId});}
  const receipt={kind:'save',draftWriteId:r.writeId,params:{episodeNumber:Number(number),baseVersion:r.version||0,writeId:r.writeId,data:remoteData(r)}};
  await patchRecord(number,current=>({...current,cloudReceipt:receipt}));
  let saved;
  try{saved=await api.collabArtReviewSave({projectId,...receipt.params});}
  catch(error){return publishFailure(number,error);}
  await acknowledge(number,receipt,saved);
  return {...r,version:saved.version,uploadedWriteId:r.writeId};
 };
 const store={
  snapshot:()=>ledger,
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  async load(project,assets=[]){return enqueue(async()=>{
   const next=loaded?structuredClone(ledger):await api.artReviewLoadLocal({projectId})||{episodes:{}};next.episodes||={};
   for(const [n,p]of Object.entries(project.analysis_progress||{}))if(p.review){
    const local=next.episodes[n];
    // Old pending checkpoints and unpublished results remain local, even when a
    // previous cloud write was acknowledged by a later project refresh.
    if(!local||!hasLocalDraft(local)&&(p.review.version||0)>(local.version||0))next.episodes[n]={...structuredClone(p.review),pending:false};
   }
   const legacy=await api.analysisLoad?.({projectId});
   for(const episode of listCollabEpisodes(project.episodes))if(!next.episodes[episode.episodeNumber]){
    const n=episode.episodeNumber,output=project.analysis_progress?.[n]?.output||legacy?.episodes?.[n]?.outputs?.filter(Boolean).join('\n\n')||'';
    const record=importLegacyArtReview(episode,{output,assets,genre:project.genre});
    next.episodes[n]={...record,pending:record.status!=='empty',...(record.status!=='empty'?{writeId:crypto.randomUUID()}:{})};
   }
   await persist(next);loaded=true;episodes=listCollabEpisodes(project.episodes);return ledger;
  });},
  update(number,reduce){return enqueue(async()=>{
   const current=ledger.episodes[number];if(!current)throw Error('请先读取本集核实清单');
   const next=reduce(structuredClone(current));next.version=current.version||0;next.pending=true;next.writeId=crypto.randomUUID();delete next.syncError;delete next.publishRequest;delete next.uploadedWriteId;
   if(current.cloudReceipt)next.cloudReceipt=structuredClone(current.cloudReceipt);
   return persistRecord(number,next);
  });},
  // A bulk approval uses one atomic disk write, not one full ledger write per scene.
  updateMany(changes){return enqueue(async()=>{
   const next=structuredClone(ledger),results=[];
   for(const {number,reduce}of changes){
    const current=next.episodes[number];if(!current)continue;
    const r=reduce(structuredClone(current));r.version=current.version||0;r.pending=true;r.writeId=crypto.randomUUID();delete r.syncError;delete r.publishRequest;delete r.uploadedWriteId;
    if(current.cloudReceipt)r.cloudReceipt=structuredClone(current.cloudReceipt);next.episodes[number]=r;results.push(r);
   }
   await persist(next);return results;
  });},
  // Compatibility for old callers: retrying a local checkpoint never uploads it.
  sync(){return enqueue(async()=>{await persist(structuredClone(ledger));return ledger;});},
  publish(number,sceneIds){
   // Freeze the exact approved content requested by the user in the local lane.
   const capture=enqueue(()=>{
   const r=ledger.episodes[number];if(!r)throw Error('请先读取本集核实清单');
   if(!isReviewCurrent(r,episodes.find(e=>e.episodeNumber===Number(number))))throw Error(`第 ${number} 集正文已变化，请重新读取本集并核实`);
   if(!Array.isArray(sceneIds)||!sceneIds.length||new Set(sceneIds).size!==sceneIds.length)throw Error('请选择已核实场景');
   for(const id of sceneIds){const scene=r.scenes.find(s=>s.id===id);if(!scene||!isSceneVerified(scene))throw Error(`场景 ${id} 尚未核实或细节待补齐`);}
   // Earlier ledgers are generation references, not publication dependencies.
   return {snapshot:structuredClone(r)};
   });
   capture.catch(()=>{}); // The cloud lane may still be handling an earlier request.
   return enqueueCloud(async()=>{
   const captured=await capture;let r=captured.snapshot;
   const ids=[...sceneIds].sort();
   const recovered=await resolveReceipt(number);
   r={...r,version:recovered.version,published:recovered.published};
   if(recovered.writeId===r.writeId){r.publishRequest=recovered.publishRequest;r.uploadedWriteId=recovered.uploadedWriteId;r.pending=recovered.pending;}
   if(!recovered.pending&&r.scenes.every(s=>reviewSceneSignature(s)===reviewSceneSignature(recovered.scenes.find(v=>v.id===s.id)))){r.pending=false;delete r.writeId;delete r.publishRequest;delete r.uploadedWriteId;}
   if(!r.pending&&ids.every(id=>r.published?.[id]?.signature===reviewSceneSignature(r.scenes.find(s=>s.id===id))))return r;
   let request=r.publishRequest;
   if(!request||JSON.stringify(request.sceneIds)!==JSON.stringify(ids)){
    request={writeId:crypto.randomUUID(),sceneIds:ids,...(alreadyUploaded(r)?{uploadedVersion:r.version}:{})};
    r={...r,writeId:r.writeId||crypto.randomUUID(),publishRequest:request};
    await patchRecord(number,current=>({...current,...(!current.writeId?{writeId:r.writeId}:{}),publishRequest:request}));
   }
   if(request.uploadedVersion===undefined){r=await uploadForPublish(number,r);request={...request,uploadedVersion:r.version};await patchRecord(number,current=>({...current,publishRequest:request}));}
   const receipt={kind:'publish',draftWriteId:r.writeId,params:{episodeNumber:Number(number),baseVersion:request.uploadedVersion,sceneIds:ids,writeId:request.writeId}};
   await patchRecord(number,current=>({...current,pending:true,cloudReceipt:receipt}));
   let saved;
   try{saved=await api.collabArtReviewPublish({projectId,...receipt.params});}
   catch(error){return publishFailure(number,error);}
   return acknowledge(number,receipt,saved);
  });},
  useCloud(number,project){return enqueueCloud(()=>enqueue(async()=>{
   const remote=project.analysis_progress?.[number]?.review;if(!remote)throw Error('云端尚无本集核实清单');
   const old=ledger.episodes[number],record={...structuredClone(remote),pending:false,history:[...(remote.history||[]),{reason:'保留同步冲突本地版本',at:Date.now(),previous:structuredClone(old)}]};
   delete record.writeId;delete record.syncError;delete record.publishRequest;delete record.uploadedWriteId;delete record.cloudReceipt;
   await persistRecord(number,record);return ledger;
  }));},
 };
 stores.set(key,store);return store;
}
export function summarizeArtReview(ledger,project){
 const records=Object.entries(ledger.episodes||{}).filter(([,r])=>r.status!=='empty'),published=records.filter(([,r])=>!r.pending&&fullyPublished(r)),pending=records.filter(([,r])=>r.pending||!fullyPublished(r));
 return {completed:records.length,published:published.length,pending:pending.length,pendingEpisodes:pending.map(([n])=>Number(n)),warnings:records.flatMap(([,r])=>r.warnings||[]),syncErrors:records.filter(([,r])=>r.syncError).map(([n,r])=>({episode:Number(n),error:r.syncError})),stale:project?listCollabEpisodes(project.episodes).filter(e=>!isReviewCurrent(ledger.episodes[e.episodeNumber],e)).length:0};
}
