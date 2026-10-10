import {sha256Text} from './directorQuickStore.js';
// Retire large localStorage replies only after their project-file save succeeds.
export function migrateDirectorReplies(state,accountId,storage){
 const retired=[];
 const projects=(state.directorProjects||[]).map(project=>{
  let changed=false;
  const episodes=(project.episodes||[]).map(ep=>{
   const prefix=`xz-director-manual-output:${accountId}:${project.id}:${ep.id}:`;
   const replies=[...(ep.manualSceneReplies||[])];
   for(let i=0;i<storage.length;i++){
    const key=storage.key(i);if(!key?.startsWith(prefix))continue;
    const raw=storage.getItem(key);let rows;try{rows=JSON.parse(raw);}catch{continue;}if(!Array.isArray(rows))continue;
    const sceneLabel=key.slice(prefix.length);
    rows.forEach((row,index)=>{const id=`legacy:${sha256Text(JSON.stringify([accountId,project.id,ep.id,sceneLabel,index,row]))}`;if(row&&typeof row.output==='string'&&!replies.some(r=>r.id===id)){replies.push({...row,id,sceneLabel});changed=true;}});
    retired.push({key,raw});
   }
   return replies.length!==(ep.manualSceneReplies||[]).length?{...ep,manualSceneReplies:replies}:ep;
  });
  return changed?{...project,episodes,updatedAt:new Date().toISOString()}:project;
 });
 return {state:{...state,directorProjects:projects},retired};
}
export function retireDirectorReplies(retired,storage){for(const {key,raw} of retired)if(storage.getItem(key)===raw)storage.removeItem(key);}
