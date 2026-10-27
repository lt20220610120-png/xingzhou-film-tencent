// Lightweight asset refresh uses the cloud receipts we already received, not a
// second download of every episode's full analysis history. Never expose drafts.
export function publishedReviewProject(project,ledger){
 const progress={...project.analysis_progress};
 for(const [number,record] of Object.entries(ledger.episodes||{})){
  const old=progress[number]?.review,published=Object.values(record.published||{});
  if(!published.length||!(record.version>0)||(old?.version||0)>record.version)continue;
  const ids=[...new Set([...(old?.scenes||[]).map(s=>s.id),...(record.scenes||[]).map(s=>s.id),...published.map(s=>s.id)])];
  const scenes=ids.map(id=>record.published[id]||old?.scenes?.find(s=>s.id===id)||{id,items:[]});
  const roster=[...new Map(published.flatMap(scene=>scene.items||[]).map(item=>[item.category+':'+item.name,item])).values()];
  progress[number]={...progress[number],review:{...old,version:record.version,published:record.published,managedAssetNames:record.managedAssetNames||[],scenes,roster,unassigned:[]}};
 }
 return {...project,analysis_progress:progress};
}
