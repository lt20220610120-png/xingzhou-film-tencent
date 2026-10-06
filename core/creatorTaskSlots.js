// Rewrite tasks own their result destination; other workspaces retain one project job.
const analysisKeys = target => target.analysisStage ? [target.analysisStage] : ['settings', 'outline', 'characters'];
export const creatorTaskSlot = (kind, projectId, target, rewrite = false) => {
  const base = `${kind}:${projectId}`;
  if (!rewrite) return base;
  return `${base}:${JSON.stringify(target.task === 'rewriteAnalyze'
    ? ['analysis', target.sourceId, target.analysisStage || 'all']
    : ['draft', target.section || 'episode'])}`;
};
export function creatorTasksConflict(a, b) {
  const aa = a.task === 'rewriteAnalyze', ba = b.task === 'rewriteAnalyze';
  if (aa || ba) return aa && ba && a.sourceId === b.sourceId && analysisKeys(a).some(key => analysisKeys(b).includes(key));
  const ak = a.section || 'episode', bk = b.section || 'episode';
  return ak === bk || ['detail', 'episode'].includes(ak) && ['detail', 'episode'].includes(bk);
}
export function creatorTaskActivity(activity, kind, projectId, target) {
  const base = `${kind}:${projectId}`;
  if (activity[base]) return activity[base];
  const running = Object.entries(activity).filter(([slot, value]) => slot.startsWith(`${base}:`) && value.running && (!target || (
    value.target?.task === 'rewriteAnalyze'
      ? target.section === 'source' || target.section === 'rewriteAnalysis' || analysisKeys(value.target).includes(target.section)
      : (target.section || 'episode') === (value.target?.section || 'episode')
  ))).map(([, value]) => value);
  return running.length ? {...running[0], count: running.length} : {running: false};
}
