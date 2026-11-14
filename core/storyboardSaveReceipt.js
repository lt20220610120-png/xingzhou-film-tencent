export function mergeStoryboardSaveReceipt(project,saved) {
  if(!saved?.storyboardReceipt)return saved;
  if(project?.id!==saved.id)return project;
  const receipt=saved.storyboardReceipt;
  return {...project,episodes:(project.episodes||[]).map(episode=>{
    if(episode.id!==receipt.episodeId)return episode;
    if(receipt.separate){
      const existing=episode.storyboardPrompts;
      if(existing){
        if(!existing.some(shot=>shot.id===receipt.shot.id&&(shot.storyboardPublicationId||'')===receipt.publicationId))return episode;
        return {...episode,storyboardPrompts:existing.map(shot=>shot.id===receipt.shot.id?receipt.shot:shot)};
      }
      // The first direct save creates the published working copy on the
      // server. The compact receipt is enough to materialize that copy
      // locally; never overwrite the source prompt array.
      const source=episode.prompts||[];
      if(!source.some(shot=>shot.id===receipt.shot.id))return episode;
      return {...episode,storyboardPrompts:source.map(shot=>shot.id===receipt.shot.id?receipt.shot:shot),storyboardWorkspacePolicy:'published'};
    }
    const shots=episode.prompts||[];
    if(!shots.some(shot=>shot.id===receipt.shot.id&&(shot.storyboardPublicationId||'')===receipt.publicationId))return episode;
    return {...episode,prompts:shots.map(shot=>shot.id===receipt.shot.id?receipt.shot:shot)};
  })};
}
