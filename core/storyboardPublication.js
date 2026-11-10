import {compileEntryBinding} from './promptArtBinding.js';
import {promptTimingMetadata} from './promptDisplay.js';

export const storyboardShots=episode=>episode.storyboardPrompts||episode.prompts||[];
export function storyboardPublicationPayload(snapshot,decisions,entries){
 return {operation:'publish',episodeNumber:entries[0].episode,sceneIds:[...new Set(entries.map(e=>e.sceneId))],publicationId:crypto.randomUUID(),versionId:snapshot.versionId,
  prompts:entries.map(entry=>{const compiled=compileEntryBinding(snapshot,entry,decisions[entry.id],{preview:true});return {id:entry.id,label:entry.label,content:entry.prompt,...promptTimingMetadata(entry),generationConfig:{...compiled,prompt:undefined,referenceBindingMode:'storyboard',bindingIssue:'',bindingSourcePrompt:entry.prompt,bindingCompiledPrompt:compiled.prompt,bindingExpectedReferences:compiled.references.map(r=>r.id),bindingAssetIds:[...new Set((decisions[entry.id]?.needs||[]).filter(n=>n.visibility==='visible').map(n=>snapshot.cards.find(c=>c.uid===n.cardUid)?.assetId).filter(Boolean))],bindingAssets:snapshot.cards.filter(c=>(decisions[entry.id]?.needs||[]).some(n=>n.visibility==='visible'&&n.cardUid===c.uid)).map(c=>({assetId:c.assetId||null,name:c.name,category:c.category})),bindingSourcePromptId:entry.id,bindingVersionId:snapshot.versionId}};})};
}
// This route authorizes the saved storyboard, never the changing director draft.
// Cloud membership/lock checks and the normal generation license still apply.
export async function validateStoryboardSubmission({getProject,value,accountId}){
 if(!accountId)throw Error('请先登录');
 const project=await getProject({projectId:value.projectId});
 if(!['producer','collaborator','artist_collaborator'].includes(project?.myRole)||project.locked||project.is_locked||String(project.genre||'').includes('[PROJECT_LOCKED]'))throw Error('项目已锁定或没有编辑权限');
 const episode=(project.episodes||[]).find(ep=>storyboardShots(ep).some(s=>s.id===value.shotId));
 const shot=episode&&storyboardShots(episode).find(s=>s.id===value.shotId);
 if(!shot)throw Error('分镜不存在，请刷新项目');
 if((shot.storyboardPublicationId||'')!==(value.storyboardPublicationId||''))throw Error('清单已发布新版本，请刷新项目');
 return {references:value.references||[]};
}
