import {isReviewCurrent,isSceneVerified,needsArtReviewDetails,reviewRoster,reviewUnassignedSignature,isArtEpisodeFullyPublished} from './artReview.js';
import {inspectCollabEpisodes} from './collabEpisodes.js';

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
 const mode=artWorkflowMode(ledger),inspection=inspectCollabEpisodes(project.episodes),episodes=inspection.episodes.sort((a,b)=>a.episodeNumber-b.episodeNumber);
 if(inspection.error)return {mode,phase:'identity-conflict',episodeNumber:null,message:`分集编号待核对：${inspection.error}。可在项目内修改或选择主稿，已有美术资产仍可使用。`};
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
