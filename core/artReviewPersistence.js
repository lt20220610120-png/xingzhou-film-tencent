import {importLegacyArtReview,isReviewCurrent,isSceneVerified,reviewLedgerSignature,reviewSceneSignature} from './artReview.js';
import {listCollabEpisodes} from './collabEpisodes.js';

const stores=new Map();
const fullyPublished=record=>Boolean(record?.scenes?.length&&record.scenes.every(scene=>record.published?.[scene.id]?.signature===reviewSceneSignature(scene)));
const hasLocalDraft=record=>Boolean(record?.pending||record&&record.status!=='empty'&&!fullyPublished(record));
export function getArtReviewStore({api,projectId,accountId=''}){
 const key=`${accountId}:${projectId}`;
 if(stores.has(key))return stores.get(key);
 let ledger={episodes:{}},loaded=false,episodes=[],chain=Promise.resolve();const listeners=new Set();
 const notify=()=>listeners.forEach(fn=>{try{fn();}catch{}});
 const enqueue=fn=>{const promise=chain.then(fn);chain=promise.catch(()=>{});return promise;};
 // Do not expose an edit or cloud acknowledgement until its local checkpoint succeeds.
 const persist=async next=>{await api.artReviewSaveLocal({projectId,data:structuredClone(next)});ledger=next;notify();};
 const persistRecord=async(number,record)=>{const next=structuredClone(ledger);next.episodes[number]=record;await persist(next);return record;};
 const publishFailure=async(number,error)=>{await persistRecord(number,{...ledger.episodes[number],syncError:String(error.message||error)});throw error;};
 const alreadyUploaded=record=>Boolean(!record.pending&&(record.version||0)>0||record.writeId&&record.uploadedWriteId===record.writeId);
 const remoteData=record=>{const data=structuredClone(record);for(const key of ['pending','writeId','syncError','publishRequest','uploadedWriteId','cloudReceipt'])delete data[key];return data;};
 const acknowledge=async(number,receipt,saved)=>{
  const current=ledger.episodes[number],unchanged=current.writeId===receipt.draftWriteId;
  // Recover only the cloud version and publication metadata. A newer local draft
  // keeps its descriptions, approvals, generation result and new write ID.
  const next={...current,version:saved.version,lastWriteId:saved.lastWriteId,published:structuredClone(saved.published||{}),managedAssetNames:structuredClone(saved.managedAssetNames||[]),updatedAt:saved.updatedAt,updatedBy:saved.updatedBy};
  delete next.cloudReceipt;delete next.syncError;
  if(receipt.kind==='save'&&unchanged)next.uploadedWriteId=current.writeId;
  if(receipt.kind==='publish'){
   delete next.publishRequest;delete next.uploadedWriteId;
   if(unchanged){next.pending=false;delete next.writeId;}
  }
  return persistRecord(number,next);
 };
 const resolveReceipt=async number=>{
  const current=ledger.episodes[number],receipt=current.cloudReceipt;if(!receipt)return current;
  let saved;
  try{saved=receipt.kind==='publish'?await api.collabArtReviewPublish({projectId,...receipt.params}):await api.collabArtReviewSave({projectId,...receipt.params});}
  catch(error){return publishFailure(number,error);}
  return acknowledge(number,receipt,saved);
 };
 // This helper is called only by explicit publication, including its approved
 // prior-episode dependencies. Uploading a dependency does not publish its assets.
 const uploadForPublish=async number=>{
  let r=await resolveReceipt(number);if(alreadyUploaded(r))return r;
  if(!r.writeId)r=await persistRecord(number,{...r,writeId:crypto.randomUUID()});
  const receipt={kind:'save',draftWriteId:r.writeId,params:{episodeNumber:Number(number),baseVersion:r.version||0,writeId:r.writeId,data:remoteData(r)}};
  r=await persistRecord(number,{...r,cloudReceipt:receipt});
  let saved;
  try{saved=await api.collabArtReviewSave({projectId,...receipt.params});}
  catch(error){return publishFailure(number,error);}
  return acknowledge(number,receipt,saved);
 };
 const publicationDependencies=number=>{
  const dependencies=new Set();
  const visit=n=>{
   const record=ledger.episodes[n];
   for(const [key,stamp]of Object.entries(record.dependencies||{})){
    const prior=Number(key),dependency=ledger.episodes[key];
    if(!Number.isInteger(prior)||prior<1||prior>=Number(n))throw Error('前集核实依赖格式不正确，请重新生成本集并复核');
    if(!dependency||reviewLedgerSignature(dependency)!==stamp||!isReviewCurrent(dependency,episodes.find(e=>e.episodeNumber===prior)))throw Error(`第 ${prior} 集核实清单或正文已变化，请重新生成本集并复核`);
    if(!dependencies.has(prior)){dependencies.add(prior);visit(prior);}
   }
  };
  visit(number);return [...dependencies].sort((a,b)=>a-b);
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
  // Compatibility for old callers: retrying a local checkpoint never uploads it.
  sync(){return enqueue(async()=>{await persist(structuredClone(ledger));return ledger;});},
  publish(number,sceneIds){return enqueue(async()=>{
   let r=ledger.episodes[number];if(!r)throw Error('请先读取本集核实清单');
   if(!Array.isArray(sceneIds)||!sceneIds.length||new Set(sceneIds).size!==sceneIds.length)throw Error('请选择已核实场景');
   for(const id of sceneIds){const scene=r.scenes.find(s=>s.id===id);if(!scene||!isSceneVerified(scene))throw Error(`场景 ${id} 尚未核实或细节待补齐`);}
   const dependencies=publicationDependencies(number);
   const ids=[...sceneIds].sort();
   r=await resolveReceipt(number);
   if(!r.pending&&ids.every(id=>r.published?.[id]?.signature===reviewSceneSignature(r.scenes.find(s=>s.id===id))))return r;
   let request=r.publishRequest;
   if(!request||JSON.stringify(request.sceneIds)!==JSON.stringify(ids)){
    request={writeId:crypto.randomUUID(),sceneIds:ids,...(alreadyUploaded(r)?{uploadedVersion:r.version}:{})};
    r=await persistRecord(number,{...r,writeId:r.writeId||crypto.randomUUID(),publishRequest:request});
   }
   for(const prior of dependencies)await uploadForPublish(prior);
   if(request.uploadedVersion===undefined){r=await uploadForPublish(number);request={...request,uploadedVersion:r.version};r=await persistRecord(number,{...r,publishRequest:request});}
   const receipt={kind:'publish',draftWriteId:r.writeId,params:{episodeNumber:Number(number),baseVersion:request.uploadedVersion,sceneIds:ids,writeId:request.writeId}};
   await persistRecord(number,{...r,pending:true,cloudReceipt:receipt});
   let saved;
   try{saved=await api.collabArtReviewPublish({projectId,...receipt.params});}
   catch(error){return publishFailure(number,error);}
   return acknowledge(number,receipt,saved);
  });},
  useCloud(number,project){return enqueue(async()=>{
   const remote=project.analysis_progress?.[number]?.review;if(!remote)throw Error('云端尚无本集核实清单');
   const old=ledger.episodes[number],record={...structuredClone(remote),pending:false,history:[...(remote.history||[]),{reason:'保留同步冲突本地版本',at:Date.now(),previous:structuredClone(old)}]};
   delete record.writeId;delete record.syncError;delete record.publishRequest;delete record.uploadedWriteId;delete record.cloudReceipt;
   await persistRecord(number,record);return ledger;
  });},
 };
 stores.set(key,store);return store;
}
export function summarizeArtReview(ledger,project){
 const records=Object.entries(ledger.episodes||{}).filter(([,r])=>r.status!=='empty'),published=records.filter(([,r])=>!r.pending&&fullyPublished(r)),pending=records.filter(([,r])=>r.pending||!fullyPublished(r));
 return {completed:records.length,published:published.length,pending:pending.length,pendingEpisodes:pending.map(([n])=>Number(n)),warnings:records.flatMap(([,r])=>r.warnings||[]),syncErrors:records.filter(([,r])=>r.syncError).map(([n,r])=>({episode:Number(n),error:r.syncError})),stale:project?listCollabEpisodes(project.episodes).filter(e=>!isReviewCurrent(ledger.episodes[e.episodeNumber],e)).length:0};
}
