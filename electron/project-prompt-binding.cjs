const {randomUUID}=require('node:crypto');
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const editors=['producer','artist','artist_collaborator'];
function createProjectPromptBinding({authorize,getProject,saveShared,localStore,getLedger,scope}){
 async function context(p,write=false){
  const owner=scope(),account=await authorize(p.projectId);
  if(!account?.id||String(account.id)!==p.accountId||scope()!==owner)throw Error('账号或资料目录已变化');
  const project=await getProject({projectId:p.projectId});
  if(!project||!['producer','artist','collaborator','artist_collaborator'].includes(project.myRole))throw Error('没有这个项目的关联读取权限');
  if(write&&(project.locked||!editors.includes(project.myRole)))throw Error('项目已锁定或没有关联编辑权限');
  return {project,guard:()=>{if(scope()!==owner)throw Error('账号或资料目录已变化');}};
 }
 const ledgerData=(p,project)=>{
  const local=getLedger(p)||{},episodes={};
  const sources=require('../cloud-backend/src/collab-episodes.cjs').numberedEpisodes(project.episodes);
  for(const [n,r]of Object.entries({...project.analysis_progress?._sharedPromptBinding?.reviewLedger?.episodes,...local.episodes}))if(r.status!=='empty'&&r.sourceContent===sources.find(e=>e.number===Number(n))?.episode.content)episodes[n]=r;
  return {episodes};
 };
 return {
  isProject:p=>UUID.test(p?.projectId||''),
  async load(p){
   const {project,guard}=await context(p),remote=project.analysis_progress?._sharedPromptBinding;
   if(remote){guard();return {...remote,accountId:p.accountId};}
   const local=localStore().load(p);if(!local){guard();return null;}
   // One-time migration is CAS-protected and never overwrites another member.
   if(!project.locked&&editors.includes(project.myRole)){
    try{const next=await saveShared({...p,baseRevision:0,writeId:randomUUID(),data:{...local,reviewLedger:ledgerData(p,project)}});guard();return {...next,accountId:p.accountId};}
    catch(e){guard();if(e.status!==409&&!/记录.*更新/.test(e.message))throw e;const current=await getProject({projectId:p.projectId});guard();return {...current.analysis_progress._sharedPromptBinding,accountId:p.accountId};}
   }
   guard();return local;
  },
  async save(p){
   const {project,guard}=await context(p,true);
   const next=await saveShared({...p,writeId:p.writeId||randomUUID(),data:{...p.data,reviewLedger:ledgerData(p,project)}});guard();return {...next,accountId:p.accountId};
  },
  async status(p){const {project,guard}=await context(p);guard();return {enabled:true,canEdit:!project.locked&&editors.includes(project.myRole)};},
 };
}
module.exports={createProjectPromptBinding};
