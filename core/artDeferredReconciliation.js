import {parseAssetName} from './collabStore.js';
import {listCollabEpisodes} from './collabEpisodes.js';
import {reviewRoster,isReviewCurrent,isSceneVerified,reviewSceneSignature} from './artReview.js';
import {artEpisodeTraversable} from './artWorkflow.js';
import {artDetailFingerprint,artDetailMarker,deferredArtDetails,artTextFingerprint} from './artDeferredDetails.js';
import {fillArtReviewDetails} from './artReviewRunner.js';

const identity=item=>item.category==='character'?parseAssetName(item.name).base:item.name;
function evidenceFor(ledger,episodes,entry){
 const name=identity(entry.item);
 if(!name)return [];
 return episodes.filter(e=>e.episodeNumber>entry.episodeNumber&&isReviewCurrent(ledger.episodes[e.episodeNumber],e)&&artEpisodeTraversable(ledger.episodes[e.episodeNumber],e)).flatMap(e=>{
  const items=reviewRoster(ledger.episodes[e.episodeNumber]).filter(i=>i.category===entry.item.category&&identity(i)===name);
  const mention=e.content.indexOf(entry.item.category==='character'?name:String(name).replace(/^【|】$/g,''));
  if(mention<0)return [];
  // The excerpt is source text, not an AI-written appearance used as evidence.
  const content=e.content.length<=12000?e.content:e.content.slice(Math.max(0,mention-3000),mention+9000);
  return [{episodeNumber:e.episodeNumber,sourceSignature:artTextFingerprint(e.content),content,items:items.map(i=>({name:i.name,description:i.description,detailStatus:i.detailStatus}))}];
 }).slice(-6);
}
const evidenceFingerprint=rows=>{
 const text=JSON.stringify(rows);let a=2166136261,b=5381;
 for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
 return `${text.length}:${a>>>0}:${b>>>0}`;
};

export async function reconcileArtDeferredDetails({store,project,genre,profile,api,job={},onProgress,final=false}){
 const episodes=listCollabEpisodes(project.episodes).sort((a,b)=>a.episodeNumber-b.episodeNumber);
 // A sourced answer remains valid only for the exact text it was grounded in.
 // Never revert a card whose user-edited fingerprint no longer matches.
 const resolved=Object.entries(store.snapshot().episodes).flatMap(([n,record])=>reviewRoster(record).flatMap(item=>{
  const marker=record.detailDeferrals?.[item.id];
  return marker?.status==='resolved'&&marker.beforeBackfill&&marker.fingerprint===artDetailFingerprint(item)?[{episodeNumber:Number(n),item,marker}]:[];
 }));
 for(const entry of resolved){
  if(job.cancelled)break;
  const target=episodes.find(e=>e.episodeNumber===entry.episodeNumber);
  if(!target)continue;
  const targetChanged=entry.marker.sourceSignature!==artTextFingerprint(target.content);
  if(!targetChanged&&!entry.marker.evidenceSources?.some(source=>source.sourceSignature!==artTextFingerprint(episodes.find(e=>e.episodeNumber===source.episodeNumber)?.content)))continue;
  await store.update(entry.episodeNumber,r=>{
   const item=reviewRoster(r).find(i=>i.id===entry.item.id),marker=r.detailDeferrals?.[entry.item.id];if(!item||!marker||artDetailFingerprint(item)!==marker.fingerprint||marker.fingerprint!==entry.marker.fingerprint)return r;
   const restored=structuredClone(marker.beforeBackfill),replace=i=>i.id===item.id?structuredClone(restored):i;
   r.roster=r.roster.map(replace);r.unassigned=r.unassigned.map(replace);
   for(const scene of r.scenes){const approved=isSceneVerified(scene);scene.items=scene.items.map(replace);if(approved)scene.approval={...scene.approval,signature:reviewSceneSignature(scene)};}
   if(targetChanged)delete r.detailDeferrals[item.id];
   else r.detailDeferrals[item.id]={...marker,status:'waiting',fingerprint:artDetailFingerprint(restored),lastEvidenceKey:'',reason:'后文依据已变化，等待重新核对',evidence:[],updatedAt:Date.now()};
   r.history.push({at:Date.now(),reason:targetChanged?'本集正文已变化，重新核对回填信息':'后文依据已变化，重新核对回填信息',itemId:item.id});return r;
  });
 }
 for(const entry of deferredArtDetails(store.snapshot(),episodes)){
  if(job.cancelled)break;
  const episode=episodes.find(e=>e.episodeNumber===entry.episodeNumber),laterEvidence=evidenceFor(store.snapshot(),episodes,entry),key=evidenceFingerprint(laterEvidence);
  if(laterEvidence.length&&entry.marker.lastEvidenceKey!==key){
   job.notice=`第 ${entry.episodeNumber} 集 · 依据后文回填 ${entry.item.name}`;onProgress?.();
   const errors=await fillArtReviewDetails({store,project,episode,genre,profile,api,job,onProgress,eligible:[entry.item],batchSize:1,laterEvidence,evidenceKey:key,isEvidenceCurrent:()=>evidenceFingerprint(evidenceFor(store.snapshot(),episodes,entry))===key});
   if(job.cancelled)break;
   await store.update(entry.episodeNumber,r=>{
    if(!isReviewCurrent(r,episode))return r;
    const item=reviewRoster(r).find(i=>i.id===entry.item.id),marker=item&&artDetailMarker(r,item);
    if(!marker||marker.status==='resolved'||artDetailFingerprint(item)!==artDetailFingerprint(entry.item))return r;
    r.detailDeferrals[item.id]={...marker,lastEvidenceKey:key,checks:(marker.checks||0)+1,reason:errors.join('；')||'后文仍无充分依据',status:final?'unresolved':'waiting',updatedAt:Date.now()};return r;
   });
  }
 }
 if(final&&!job.cancelled){
  for(const entry of deferredArtDetails(store.snapshot(),episodes))await store.update(entry.episodeNumber,r=>{
   const item=reviewRoster(r).find(i=>i.id===entry.item.id),marker=item&&artDetailMarker(r,item);
   if(marker&&marker.status!=='resolved')r.detailDeferrals[item.id]={...marker,status:'unresolved',reason:'全文已检查，仍无足够依据；保留待确认',updatedAt:Date.now()};
   return r;
  });
 }
}
