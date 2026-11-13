import {collectDirectorPromptHistory} from './projectStore.js';
import {directorPromptMode} from './directorCreative.js';
import {snapshotMatchesContext,directorSceneInput} from './directorQuickStore.js';
import {sameDirectorEdition} from './directorPromptEditions.js';

// New generation and paid continuation have different ownership. Archive the
// previous view atomically; never delete it or seed a new request with its text.
export function beginDirectorSceneGeneration(state,run){
 const s=run.snapshot,project=state.directorProjects?.find(p=>p.id===s.projectId),episode=project?.episodes?.find(e=>e.id===s.episodeId);
 const fail=conflict=>({state,applied:false,conflict});
 if(state.accountId!==s.accountId||!project||!episode||!sameDirectorEdition(project,s))return fail('账号或提示词版本已变化，未清理旧结果');
 if(project.cloudLocked||project.cloudConflict||project.canWrite===false||project.permissions?.canWrite===false||project.permissions?.canGenerate===false||episode.canWrite===false)return fail('项目锁定或权限已变化，未清理旧结果');
 if(!snapshotMatchesContext(s,{accountId:state.accountId,project,episode,sceneLabel:s.sceneLabel,inputText:directorSceneInput(project,episode,s.sceneLabel),skill:state.skills?.find(x=>x.id===s.skillId),profile:state.apiProfiles?.find(x=>x.id===s.profileId)}))return fail('原文或配置已变化，未清理旧结果');
 if(episode.activeSceneGenerationRuns?.[s.sceneLabel]?.runId===run.id)return{state,applied:true};
 const prompts=(episode.prompts||[]).filter(p=>directorPromptMode(p)==='creative'||!(p.sceneLabel===s.sceneLabel||String(p.label||'').startsWith(s.sceneLabel+'-')));
 const activeQuickScenePlanIds={...episode.activeQuickScenePlanIds};delete activeQuickScenePlanIds[s.sceneLabel];
 const next={...episode,prompts,activeQuickScenePlanIds,activeSceneGenerationRuns:{...episode.activeSceneGenerationRuns,[s.sceneLabel]:{runId:run.id,kind:run.kind,createdAt:run.createdAt}}};
 return{applied:true,state:{...state,directorProjects:state.directorProjects.map(p=>p.id===project.id?{...p,promptHistory:collectDirectorPromptHistory(p),episodes:p.episodes.map(e=>e.id===episode.id?next:e)}:p)}};
}

export function currentManualSceneReplies(episode,sceneLabel){
 const current=episode.activeSceneGenerationRuns?.[sceneLabel]?.runId;
 return (episode.manualSceneReplies||[]).filter(r=>r.sceneLabel===sceneLabel&&(!current||r.id===current||r.id?.startsWith(current+':')));
}
