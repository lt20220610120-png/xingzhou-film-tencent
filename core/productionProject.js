export const activeProductionProject = p => Boolean(p?.id && !p.deleted_at && !p.purge_after && !String(p.genre||'').includes('[RECYCLE_UNTIL:'));
export function matchesProductionDirector(project, director) {
 const source=typeof director==='string'?{id:director}:director;
 const cloud=source?.cloudProjectId;
 const aliases=[source?.id,cloud,cloud&&'cloud-'+cloud,cloud&&source.sourceId].filter(Boolean);
 return activeProductionProject(project)&&aliases.includes(project.director_project_id);
}
export function productionProjectCandidates(rows, director) {
 return rows.filter(p=>matchesProductionDirector(p,director))
  .sort((a,b)=>(Date.parse(b.updated_at||b.updatedAt)||0)-(Date.parse(a.updated_at||a.updatedAt)||0)||String(a.id).localeCompare(String(b.id)));
}
export async function resolveProductionProject({api,source,preferredId,hasVideoJobs=false,checkpoint=async()=>{},guard=()=>{},log=async()=>{}}) {
 let selected;
 if(preferredId){
  try{selected=await api.collabGetProject({projectId:preferredId});}catch(e){if(!/已删除|不存在|无权|410|404/.test(e.message))throw e;}
  guard();if(!matchesProductionDirector(selected,source))selected=null;
 }
 if(!selected&&hasVideoJobs)throw Error('原协作项目不可用且已有视频任务，保留提交记录，请先恢复原项目');
 if(!selected){
  const rows=await api.collabListProjects();guard();const candidates=productionProjectCandidates(rows,source);
  if(candidates.length){selected=await api.collabGetProject({projectId:candidates[0].id});guard();await log(`找到 ${candidates.length} 个正常协作项目，复用：${selected.name}（${selected.id}）；回收站项目已排除。`);}
  else {await log('未找到正常协作项目，自动开启项目协作。');selected=await api.collabCreateProject({name:source.name,directorProjectId:source.id,script:source.masterScript||'',episodes:source.episodes.map(e=>({...e,prompts:e.prompts||[]}))});guard();await checkpoint(selected.id);selected=await api.collabGetProject({projectId:selected.id});}
 }
 guard();if(!matchesProductionDirector(selected,source))throw Error('协作项目来源已变化，请重新读取');
 await checkpoint(selected.id);return selected;
}
