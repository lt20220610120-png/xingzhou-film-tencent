import {isReviewCurrent,needsArtReviewDetails,reviewRoster} from './artReview.js';
import {parseAssetName} from './collabStore.js';

export const ART_DETAIL_ATTEMPTS=3;
export function artTextFingerprint(value){
 const text=String(value||'');let a=216776261,b=5381;
 for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
 return `${text.length}:${a>>>0}:${b>>>0}`;
}
function explicitVoiceReference(record,item){
 if(item.category!=='character')return false;
 const base=parseAssetName(item.name).base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return !!base&&new RegExp(`${base}\\s*(?:V\\.?O\\.?|O\\.?S\\.?|画外音|[（(][^）)\\n]*(?:电话|画外|声音))`,'i').test(record.sourceContent||'');
}
export function hasCurrentVisualEvidence(record,item,evidence){
 if(item.manual&&item.manualSceneIds?.length)return true;
 const base=parseAssetName(item.name).base;
 return Array.isArray(evidence)&&evidence.some(e=>typeof e.quote==='string'&&record.sourceContent.includes(e.quote)&&e.quote.includes(base)
  &&!/(?:\bV\.?O\.?\b|\bO\.?S\.?\b|画外音|电话(?:里|中|另一端)|听筒|声音)/i.test(e.quote)
  &&/(?:站|走|坐|穿|推门|开门|进门|出现|脸|头发|身高|体型|stands?|walks?|sits?|wears?|enters?|appears?)/i.test(e.quote));
}
export const artDetailFingerprint=item=>JSON.stringify([item.id,item.category,item.name,item.note||'',item.description||'',!!item.manual,item.manualSceneIds||null,item.ready,item.detailStatus||'']);
export function artDetailMarker(record,item){
 const marker=record?.detailDeferrals?.[item.id];
 return marker?.sourceSignature===artTextFingerprint(record.sourceContent)&&marker?.fingerprint===artDetailFingerprint(item)?marker:null;
}
export const isArtDetailDeferred=(record,item)=>Boolean(needsArtReviewDetails(item)&&artDetailMarker(record,item)?.attempts>=ART_DETAIL_ATTEMPTS);
export function deferredArtDetails(ledger,episodes,{includeResolved=false}={}){
 return episodes.flatMap(episode=>{
  const record=ledger.episodes?.[episode.episodeNumber];if(!isReviewCurrent(record,episode))return [];
  return reviewRoster(record).flatMap(item=>{
   const marker=artDetailMarker(record,item);
   return marker&&(isArtDetailDeferred(record,item)||includeResolved&&marker.status==='resolved'&&marker.evidence?.length)?[{episodeNumber:episode.episodeNumber,item,marker}]:[];
  });
 });
}
// Only automatic traversal can step past these entries. Detail completeness and
// human confirmation keep using their existing, stricter predicates.
export function beginArtDetailAttempt(record,requested){
 record.detailDeferrals||={};
 for(const item of requested){
  const latest=reviewRoster(record).find(i=>i.id===item.id);
  if(!latest||artDetailFingerprint(latest)!==artDetailFingerprint(item))continue;
  const previous=artDetailMarker(record,item);
  record.detailDeferrals[item.id]={...previous,attempts:(previous?.attempts||0)+1,status:'retrying',sourceSignature:artTextFingerprint(record.sourceContent),fingerprint:artDetailFingerprint(latest),nonvisualCandidate:previous?.nonvisualCandidate||explicitVoiceReference(record,item),reason:previous?.reason||'',updatedAt:Date.now()};
 }
 return record;
}
export function finishArtDetailAttempt(record,requested,errors=[]){
 for(const item of requested){
  const latest=reviewRoster(record).find(i=>i.id===item.id),marker=record.detailDeferrals?.[item.id];
  if(!latest||!marker||marker.sourceSignature!==artTextFingerprint(record.sourceContent)||latest.name!==item.name||latest.category!==item.category||latest.note!==item.note||latest.manual!==item.manual||JSON.stringify(latest.manualSceneIds)!==JSON.stringify(item.manualSceneIds))continue;
  const pending=needsArtReviewDetails(latest);
  if(pending&&marker.attempts===ART_DETAIL_ATTEMPTS&&marker.status==='retrying')record.history.push({at:Date.now(),reason:'信息卡三次未补齐，标记等待后文',itemId:item.id});
  record.detailDeferrals[item.id]={...marker,fingerprint:artDetailFingerprint(latest),status:pending?(marker.attempts>=ART_DETAIL_ATTEMPTS?'waiting':'retrying'):'resolved',reason:pending?(errors.find(e=>e.includes(item.name))||errors[0]||'本集信息不足，等待后文依据'):'信息已补齐',updatedAt:Date.now()};
 }
 return record;
}
