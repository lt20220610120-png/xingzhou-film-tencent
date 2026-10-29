import {inspectCollabEpisodes} from './collabEpisodes.js';
export function imagePreviewIdentity(image) {
  try {
    const url=new URL(image.url);
    if(url.hostname==='xingzhou-media-test-1469762028.cos.ap-guangzhou.myqcloud.com'
      && /^\/projects\/[\w-]+\/image\/[\w.-]+$/.test(url.pathname)) return url.origin+url.pathname;
  } catch { /* Local and external images retain their complete identities. */ }
  return image.url || '';
}

// Remember the last successfully submitted local snapshot, not the merged cloud
// result: cloud-only episodes and collaborators' edits must not trigger a rewrite.
export function createDirectorSync() {
  let lastKey='',lastSnapshot='';
  return async (project,source,update) => {
    if(!source || project.myRole!=='producer' || project.locked) return project;
    const inspection=inspectCollabEpisodes(source.episodes);
    if(inspection.error)return {...project,director_sync_warning:`导演源分集编号待核对，本次未同步：${inspection.error}`};
    const key=`${project.id}:${source.id}`;
    const episodeIds=new Map(inspectCollabEpisodes(project.episodes||[]).episodes.map(e=>[e.episodeNumber,e.id]));
    const sourceNumbers=new Map(inspection.episodes.map(e=>[e.id,e.episodeNumber]));
    const updates={script:source.masterScript||'',episodes:(source.episodes||[]).map(e=>({...e,id:episodeIds.get(sourceNumbers.get(e.id))||e.id}))};
    const snapshot=JSON.stringify(updates);
    if(key===lastKey && snapshot===lastSnapshot) return project;
    const saved=await update({projectId:project.id,scope:'director-sync',updates});
    lastKey=key;lastSnapshot=snapshot;
    return saved;
  };
}
