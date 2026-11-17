import {promptReviewState,promptHumanReviewSignature,resolvePromptMissingReferences} from './promptReviewBatch.js';
import {getPromptPublicationJob} from './promptPublicationJob.js';

// Called only after an explicit whole-project analysis in auto-publish mode.
// Persist the same reversible exclusions and review receipts as manual actions.
export async function automaticallyPublishPrompts({api,projectId,accountId,service,store,guard=()=>{}}){
 guard();const state=await service.read(),versionId=state.snapshot.versionId;
 const targets=promptReviewState(state).pendingMissing.map(({entry,need})=>({entryId:entry.id,needId:need.id,signature:promptHumanReviewSignature(state.snapshot,entry,state.decisions[entry.id])}));
 if(targets.length)await resolvePromptMissingReferences({service,targets,versionId,guard,reason:'无需核实发布：自动确认无需补充，可恢复待补充'});
 guard();const result=await getPromptPublicationJob(api,accountId,projectId).start({service,store,actor:accountId,action:'approve-publish',versionId,guard});
 const remaining=promptReviewState(await service.read(versionId));
 return {...result,autoSkipped:targets.length,remaining:remaining.entries.length-remaining.published,problems:remaining.problems};
}
