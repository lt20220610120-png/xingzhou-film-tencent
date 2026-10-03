/** Quality findings annotate generated work; identity/source/write conflicts
 * are enforced separately by the store and never become advisory warnings. */
export function quickReviewWarnings(run, segmentIndex) {
  const entries=[...(run.auditWarnings||[]),...(run.wholeSceneIssues||[]),
    ...(run.plan?.segments||[]).flatMap(segment=>(run.segmentDrafts?.[segment.id]?.issues||[]).map(item=>({...item,segmentIndex:segment.index})))];
  const seen=new Set();
  return entries.filter(item=>{
    if(segmentIndex&&item.segmentIndex&&item.segmentIndex!==segmentIndex)return false;
    const key=JSON.stringify([item.code,item.message,item.segmentIndex,item.evidence]);
    if(seen.has(key))return false;seen.add(key);return true;
  });
}
