import {inferDirectorEpisodeNumber} from './scriptImport.js';
export const videoLabelCompare=(a,b)=>String(a||'').localeCompare(String(b||''),'zh-CN',{numeric:true});
export function projectVideoRows(project,tasks=[],media=[]){
 const shots=new Map();
 (project.episodes||[]).filter(e=>e.kind!=='setting'&&e.title!=='设定和小传').forEach((ep,i)=>{for(const shot of ep.prompts||[])shots.set(shot.id,{shotId:shot.id,label:shot.label,episode:Number(String(shot.label||'').match(/^(\d+)-/)?.[1])||inferDirectorEpisodeNumber(ep,i+1),scene:String(shot.label||'').split('-').slice(0,2).join('-')});});
 const local=tasks.filter(t=>t.projectId===project.id&&t.kind==='video').map(t=>({...t,...shots.get(t.shotId),label:shots.get(t.shotId)?.label||t.shotLabel||t.promptLabel||t.scene||'未标号'}));
 const seen=new Set(local.map(t=>t.mediaId).filter(Boolean));
 const cloud=media.filter(m=>m.kind==='video'&&!seen.has(m.id)).flatMap(m=>{
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
