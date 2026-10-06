// Project editions contain the complete working manuscript, never another
// editions array. Sources stay in the project's immutable source archive.
let sequence=0;
const timestamp=()=>new Date().toISOString();
const editionId=()=>`ip-edition-${Date.now()}-${sequence++}-${Math.random().toString(36).slice(2,7)}`;
const snapshot=(p,previous={})=>{
 const ip=p.creator.ip;
 return {...previous,id:previous.id||editionId(),number:previous.number||1,kind:previous.kind||'adaptation',createdAt:previous.createdAt||timestamp(),updatedAt:timestamp(),
  duration:ip.duration,requirements:ip.requirements||'',sourceId:ip.source?.id,plan:ip.plan,
  episodes:p.episodes,retiredEpisodes:ip.retiredEpisodes||[],reading:ip.reading||[],firstDraft:ip.firstDraft,completedImport:ip.completedImport||false};
};
export function checkpointIPEdition(p,{force=false}={}){
 let ip=p.creator.ip;
 // Pre-2.7.8 candidates were all scoped to the then-current target. Persist
 // that target before changing it, rather than guessing from episode counts.
 if(ip.planCandidates?.some(c=>![60,120].includes(c.duration))){
  ip={...ip,planCandidates:ip.planCandidates.map(c=>[60,120].includes(c.duration)?c:{...c,duration:ip.duration,requirements:c.requirements??p.creator.records.find(r=>r.id===c.id)?.instruction??ip.requirements??''})};
  p={...p,creator:{...p.creator,ip}};
 }
 const editions=ip.editions||[],previous=editions.find(e=>e.id===ip.activeEditionId);
 if(!force&&((!ip.plan&&previous?.kind!=='working-draft')||ip.editionRecordSuppressed))return p;
 // A changed source/target must not overwrite an older edition's manuscript.
 if(!force&&previous&&(previous.sourceId!==ip.source?.id||previous.duration!==ip.duration))return p;
 const saved=snapshot(p,previous||(force?{number:(ip.draftSequence||0)+1,kind:'working-draft'}:{number:(ip.editionSequence||editions.filter(e=>e.kind!=='working-draft').reduce((n,e)=>Math.max(n,e.number||0),0))+1}));
 return {...p,creator:{...p.creator,ip:{...ip,activeEditionId:saved.id,
  ...(saved.kind==='working-draft'?{draftSequence:Math.max(ip.draftSequence||0,saved.number)}:{editionSequence:Math.max(ip.editionSequence||0,saved.number)}),
  editions:previous?editions.map(e=>e.id===saved.id?saved:e):[...editions,saved]}}};
}
export function retainIPWorkingDraft(p){
 const ip=p.creator.ip;
 if((ip.plan&&!ip.editionRecordSuppressed)||ip.activeEditionId)return checkpointIPEdition(p);
 if(!ip.requirements?.trim()&&!p.episodes.some(e=>e.type==='episode'||e.scriptText?.trim()||e.ipVersions?.length))return p;
 // Explicitly deleted IDs stay deleted. Switching away archives remaining
 // working text under a new ID, including planless edits after target changes.
 return checkpointIPEdition({...p,creator:{...p.creator,ip:{...ip,activeEditionId:null,editionRecordSuppressed:false}}},{force:true});
}
export function startIPEdition(p){
 const ip=p.creator.ip;
 return checkpointIPEdition({...p,creator:{...p.creator,ip:{...ip,activeEditionId:null,editionRecordSuppressed:false}}});
}
export function ipEditionRecords(p){
 if(!p)return [];
 const ip=p.creator.ip,records=ip.editions||[];
 if(ip.plan&&!ip.activeEditionId&&!ip.editionRecordSuppressed)return [...records,snapshot(p,{id:'legacy-current',number:(ip.editionSequence||0)+1,createdAt:ip.plan.acceptedAt||p.createdAt})];
 return records;
}
export function restoreIPEdition(p,id){
 const savedProject=retainIPWorkingDraft(p),ip=savedProject.creator.ip;
 const target=ip.editions?.find(e=>e.id===(id==='legacy-current'?ip.activeEditionId:id));
 if(!target)throw new Error('该版本已删除或不存在');
 const source=ip.sources?.find(s=>s.id===target.sourceId)||(ip.source?.id===target.sourceId?ip.source:null);
 if(!source&&target.sourceId)throw new Error('该版本的小说原文未找到，当前稿未修改');
 return {...savedProject,episodes:structuredClone(target.episodes),creator:{...savedProject.creator,ip:{...ip,
  activeEditionId:target.id,editionRecordSuppressed:false,duration:target.duration,requirements:target.requirements||'',source,
  plan:structuredClone(target.plan),reading:structuredClone(target.reading||[]),retiredEpisodes:structuredClone(target.retiredEpisodes||[]),
  firstDraft:structuredClone(target.firstDraft),completedImport:target.completedImport||false}}};
}
export function removeIPEdition(p,id){
 const ip=p.creator.ip,active=id===ip.activeEditionId||id==='legacy-current';
 return {...p,creator:{...p.creator,ip:{...ip,editions:(ip.editions||[]).filter(e=>e.id!==(id==='legacy-current'?ip.activeEditionId:id)),
  ...(active?{activeEditionId:null,editionRecordSuppressed:true}:{})}}};
}
