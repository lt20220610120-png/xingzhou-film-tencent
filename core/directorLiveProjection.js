/** Current scene prompts replace stale local copies; archived paid prompts stay
 * in local history during ordinary live updates. A confirmed restore is exact. */
export function directorLiveWork(project,episodes=[],restore=false){
 const deletedPromptIds=[...new Set(episodes.flatMap(e=>e.deletedPromptIds||[]))];
 const deleted=new Set(deletedPromptIds),history=new Map();
 if(!restore)for(const prompt of project.promptHistory||[])if(prompt?.id&&!deleted.has(prompt.id))history.set(prompt.id,prompt);
 for(const ep of episodes)for(const prompt of ep.prompts||[])if(prompt?.id&&!deleted.has(prompt.id))history.set(prompt.id,prompt);
 return {episodes,deletedPromptIds,promptHistory:[...history.values()]};
}
