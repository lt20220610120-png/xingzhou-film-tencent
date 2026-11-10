import {inferDirectorEpisodeNumber} from './scriptImport.js';
export const videoLabelCompare=(a,b)=>String(a||'').localeCompare(String(b||''),'zh-CN',{numeric:true});
export function projectVideoRows(project,tasks=[],media=[]){
 const shots=new Map();
 (project.episodes||[]).filter(e=>e.kind!=='setting'&&e.title!=='设定和小传').forEach((ep,i)=>{for(const shot of ep.storyboardPrompts||ep.prompts||[])shots.set(shot.id,{shotId:shot.id,label:shot.label,episode:Number(String(shot.label||'').match(/^(\d+)-/)?.[1])||inferDirectorEpisodeNumber(ep,i+1),scene:String(shot.label||'').split('-').slice(0,2).join('-')});});
 for(const shot of [...shots.values()]){const original=(project.episodes||[]).flatMap(e=>e.storyboardPrompts||e.prompts||[]).find(s=>s.id===shot.shotId);if(original?.sourcePromptId)shots.set(original.sourcePromptId,shot);}
 const local=tasks.filter(t=>t.projectId===project.id&&t.kind==='video').map(t=>({...t,localResult:true,...shots.get(t.shotId),label:shots.get(t.shotId)?.label||t.shotLabel||t.promptLabel||t.scene||'未标号'}));
 const seen=new Set(local.map(t=>t.mediaId).filter(Boolean));
 const cloud=media.filter(m=>m.kind==='video'&&(!m.projectId||m.projectId===project.id)&&(!m.project_id||m.project_id===project.id)&&!seen.has(m.id)).flatMap(m=>{
  const id=String(m.note||'').match(/\[shot:([^\]]+)\]/)?.[1];
  const shot=shots.get(id)||[...shots.values()].find(s=>s.label===m.note&&s.scene===m.scene&&s.episode===Number(m.episode));
  // Reference uploads are not generated results.
  if(!shot&&!id)return [];
  return [{...m,...shot,label:shot?.label||m.note||m.scene,status:'success',mediaId:m.id}];
 });
 const results=[...local,...cloud];
 for(const shot of shots.values())if(!results.some(r=>r.shotId===shot.shotId))results.push({...shot,id:'waiting:'+shot.shotId,status:'not-started',projectId:project.id,kind:'video'});
 return results.sort((a,b)=>videoLabelCompare(a.label,b.label)||String(a.createdAt||a.created_at||'').localeCompare(String(b.createdAt||b.created_at||'')));
}
export function filterProjectVideos(rows,{episode='',scene=''}={}){return rows.filter(r=>(!episode||Number(r.episode)===Number(episode))&&(!scene||r.scene===scene));}

export const videoResultKey=row=>row.localResult?'job:'+row.id:'media:'+(row.mediaId||row.id);
export const videoExportId=row=>row.localResult?{jobId:row.id}:{mediaId:row.mediaId||row.id};
const resultTime=row=>Date.parse(row.createdAt||row.created_at||row.submittedAt||row.completedAt||'')||0;
export function groupProjectVideos(rows){
 const groups=new Map();
 for(const row of rows){const episode=Number(row.episode)||Number(String(row.label).split('-')[0])||0,scene=/^\d+-\d+-\d+$/.test(row.label)?row.label.split('-').slice(0,2).join('-'):String(row.scene||''),key=JSON.stringify([episode,scene,row.label]),group=groups.get(key)||{...row,episode,scene,id:key,results:[]};
  if(row.status!=='not-started'&&!group.results.some(r=>videoResultKey(r)===videoResultKey(row)))group.results.push(row);
  groups.set(key,group);
 }
 return [...groups.values()].map(group=>{
  group.results.sort((a,b)=>resultTime(b)-resultTime(a)||String(b.id).localeCompare(String(a.id)));
  const successful=group.results.filter(r=>r.status==='success'),latest=successful[0];
  return {...group,successful,latest,status:latest?'success':group.results[0]?.status||'not-started'};
 }).sort((a,b)=>videoLabelCompare(a.label,b.label));
}
export function selectedProjectVideos(groups,overrides=new Map()){
 return groups.flatMap(g=>overrides.has(g.id)?g.successful.filter(r=>overrides.get(g.id).includes(videoResultKey(r))):g.latest?[g.latest]:[]);
}
