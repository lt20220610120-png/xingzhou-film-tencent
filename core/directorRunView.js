// UI lists carry identities/status only. Full paid replies are loaded for the
// selected scene, rather than cloned for every historical run on every render.
export function directorRunEntries(records,{summary=false,projectId,episodeId,sceneLabel,accountId}={}){
 return [...records].filter(run=>(!projectId||run.snapshot.projectId===projectId)&&(!episodeId||run.snapshot.episodeId===episodeId)&&(!sceneLabel||run.snapshot.sceneLabel===sceneLabel)&&(!accountId||run.snapshot.accountId===accountId)).map(run=>structuredClone(summary?{
  id:run.id,kind:run.kind,phase:run.phase,createdAt:run.createdAt,updatedAt:run.updatedAt,revision:run.revision,
  snapshot:{accountId:run.snapshot.accountId,projectId:run.snapshot.projectId,episodeId:run.snapshot.episodeId,sceneLabel:run.snapshot.sceneLabel,promptEditionId:run.snapshot.promptEditionId},
 }:run));
}
// Share one paged read across auto/manual/batch restore, but never cache an old
// account/directory list beyond that restore or retain a settled giant reply.
export function createDirectorCheckpointReader({readPage,getScope,onIssues=()=>{}}){
 let pending=null,pendingScope;
 return ()=>{const scope=getScope();if(pending&&pendingScope===scope)return pending;pendingScope=scope;
  const task=(async()=>{const rows=[],issues=[];let after='',seen=new Set();do{
   const page=await readPage({recoverable:true,limit:64,after});if(getScope()!==scope)throw Error('账号或资料位置已变化，旧任务列表未应用');
   if(Array.isArray(page)){rows.push(...page);break;}
   rows.push(...page.runs);issues.push(...(page.issues||[]));after=page.nextCursor;
   if(after&&seen.has(after))throw Error('任务进度分页未能前进');if(after)seen.add(after);
  }while(after);if(issues.length)onIssues(issues);return rows;})();
  pending=task;task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;
 };
}
