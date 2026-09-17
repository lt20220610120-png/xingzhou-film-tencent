import {analysisFingerprint,legacyAnalysisFingerprint} from './artAnalysisRunner.js';
import {listCollabEpisodes} from './collabEpisodes.js';
import {buildSavedArtPublication} from './artPublicationRecovery.js';

export function summarizeArtSync(ledger={}) {
 const records=Object.entries(ledger.episodes||{}).filter(([,r])=>r.outputs?.length&&r.outputs.length===r.chunks?.length&&r.outputs.every(Boolean));
 const pendingEpisodes=records.filter(([,r])=>!r.published).map(([n])=>Number(n)).sort((a,b)=>a-b);
 const syncErrors=records.filter(([,r])=>!r.published&&r.syncError).map(([n,r])=>({episode:Number(n),error:r.syncError}));
 const warnings=[...new Set(records.flatMap(([,r])=>r.publicationWarnings||r.validationWarnings||[]))];
 return {completed:records.length,published:records.length-pendingEpisodes.length,pending:pendingEpisodes.length,pendingEpisodes,syncErrors,warnings};
}
const writers=new Map();
const cleanError=error=>String(error?.message||error).replace(/^Error invoking remote method '[^']+': Error: /,'');
export function syncSavedArtAnalysis(args){
 const key=String(args.accountId||'')+':'+args.project.id;
 if(writers.has(key))return writers.get(key);
 const work=performSync(args).finally(()=>writers.delete(key));writers.set(key,work);return work;
}
async function performSync({project,genre=project.genre||'',api,job={},load,save,existingAssets=[],onProgress,ledger:currentLedger,accountId}){
 job.syncing=true;
 const ledger=currentLedger||await load()||{episodes:{}};
 try{
  if(api.collabGetProject)project=await api.collabGetProject({projectId:project.id});
  let available=api.collabListAssets?await api.collabListAssets({projectId:project.id}):[...existingAssets,...(job.syncedAssets||[])];
  const episodes=new Map(listCollabEpisodes(project.episodes).map(e=>[e.episodeNumber,e]));
  for(const [key,record]of Object.entries(ledger.episodes||{}).sort(([a],[b])=>Number(a)-Number(b))){
   if(record.published||!record.outputs?.length||record.outputs.length!==record.chunks?.length||record.outputs.some(x=>!x))continue;
   const number=Number(key),episode=episodes.get(number);
   try{
    if(!episode)throw Error('原分集已不存在，已保存结果保留待核对');
    const fingerprints=[await analysisFingerprint(genre,episode),await legacyAnalysisFingerprint(genre,episode)];
    if(!fingerprints.includes(record.fingerprint)||record.chunks.join('')!==String(episode.content||''))throw Error('本集原文或题材已变更，已保存结果保留待核对；不会重新调用模型');
    job.notice=`正在同步第 ${number} 集已保存结果（不调用模型）`;onProgress?.();
    const publication=buildSavedArtPublication({ledger,episode,genre,existingAssets:available,project});
    record.publicationOutput=publication.output;record.publicationWarnings=publication.warnings;
    const remote=project.analysis_progress?.[key];
    const acknowledged=remote?.fingerprint===record.fingerprint&&remote.output===publication.output;
    if(!acknowledged)await api.collabPublishAnalysis({projectId:project.id,episodeNumber:number,sourceContent:episode.content||'',fingerprint:record.fingerprint,output:publication.output,assets:publication.assets,baseOutput:record.baseOutput??remote?.output??''});
    record.published=true;delete record.syncError;
    for(const row of publication.assets){const old=available.find(a=>a.name===row.name);if(old){old.episodes=[...new Set([...(old.episodes||[]),number])];old.first_episode=Math.min(old.first_episode||number,row.first_episode);}else available.push({...row});}
    job.syncedAssets=available;await save(ledger);
   }catch(error){record.syncError=cleanError(error);await save(ledger);}
  }
  const summary=summarizeArtSync(ledger);Object.assign(job,summary);
  job.error=summary.syncErrors.map(item=>`第 ${item.episode} 集：${item.error}`).join('\n');
  return summary;
 }finally{job.syncing=false;onProgress?.();}
}
