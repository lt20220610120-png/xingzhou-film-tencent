// Lightweight asset refresh uses the cloud receipts we already received, not a
// second download of every episode's full analysis history. Never expose drafts.
export function publishedReviewProject(project,ledger){
 const progress={...project.analysis_progress};
 const episodes=inspectCollabEpisodes(project.episodes||[]).episodes;
 for(const [number,record] of Object.entries(ledger.episodes||{})){
  const old=progress[number]?.review,published=Object.values(record.published||{});
  if(!published.length||!(record.version>0)||(old?.version||0)>record.version)continue;
  const episode=episodes.find(e=>e.episodeNumber===Number(number));
  if(episode&&record.sourceContent!==undefined&&record.sourceContent!==String(episode.content||''))continue;
  const accepted=Object.fromEntries(Object.entries(record.published||{}).filter(([id,scene])=>record.sourceContent===undefined||typeof scene.source==='string'&&scene.source===parseDirectorScenesReadonly(episode?.content||record.sourceContent,Number(number)).find(s=>s.label===id)?.content));
  const ids=[...new Set([...(old?.scenes||[]).map(s=>s.id),...(record.scenes||[]).map(s=>s.id),...published.map(s=>s.id)])];
  const scenes=ids.map(id=>accepted[id]||(record.sourceContent===undefined?old?.scenes?.find(s=>s.id===id):null)||{id,items:[]});
  const roster=[...new Map(Object.values(accepted).flatMap(scene=>scene.items||[]).map(item=>[item.category+':'+item.name,item])).values()];
  progress[number]={...progress[number],review:{...old,...(record.sourceContent!==undefined?{sourceContent:record.sourceContent}:{}),...(record.voiceAnalysis?{voiceAnalysis:record.voiceAnalysis}:{}),version:record.version,published:accepted,managedAssetNames:record.managedAssetNames||[],scenes,roster,unassigned:[]}};
 }
 return {...project,analysis_progress:progress};
}
import {inspectCollabEpisodes} from './collabEpisodes.js';

import {parseDirectorScenesReadonly} from './scriptImport.js';
