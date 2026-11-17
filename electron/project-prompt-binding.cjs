const {randomUUID,createHash}=require('node:crypto');
const {sharedBindingValue}=require('../cloud-backend/src/prompt-binding.cjs');
const bindingCache=new Map();
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const editors=['producer','artist','artist_collaborator'];
function createProjectPromptBinding({authorize,getProject,saveShared,localStore,getLedger,scope}){
 async function context(p,write=false){
  const owner=scope(),account=await authorize(p.projectId);
  if(!account?.id||String(account.id)!==p.accountId||scope()!==owner)throw Error('账号或资料目录已变化');
  const key=owner+':'+p.projectId,cached=bindingCache.get(key);
  const response=await getProject({projectId:p.projectId,bindingContext:true,knownBindingRevision:cached?.revision});
  const project=response?.bindingUnchanged?{...response,analysis_progress:{_sharedPromptBinding:cached}}:response;
  if(!project||!['producer','artist','collaborator','artist_collaborator'].includes(project.myRole))throw Error('没有这个项目的关联读取权限');
  if(project.deleted_at)throw Error('项目已删除，请先恢复');
  if(write&&(project.locked||!editors.includes(project.myRole)))throw Error('项目已锁定或没有关联编辑权限');
  const guard=()=>{if(scope()!==owner)throw Error('账号或资料目录已变化');};guard();
  const remember=value=>{guard();if(value&&(!bindingCache.has(key)||value.revision>=bindingCache.get(key).revision)){bindingCache.delete(key);bindingCache.set(key,value);while(bindingCache.size>8)bindingCache.delete(bindingCache.keys().next().value);}};
  remember(project.analysis_progress?._sharedPromptBinding);
  return {project,guard,remember};
 }
 const ledgerData=(p,project)=>{
  const local=getLedger(p)||{},episodes={};
  const sources=require('../cloud-backend/src/collab-episodes.cjs').numberedEpisodes(project.episodes);
  for(const [n,r]of Object.entries({...project.analysis_progress?._sharedPromptBinding?.reviewLedger?.episodes,...local.episodes}))if(r.status!=='empty'&&(project.bindingSources?typeof r.sourceContent==='string'&&createHash('sha256').update(r.sourceContent).digest('hex')===project.bindingSources[n]:r.sourceContent===sources.find(e=>e.number===Number(n))?.episode.content))episodes[n]=r;
  return {episodes};
 };
 async function persist(p,ctx){
  const {project,guard,remember}=ctx,request={...p,ackOnly:true,writeId:p.writeId||randomUUID(),data:{...p.data,reviewLedger:ledgerData(p,project)}};
  let next;
  try{next=await saveShared(request);guard();}
  catch(error){
   guard();if(!/未确认本次保存/.test(error.message))throw error;
   // Read only: never replay a model request or an ambiguous write.
   const recovered=await context(p).catch(()=>null);guard();
   const found=recovered?.project.analysis_progress?._sharedPromptBinding;
   if(found?.lastWriteId!==request.writeId||found.updatedBy!==p.accountId||found.revision!==p.baseRevision+1)throw error;
   remember(found);return {...found,accountId:p.accountId};
  }
  if(next?.bindingReceipt){
   if(next.projectId!==p.projectId||next.lastWriteId!==request.writeId||next.updatedBy!==p.accountId||next.revision!==p.baseRevision+1)throw Error('关联保存回执不匹配，请刷新核对');
   const {revision,lastWriteId,updatedBy,updatedAt}=next;
   const previous=project.analysis_progress?._sharedPromptBinding;
   next=previous?.lastWriteId===lastWriteId&&previous.updatedBy===updatedBy?previous:sharedBindingValue(previous,request.data,{revision,lastWriteId,updatedBy,updatedAt});
  }
  guard();remember(next);return {...next,accountId:p.accountId};
 }
 return {
  isProject:p=>UUID.test(p?.projectId||''),
  async load(p){
   const ctx=await context(p),{project,guard}=ctx,remote=project.analysis_progress?._sharedPromptBinding;
   if(remote){guard();return {...remote,accountId:p.accountId};}
   const local=localStore().load(p);if(!local){guard();return null;}
   // One-time migration is CAS-protected and never overwrites another member.
   if(!project.locked&&editors.includes(project.myRole)){
    try{return await persist({...p,baseRevision:0,data:local},ctx);}
    catch(e){guard();if(e.status!==409&&!/记录.*更新/.test(e.message))throw e;const current=await getProject({projectId:p.projectId});guard();return {...current.analysis_progress._sharedPromptBinding,accountId:p.accountId};}
   }
   guard();return local;
  },
  async save(p){
   return persist(p,await context(p,true));
  },
  async status(p){const {project,guard}=await context(p);guard();return {enabled:true,canEdit:!project.locked&&editors.includes(project.myRole)};},
 };
}
module.exports={createProjectPromptBinding};
