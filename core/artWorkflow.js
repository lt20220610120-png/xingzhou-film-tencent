import {isReviewCurrent,isSceneVerified,needsArtReviewDetails,reviewRoster,reviewUnassignedSignature,isArtEpisodeFullyPublished} from './artReview.js';
import {listCollabEpisodes} from './collabEpisodes.js';

export const artWorkflowMode=ledger=>ledger?.workflow==='guided'?'guided':'automatic';
export function artEpisodeReady(record,episode){
 return Boolean(isReviewCurrent(record,episode)&&record.scenes?.length
  &&(record.status==='generated'||record.scenes.every(isSceneVerified))
  &&record.scenes.every(s=>s.mappingReady||isSceneVerified(s))
  &&reviewRoster(record).every(i=>!needsArtReviewDetails(i)));
}
export function artEpisodeConfirmed(record,episode){
 return artEpisodeReady(record,episode)&&record.scenes.every(isSceneVerified)
  &&(!unresolvedArtAssignments(record).length||record.unassignedApproval?.signature===reviewUnassignedSignature(record)
   ||!record.unassignedApproval&&isArtEpisodeFullyPublished(record));
}
export const unresolvedArtAssignments=record=>(record?.unassigned||[]).filter(i=>i.detailStatus!=='nonvisual'&&!Array.isArray(i.manualSceneIds));
export function artWorkflowState(ledger,project){
 const mode=artWorkflowMode(ledger),episodes=listCollabEpisodes(project.episodes).sort((a,b)=>a.episodeNumber-b.episodeNumber);
 for(const episode of episodes){
  const n=episode.episodeNumber,record=ledger.episodes?.[n];
  if(!artEpisodeReady(record,episode))return {mode,phase:'generate',episodeNumber:n,message:`下一步：完成第 ${n} 集清单、场景关联和详细描述。`};
  if(mode==='guided'&&!artEpisodeConfirmed(record,episode)){
   const allVerified=record.scenes.every(isSceneVerified),unassigned=unresolvedArtAssignments(record);
   return {mode,phase:'review',episodeNumber:n,message:allVerified&&unassigned.length
    ?`第 ${n} 集全部场景已核实，仍有 ${unassigned.length} 条未关联候选：${unassigned.slice(0,4).map(i=>i.name).join('、')}。请关联/移除，或点击“核实整集”确认本集场景清单；候选卡继续保留。`
    :`第 ${n} 集已生成，请核实整集、补齐细节并确认场景关联，再继续下一集。`};
  }
 }
 return {mode,phase:'complete',episodeNumber:null,message:mode==='guided'?'全剧已逐集生成并核实。':'全剧美术清单已生成，可继续人工核实。'};
}
