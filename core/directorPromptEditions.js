// Edition data travels inside episodes, through the existing director document
// and collaboration APIs. Script/episode identities are shared; paid work is not.
const workFields={prompts:[],quickScenePlans:[],activeQuickScenePlanIds:{},activeSceneGenerationRuns:{},quickSceneEdits:{},sceneVisions:{},manualSceneReplies:[],quickScenePlanConflicts:[],status:'待导演处理'};
const clone=value=>structuredClone(value);
export const activeDirectorEditionId=project=>(project?.episodes||[]).find(e=>e.promptEditionId)?.promptEditionId;
export const directorEditionKey=project=>activeDirectorEditionId(project)||'original:'+(project?.cloudProjectId||project?.id);
export const sameDirectorEdition=(project,snapshot)=>{
 const key=snapshot?.promptEditionId||'original:'+snapshot?.projectId,current=directorEditionKey(project);
 return current===key||current==='original:'+project?.cloudProjectId&&key==='original:'+project?.id&&snapshot?.projectId===project?.id;
};
export function inheritDirectorEdition(project,episode){
 const id=activeDirectorEditionId(project);return id?{...episode,promptEditionId:id,promptEditions:directorPromptEditions(project)}:episode;
}
export function directorPromptEditions(project){
 const rows=new Map();for(const ep of project?.episodes||[])for(const row of ep.promptEditions||[])if(!rows.has(row.id))rows.set(row.id,{id:row.id,name:row.name,createdAt:row.createdAt});
 return [...rows.values()];
}
function assertWritable(project){if(!project||project.cloudLocked||project.cloudConflict||project.canWrite===false||project.permissions?.canWrite===false)throw Error('项目已锁定或没有写入权限');}
const capture=(episode,project)=>({style:project.style||'',aspectRatio:project.aspectRatio||'',...Object.fromEntries(Object.keys(workFields).map(key=>[key,clone(episode[key]??workFields[key])]))});
function initialize(project){
 if(activeDirectorEditionId(project))return project;
 const id=directorEditionKey(project),createdAt=project.createdAt||new Date().toISOString();
 return {...project,episodes:(project.episodes||[]).map(ep=>({...ep,promptEditionId:id,promptEditions:[{id,name:'原始版本',createdAt}]})),promptHistory:(project.promptHistory||[]).map(p=>({...p,promptEditionId:id}))};
}
export function switchDirectorPromptEdition(project,id){
 assertWritable(project);project=initialize(project);const active=activeDirectorEditionId(project);if(active===id)return project;
 const option=directorPromptEditions(project).find(row=>row.id===id);if(!option)throw Error('提示词版本不存在');
 let settings;
 const episodes=project.episodes.map(ep=>{
  const rows=[...(ep.promptEditions||[])],target=rows.find(row=>row.id===id),work=target?.work;
  settings||=work;
  const nextRows=rows.map(row=>row.id===active?{...row,work:capture(ep,project)}:row.id===id?{...row,work:undefined}:row);
  if(!target)nextRows.push({...option});
  return {...ep,...clone(workFields),...(work?Object.fromEntries(Object.keys(workFields).map(key=>[key,clone(work[key]??workFields[key])])):{}),promptEditionId:id,promptEditions:nextRows};
 });
 return {...project,episodes,...(settings?{style:settings.style,aspectRatio:settings.aspectRatio}:{}),updatedAt:new Date().toISOString()};
}
export function newDirectorPromptEdition(project,name){
 assertWritable(project);const clean=String(name||'').trim();if(!clean||clean.length>80)throw Error('版本名称需为1至80个字');
 project=initialize(project);if(directorPromptEditions(project).some(row=>row.name===clean))throw Error('版本名称已存在');
 const row={id:crypto.randomUUID(),name:clean,createdAt:new Date().toISOString()};
 return switchDirectorPromptEdition({...project,episodes:project.episodes.map(ep=>({...ep,promptEditions:[...(ep.promptEditions||[]),row]}))},row.id);
}
export function renameDirectorPromptEdition(project,id,name){
 assertWritable(project);const clean=String(name||'').trim();if(!clean||clean.length>80)throw Error('版本名称需为1至80个字');
 if(directorPromptEditions(project).some(row=>row.id!==id&&row.name===clean))throw Error('版本名称已存在');
 return {...project,episodes:project.episodes.map(ep=>({...ep,promptEditions:(ep.promptEditions||[]).map(row=>row.id===id?{...row,name:clean}:row)})),updatedAt:new Date().toISOString()};
}
export function directorEditionHistory(project,history){
 const id=activeDirectorEditionId(project);if(!id)return history;
 const ids=new Set(project.episodes.flatMap(ep=>ep.prompts||[]).map(p=>p.id));
 return history.filter(p=>p.promptEditionId===id||ids.has(p.id));
}
export function directorEditionEpisodes(project,id){
 return (project.episodes||[]).map(ep=>{
  if(ep.promptEditionId===id)return ep;
  const target=(ep.promptEditions||[]).find(row=>row.id===id);
  return {...ep,...clone(workFields),...(target?.work||{}),promptEditionId:id};
 });
}
