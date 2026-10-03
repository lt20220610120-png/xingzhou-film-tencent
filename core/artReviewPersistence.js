import {importLegacyArtReview,isReviewCurrent} from './artReview.js';
import {listCollabEpisodes} from './collabEpisodes.js';

const stores=new Map();
export function getArtReviewStore({api,projectId,accountId=''}){
 const key=`${accountId}:${projectId}`;
 if(stores.has(key))return stores.get(key);
 let ledger={episodes:{}},loaded=false,chain=Promise.resolve();const listeners=new Set();
 const notify=()=>listeners.forEach(fn=>fn());
 const enqueue=fn=>{const promise=chain.then(fn);chain=promise.catch(()=>{});return promise;};
 const persist=async()=>{await api.artReviewSaveLocal({projectId,data:ledger});notify();};
 const syncOne=async(number)=>{
  const r=ledger.episodes[number];if(!r?.pending)return r;
  try{
   const saved=await api.collabArtReviewSave({projectId,episodeNumber:Number(number),baseVersion:r.version||0,writeId:r.writeId,data:r});
   ledger.episodes[number]={...saved,pending:false};await persist();return ledger.episodes[number];
  }catch(error){r.syncError=String(error.message||error);await persist();return r;}
 };
 const store={
  snapshot:()=>ledger,
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  async load(project,assets=[]){return enqueue(async()=>{
   if(!loaded){ledger=await api.artReviewLoadLocal({projectId})||{episodes:{}};ledger.episodes||={};loaded=true;}
   for(const [n,p]of Object.entries(project.analysis_progress||{}))if(p.review){const local=ledger.episodes[n];if(!local?.pending&&(p.review.version||0)>=(local?.version||0))ledger.episodes[n]=structuredClone(p.review);else if(local?.pending&&(p.review.version||0)>(local.version||0)&&p.review.lastWriteId===local.writeId)ledger.episodes[n]={...structuredClone(p.review),pending:false};}
   const legacy=await api.analysisLoad?.({projectId});
   for(const episode of listCollabEpisodes(project.episodes))if(!ledger.episodes[episode.episodeNumber]){
    const n=episode.episodeNumber,output=project.analysis_progress?.[n]?.output||legacy?.episodes?.[n]?.outputs?.filter(Boolean).join('\n\n')||'';
    ledger.episodes[n]=importLegacyArtReview(episode,{output,assets,genre:project.genre});
   }
   await persist();return ledger;
  });},
  update(number,reduce,{sync=true}={}){return enqueue(async()=>{
   const current=ledger.episodes[number];if(!current)throw Error('请先读取本集核实清单');
   const next=reduce(structuredClone(current));next.version=current.version||0;next.pending=true;next.writeId=crypto.randomUUID();delete next.syncError;ledger.episodes[number]=next;
   await persist();if(sync)await syncOne(number);return ledger.episodes[number];
  });},
  sync(){return enqueue(async()=>{for(const n of Object.keys(ledger.episodes).sort((a,b)=>Number(a)-Number(b)))await syncOne(n);return ledger;});},
  publish(number,sceneIds){return enqueue(async()=>{
   await syncOne(number);const r=ledger.episodes[number];if(r.pending)throw Error(r.syncError||'核实修改尚未同步，请重连后发布');
   const saved=await api.collabArtReviewPublish({projectId,episodeNumber:Number(number),baseVersion:r.version,sceneIds,writeId:crypto.randomUUID()});
   ledger.episodes[number]={...saved,pending:false};await persist();return saved;
  });},
  useCloud(number,project){return enqueue(async()=>{const remote=project.analysis_progress?.[number]?.review;if(!remote)throw Error('云端尚无本集核实清单');const old=ledger.episodes[number];ledger.episodes[number]={...structuredClone(remote),history:[...(remote.history||[]),{reason:'保留同步冲突本地版本',at:Date.now(),previous:old}]};await persist();return ledger;});},
 };
 stores.set(key,store);return store;
}
export function summarizeArtReview(ledger,project){
 const records=Object.entries(ledger.episodes||{}).filter(([,r])=>r.status!=='empty');
 return {completed:records.length,published:records.filter(([,r])=>!r.pending).length,pending:records.filter(([,r])=>r.pending).length,pendingEpisodes:records.filter(([,r])=>r.pending).map(([n])=>Number(n)),warnings:records.flatMap(([,r])=>r.warnings||[]),syncErrors:records.filter(([,r])=>r.syncError).map(([n,r])=>({episode:Number(n),error:r.syncError})),stale:project?listCollabEpisodes(project.episodes).filter(e=>!isReviewCurrent(ledger.episodes[e.episodeNumber],e)).length:0};
}
