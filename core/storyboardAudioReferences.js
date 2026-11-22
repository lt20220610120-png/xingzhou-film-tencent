export const storyboardAudioNote = ref => typeof ref.id === 'string' && ref.id && ref.id.length <= 180
  ? `分镜音频 [${ref.id}]` : '';

export function findStoryboardAudioMedia(ref, media, projectId) {
  if (ref.kind !== 'audio' || [ref.projectId, ref.project_id].some(id => id && id !== projectId)) return;
  const identity = storyboardAudioNote(ref);
  const inProject = row => row.id && row.kind === 'audio' && (row.projectId || row.project_id) === projectId;
  return media.find(row => inProject(row)
    && (row.id === ref.mediaId || row.id === ref.id || (ref.objectKey && row.objectKey === ref.objectKey)))
    || (identity ? media.find(row => inProject(row) && row.note === identity) : undefined);
}
