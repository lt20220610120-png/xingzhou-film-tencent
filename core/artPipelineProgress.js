import {listCollabEpisodes} from './collabEpisodes.js';
import {isReviewCurrent} from './artReview.js';
import {bindingProblems} from './promptArtBinding.js';

// Count durable, current results. Queue activity and retries never add credit.
export function artPipelineProgress(project,ledger,snapshot,decisions){
 const episodes=listCollabEpisodes(project.episodes),records=episodes.map(e=>({episode:e,record:ledger.episodes?.[e.episodeNumber]}));
 const current=records.filter(({episode,record})=>isReviewCurrent(record,episode));
 const scenes=current.flatMap(({record})=>record.scenes||[]),entries=snapshot.entries||[];
 return {read:current.filter(({record})=>!['empty','inventory-pending'].includes(record.status)).length,episodes:episodes.length,
  mapped:scenes.filter(s=>s.mappingReady).length,scenes:records.reduce((n,{record})=>n+(record?.scenes?.length||0),0),
  linked:entries.filter(e=>decisions[e.id]?.confirmed&&bindingProblems(snapshot,e,decisions[e.id]).length===0).length,entries:entries.length};
}
