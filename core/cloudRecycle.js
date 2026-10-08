export const canManageCloudProject=(project,account)=>Boolean(account?.id&&project?.owner_id===account.id);

// A successful empty list alone cannot distinguish revocation from deletion.
// Only a matching explicit server decision can release a legacy local binding.
export function reconcileDirectorAssociations(projects,decisions=[]) {
 return projects.map(project=>{
  if(project.cloudProjectId||project.sourceType==='cloud'||!project.collaborationProjectId)return project;
  const released=decisions.some(d=>d.projectId===project.id&&d.collaborationProjectId===project.collaborationProjectId&&d.status==='released');
  if(!released)return project;
  const {collaborationProjectId,...local}=project;
  return {...local,groupId:local.groupId==='director-cloud'?'director-workbench':local.groupId};
 });
}

export function reconcileDirectorLinks(projects,collaborations,decisions=[]) {
 const protectedIds=new Set();
 const next=projects.map(project=>{
  const aliases=new Set([project.id,project.cloudProjectId,project.cloudProjectId&&`cloud-${project.cloudProjectId}`,project.sourceId].filter(Boolean));
  const link=collaborations.find(row=>aliases.has(row.director_project_id)&&(!row.deleted_at||!Number.isFinite(Date.parse(row.purge_after))||Date.parse(row.purge_after)>Date.now()));
  if(link)protectedIds.add(project.id);
  return link?{...project,collaborationProjectId:link.id,groupId:'director-cloud'}:project;
 });
 // These two reads may straddle a restore. Positive live evidence wins over an
 // earlier release decision; a later consistent response can detach the link.
 return reconcileDirectorAssociations(next,decisions.filter(d=>!protectedIds.has(d.projectId)));
}
