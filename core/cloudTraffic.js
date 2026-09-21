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
    const key=`${project.id}:${source.id}`;
    const updates={script:source.masterScript||'',episodes:source.episodes||[]};
    const snapshot=JSON.stringify(updates);
    if(key===lastKey && snapshot===lastSnapshot) return project;
    const saved=await update({projectId:project.id,scope:'director-sync',updates});
    lastKey=key;lastSnapshot=snapshot;
    return saved;
  };
}
