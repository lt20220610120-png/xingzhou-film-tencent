// Local JSON projects only. Remote collaboration deletion is a separate contract.
export const RECYCLE_COLLECTIONS={script:'scriptProjects',fruit:'fruitProjects',director:'directorProjects',library:'scriptLibrary'};
export const RECYCLE_LABELS={script:'创作剧本',fruit:'成品库',director:'导演工作台',library:'剧本库'};
const clone=v=>JSON.parse(JSON.stringify(v)),stamp=t=>new Date(t??Date.now()).toISOString();
const fail=message=>{throw new Error(message);};
export function recycleState(state){
 const raw=state?.projectRecycle??{};
 const malformed=()=>fail('回收站资料格式异常，请保留文件并检查');
 if(typeof raw!=='object'||Array.isArray(raw))malformed();
 if(raw.version!==undefined&&raw.version!==1)malformed();
 if(raw.policy!==undefined&&(!raw.policy||typeof raw.policy.automatic!=='boolean'||!Number.isInteger(raw.policy.retentionDays)||raw.policy.retentionDays<1||raw.policy.retentionDays>365))malformed();
 for(const field of ['items','audit','tombstones'])if(raw[field]!==undefined&&(!Array.isArray(raw[field])||raw[field].some(row=>!row||typeof row!=='object'||Array.isArray(row))))malformed();
 if(raw.items?.some(i=>!i.id||!Object.hasOwn(RECYCLE_COLLECTIONS,i.kind)||!i.projectId||i.project?.id!==i.projectId))malformed();
 if(raw.tombstones?.some(t=>typeof t.key!=='string'))malformed();
 return {version:1,...raw,policy:raw.policy||{automatic:true,retentionDays:7},items:raw.items||[],audit:raw.audit||[],tombstones:raw.tombstones||[]};
}
const key=(kind,id)=>JSON.stringify([kind,id]);
export function isRecycled(state,kind,id){return recycleState(state).tombstones.some(t=>t.key===key(kind,id));}
const record=(action,item,time)=>({id:crypto.randomUUID(),action,kind:item.kind,projectId:item.projectId,name:item.name,time});
function save(state,bin,records,time){return {...state,projectRecycle:{...bin,revision:(bin.revision||0)+1,updatedAt:time,audit:[...bin.audit,...records].slice(-1000)}};}
export const isLocalRecyclableDirector=project=>!(project.cloudProjectId||project.collaborationProjectId||project.sourceType==='cloud');
export function recycleProject(state,kind,projectId,{now}={}){
 const collection=Object.hasOwn(RECYCLE_COLLECTIONS,kind)?RECYCLE_COLLECTIONS[kind]:fail('不支持的本地项目类型'),project=(state[collection]||[]).find(p=>p.id===projectId);if(!project)return state;
 if(kind==='director'&&!isLocalRecyclableDirector(project))fail('云端协作项目请使用云端管理，不进入本地回收站');
 const bin=recycleState(state),time=stamp(now),item={id:crypto.randomUUID(),kind,projectId,name:project.name||'未命名项目',deletedAt:time,project:clone(project)};
 return save({...state,[collection]:state[collection].filter(p=>p.id!==projectId)},{...bin,items:[...bin.items,item],tombstones:[...bin.tombstones.filter(t=>t.key!==key(kind,projectId)),{key:key(kind,projectId),deletedAt:time}]},[record('trashed',item,time)],time);
}
export function restoreRecycledProject(state,itemId,{now}={}){
 const bin=recycleState(state),item=bin.items.find(i=>i.id===itemId)||fail('回收站项目已不存在'),collection=RECYCLE_COLLECTIONS[item.kind]||fail('回收站项目类型无法识别');
 if(!item.project||item.project.id!==item.projectId)fail('回收站快照不完整，请保留文件并检查');if((state[collection]||[]).some(p=>p.id===item.projectId))fail('已存在同编号项目，不能覆盖，请先核对');
 const project=clone(item.project),time=stamp(now),groupKey=item.kind==='script'?'scriptGroups':item.kind==='fruit'?'fruitGroups':item.kind==='director'?'directorGroups':null;
 // A deleted snapshot cannot own a live request. Keep all partial output and make
 // its historical task record usable after restoration, even after a restart.
 if(project.creator){
  const stop=r=>r?.status==='running'?{...r,status:'cancelled',error:'项目移入回收站时任务已中断，已有内容保留，可重新运行。',finishedAt:time,...(r.generation?{generation:{...r.generation,status:'interrupted'}}:{})}:r;
  if(Array.isArray(project.creator.records))project.creator.records=project.creator.records.map(stop);
  if(project.creator.ip?.firstDraft?.status==='running')project.creator.ip.firstDraft=stop(project.creator.ip.firstDraft);
  for(const world of project.creator.worldSimulation?.worlds||[])if(Array.isArray(world.runs))world.runs=world.runs.map(r=>r.status==='running'?{...r,status:'interrupted',error:'项目已恢复，已有推演保留，请重新运行。',finishedAt:time}:r);
 }
 if(groupKey&&project.groupId&&!(state[groupKey]||[]).some(g=>g.id===project.groupId))project.groupId=item.kind==='director'?'director-workbench':null;
 project.updatedAt=time;return save({...state,[collection]:[...(state[collection]||[]),project]},{...bin,items:bin.items.filter(i=>i.id!==itemId),tombstones:bin.tombstones.filter(t=>t.key!==key(item.kind,item.projectId))},[record('restored',item,time)],time);
}
export function purgeRecycledProjects(state,ids,{now,reason='purged'}={}){
 const bin=recycleState(state),selected=new Set(ids),items=bin.items.filter(i=>selected.has(i.id));if(!items.length)return state;const time=stamp(now);
 return save(state,{...bin,items:bin.items.filter(i=>!selected.has(i.id))},items.map(i=>record(reason,i,time)),time);
}
export function setRecyclePolicy(state,policy,{now}={}){
 if(typeof policy.automatic!=='boolean'||!Number.isInteger(policy.retentionDays)||policy.retentionDays<1||policy.retentionDays>365)fail('保留时间需要1—365天');
 const bin=recycleState(state),time=stamp(now);return save(state,{...bin,policy:{automatic:policy.automatic,retentionDays:policy.retentionDays}},[{id:crypto.randomUUID(),action:'policy',name:'回收站清理规则',time,policy:{...policy}}],time);
}
export function recycleExpiry(item,policy){const time=Date.parse(item.deletedAt);return policy.automatic&&Number.isFinite(time)?time+policy.retentionDays*86400000:null;}
export function cleanupRecycle(state,{now=Date.now()}={}){
 const bin=recycleState(state);if(!bin.policy.automatic)return state;const ids=bin.items.filter(i=>{const expiry=recycleExpiry(i,bin.policy);return expiry!==null&&expiry<=now;}).map(i=>i.id);return purgeRecycledProjects(state,ids,{now,reason:'expired'});
}
export function recycleDeleteDetail(state){const p=recycleState(state).policy;return `项目及完整内容会移入本地回收站，可恢复。${p.automatic?`删除后满${p.retentionDays}天自动清理。`:'已关闭自动清理，保留至你手动清理。'}`;}
