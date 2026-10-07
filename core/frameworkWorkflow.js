// Immutable JSON-only workflow. This module deliberately does not import the
// project store or creatorWorkspace (both call this normalizer).
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const list=value=>Array.isArray(value)?value:[];
const text=value=>typeof value==='string'?value:'';
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
let sequence=0;
const uid=()=>`framework_${Date.now().toString(36)}_${(sequence++).toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const now=()=>new Date().toISOString();
const fail=(code,message)=>{const error=new Error(message);error.code=`FRAMEWORK_${code}`;throw error;};
const find=(items,id,label='内容')=>items.find(item=>item.id===id)||fail('NOT_FOUND',`找不到${label}，请刷新后重试。`);
const nodeDefaults={title:'',confirmed:false,locked:false};
const event=(value,id)=>({...nodeDefaults,summary:'',before:'',after:'',motive:'',foreshadow:'',actualTime:'',characterIds:[],story:'',...clone(value||{}),id:value?.id||id});
const middle=(value,id)=>({...nodeDefaults,...clone(value||{}),id:value?.id||id,events:list(value?.events).map((v,i)=>event(v,`${id}_event_${i+1}`))});
const group=(value,id)=>({...nodeDefaults,goal:'',time:'',...clone(value||{}),id:value?.id||id,events:list(value?.events).map((v,i)=>event(v,`${id}_event_${i+1}`)),middles:list(value?.middles).map((v,i)=>middle(v,`${id}_middle_${i+1}`))});
const episode=(value,id)=>({title:'',type:'episode',content:'',result:'',finalConfirmed:false,stale:false,eventIds:[],...clone(value||{}),id:value?.id||id});
const plan=(value,id)=>({name:'',eventSnapshot:[],settingsRevision:0,stale:false,...clone(value||{}),id:value?.id||id,episodes:list(value?.episodes).map((v,i)=>episode(v,`${id}_episode_${i+1}`))});
const letters=index=>{let n=index+1,result='';while(n){n--;result=String.fromCharCode(65+n%26)+result;n=Math.floor(n/26);}return result;};

function rows(f){
 const result=[];
 f.groups.forEach((g,index)=>{const groupCode=letters(index);let count=0;
  for(const e of g.events)result.push({group:g,middle:null,event:e,code:`${groupCode}${++count}`,groupCode});
  for(const m of g.middles)for(const e of m.events)result.push({group:g,middle:m,event:e,code:`${groupCode}${++count}`,groupCode});
 });
 f.looseEvents.forEach((e,i)=>result.push({group:null,middle:null,event:e,code:`待归组${i+1}`,groupCode:''}));
 return result;
}
function nodes(f){
 const out=[];
 f.groups.forEach((g,i)=>{
  out.push({node:g,path:['groups',i],parent:null,container:f.groups});
  g.events.forEach((e,j)=>out.push({node:e,path:['groups',i,'events',j],parent:g,container:g.events}));
  g.middles.forEach((m,j)=>{out.push({node:m,path:['groups',i,'middles',j],parent:g,container:g.middles});
   m.events.forEach((e,k)=>out.push({node:e,path:['groups',i,'middles',j,'events',k],parent:m,grandparent:g,container:m.events}));
  });
 });
 f.looseEvents.forEach((e,i)=>out.push({node:e,path:['looseEvents',i],parent:null,container:f.looseEvents}));
 return out;
}
function assertIds(f){
 const seen=new Set();
 for(const {node} of nodes(f)){if(typeof node.id!=='string'||!node.id||seen.has(node.id))fail('INVALID','事件和分组需要唯一、非空的稳定编号。');seen.add(node.id);}
 for(const collection of ['ideas','characters','sources','components','simulations','plans']){
  const ids=new Set();for(const item of f[collection]){if(!item?.id||ids.has(item.id))fail('INVALID',`${collection} 编号重复或缺失。`);ids.add(item.id);}
 }
 for(const p of f.plans){const ids=new Set();for(const e of p.episodes){if(!e.id||ids.has(e.id))fail('INVALID','分集编号重复或缺失。');ids.add(e.id);}}
}
function structuredLegacy(previous){
 for(const key of ['skeleton','outline','events','macroOutline']){
  const raw=previous.sections?.[key]?.output;
  if(raw&&typeof raw==='object'&&Array.isArray(raw.groups))return clone(raw.groups);
  if(typeof raw==='string'){try{const parsed=JSON.parse(raw);if(Array.isArray(parsed.groups))return clone(parsed.groups);}catch{/* Free text remains recovery material. */}}
 }
 return [];
}
export function normalizeFrameworkProject(project){
 if(!project||typeof project!=='object')return project;
 const mode=project.creator?.mode||project.mode;
 if(mode&&mode!=='framework')return project;
 if(project.creator?.mode!=='framework'&&project.mode!=='framework'&&!project.creator?.framework)return project;
 const creator=clone(project.creator||{}),old=creator.framework||{},initial=old.version!==2;
 const prefix=project.id||'legacy';
 const groups=list(old.groups).length?old.groups:initial?structuredLegacy(creator):[];
 const migratedStory=initial&&!groups.length?list(creator.story?.events).map(e=>({...e,summary:e.summary||e.content||'',story:e.result||'',confirmed:Boolean(e.accepted),source:{legacyEventId:e.id}})):[];
 const f={...old,version:2,
  ideas:list(old.ideas).map((v,i)=>({text:'',included:false,...v,id:v.id||`${prefix}_idea_${i+1}`})),ideaSummary:text(old.ideaSummary),
  settings:{items:[],pending:[],confirmed:false,revision:0,history:[],...old.settings},
  groups:groups.map((g,i)=>group(g,g.id||`${prefix}_group_${i+1}`)),
  looseEvents:(own(old,'looseEvents')?list(old.looseEvents):migratedStory).map((e,i)=>event(e,e.id||`${prefix}_event_${i+1}`)),
  mainline:{links:[],confirmed:false,...old.mainline},characters:list(old.characters).length?old.characters:initial?list(creator.story?.characters).map(c=>({...c,confirmed:Boolean(c.accepted)})):[],
  sources:list(old.sources),components:list(old.components),simulations:list(old.simulations),plans:list(old.plans).map((p,i)=>plan(p,p.id||`${prefix}_plan_${i+1}`)),
  activePlanId:old.activePlanId||null,archives:list(old.archives),legacy:{...old.legacy},
 };
 for(const key of ['items','pending','history'])f.settings[key]=list(f.settings[key]);
 f.mainline.links=list(f.mainline.links);
 for(const collection of ['characters','sources','components','simulations'])f[collection]=f[collection].map((v,i)=>({...v,id:v.id||`${prefix}_${collection}_${i+1}`}));
 if(initial){
  if(creator.framework&&!own(f.legacy,'framework'))f.legacy.framework=clone(creator.framework);
  for(const key of ['sections','story','source','references','legacy'])if(creator[key]!==undefined&&!own(f.legacy,key))f.legacy[key]=clone(creator[key]);
  for(const key of ['masterScript','finalScript','episodes'])if(project[key]!==undefined&&!own(f.legacy,key))f.legacy[key]=clone(project[key]);
  if(!f.plans.length&&list(project.episodes).length){const id=`${prefix}_legacy_plan`;f.plans.push(plan({id,name:'旧版分集与正文',episodes:clone(project.episodes),legacy:true},id));f.activePlanId=id;}
 }
 // Preserve exact legacy episode shape until its first explicit edit.
 if(initial&&f.plans.some(p=>p.legacy)){for(const p of f.plans.filter(p=>p.legacy))p.episodes=clone(project.episodes);}
 if(!initial)for(const p of f.plans){const original=list(old.plans).find(v=>v.id===p.id);if(original?.legacy)p.episodes=clone(original.episodes);}
 const active=f.plans.find(p=>p.id===f.activePlanId);
 return {...clone(project),episodes:active?clone(active.episodes):f.plans.length||f.archives.some(a=>a.kind==='plan')?[]:clone(project.episodes||[]),creator:{...creator,framework:f}};
}
export const frameworkState=project=>normalizeFrameworkProject(project)?.creator?.framework;
export const frameworkEvents=project=>{const f=frameworkState(project);return f?rows(f):[];};
export const frameworkEventCode=(project,id)=>frameworkEvents(project).find(row=>row.event.id===id)?.code||'';
export const frameworkLinks=project=>frameworkState(project)?.mainline.links||[];
const groupedRows=f=>rows(f).filter(row=>row.group);
export const frameworkStructureFingerprint=project=>{
 const f=frameworkState(project);return JSON.stringify({settings:f.settings,groups:f.groups,looseEvents:f.looseEvents,characters:f.characters,components:f.components,ideas:f.ideas,ideaSummary:f.ideaSummary,mainline:f.mainline});
};
function settingsGate(f){if(f.settings.pending.length)fail('SETTINGS_PENDING','请先处理所有待决设定和冲突。');if(!f.settings.confirmed)fail('UNCONFIRMED','请先人工确认本剧设定。');}
function skeletonGate(f){settingsGate(f);const adopted=groupedRows(f);if(!adopted.length||adopted.some(r=>!r.event.confirmed))fail('UNCONFIRMED','请先确认事件骨架中的小事件。');}
function lockGuard(before,after,exceptId){
 const next=nodes(after);
 for(const old of nodes(before).filter(n=>n.node.locked&&n.node.id!==exceptId)){
  const replacement=next.find(n=>n.node.id===old.node.id);
  if(!replacement||!equal(old.path,replacement.path)||!equal(old.node,replacement.node))fail('LOCKED','固定事件及其子事件不可编辑、移动或删除，请先解除固定。');
 }
}
function editable(f,id){const found=find(nodes(f).map(n=>({...n,id:n.node.id})),id,'事件');if(found.node.locked||found.parent?.locked||found.grandparent?.locked)fail('LOCKED','请先解除事件或所属分组的固定。');return found;}
function destination(f,c,kind='event'){
 if(!c.groupId){if(c.middleId)fail('INVALID','中事件必须属于大事件。');return f.looseEvents;}
 const g=find(f.groups,c.groupId,'大事件');if(g.locked)fail('LOCKED','所属大事件已固定。');
 if(kind==='middle')return g.middles;
 if(c.middleId){const m=find(g.middles,c.middleId,'中事件');if(m.locked)fail('LOCKED','所属中事件已固定。');return m.events;}
 return g.events;
}
function insert(items,value,index){const to=index===undefined?items.length:index;if(!Number.isInteger(to)||to<0||to>items.length)fail('INVALID','移动位置超出范围。');items.splice(to,0,value);}
function patchNode(node,patch){if(['id','locked','events','middles'].some(key=>own(patch,key)))fail('INVALID','请用独立操作修改编号、固定或事件层级。');Object.assign(node,clone(patch||{}));}
const settingsContent=f=>JSON.stringify({items:f.settings.items,confirmed:f.settings.confirmed,revision:f.settings.revision});
const eventSequence=f=>groupedRows(f).map(r=>[r.group.id,r.middle?.id||null,r.event.id]);
function invalidate(before,f){
 const sequenceChanged=!equal(eventSequence(before),eventSequence(f));
 const settingChanged=settingsContent(before)!==settingsContent(f);
 const charactersChanged=!equal(before.characters,f.characters);
 const previous=new Map(groupedRows(before).map(r=>[r.event.id,r.event]));
 const current=new Map(groupedRows(f).map(r=>[r.event.id,r.event]));
 const connectionChanged=!equal(before.mainline.links,f.mainline.links);
 let changed=sequenceChanged||settingChanged||charactersChanged||connectionChanged;
 for(const [id,e]of previous){if(!equal(e,current.get(id)))changed=true;}
 if(!equal(before.groups,f.groups))changed=true;
 for(const link of f.mainline.links){
  if(sequenceChanged||settingChanged||charactersChanged||!equal(previous.get(link.fromId),current.get(link.fromId))||!equal(previous.get(link.toId),current.get(link.toId)))Object.assign(link,{stale:true,confirmed:false});
 }
 if(changed){f.mainline.confirmed=false;for(const p of f.plans){p.stale=true;for(const e of p.episodes)if(text(e.result))e.stale=true;}}
}
function snapshotArchive(f,kind,value,id=value.id){f.archives.push({id,kind,snapshot:clone(value),createdAt:now()});}
function addEvent(f,c){const value=event(c.event,c.event?.id||uid());insert(destination(f,c),value,c.index);return value;}

/** Commands are atomic: failed validation never mutates the caller's project. */
export function applyFrameworkCommand(project,command){
 const p=normalizeFrameworkProject(project);if(!p?.creator?.framework)fail('INVALID','当前项目不是框架式创作。');
 if(!command||typeof command.type!=='string')fail('INVALID','缺少操作类型。');
 const c=clone(command),before=clone(p.creator.framework),f=p.creator.framework;
 let lockException;
 switch(c.type){
 case 'creator.config':Object.assign(p.creator,clone(c.patch||{}));p.creator.framework=f;break;
 case 'record.update':{const record=find(list(p.creator.records),c.id,'任务记录');if(own(c.patch,'id'))fail('INVALID','不能修改任务编号。');Object.assign(record,c.patch);break;}
 case 'record.remove':p.creator.records=list(p.creator.records).filter(r=>r.id!==c.id);break;
 case 'idea.add':f.ideas.push({text:'',included:false,...c.idea,id:c.idea?.id||uid()});break;
 case 'idea.update':patchNode(find(f.ideas,c.id,'灵感'),c.patch);break;
 case 'idea.remove':find(f.ideas,c.id,'灵感');f.ideas=f.ideas.filter(v=>v.id!==c.id);break;
 case 'idea.summary':f.ideaSummary=text(c.text);break;
 case 'settings.propose':{
  if(!Array.isArray(c.items)||!c.items.length)fail('INVALID','请提供待检查设定。');
  for(const value of c.items){if(!text(value.text).trim())fail('INVALID','设定内容不能为空。');const id=value.id||uid();if(f.settings.pending.some(v=>v.id===id))fail('INVALID','待决设定编号重复。');
   const conflicts=list(value.conflictsWith);for(const conflict of conflicts)find(f.settings.items,conflict,'冲突设定');
   f.settings.pending.push({...value,id,conflictsWith:conflicts});}
  f.settings.confirmed=false;break;
 }
 case 'settings.resolve':{
  const pending=find(f.settings.pending,c.id,'待决设定');if(!['keep','replace','merge'].includes(c.choice))fail('INVALID','请选择保留旧条、替换或合并。');
  if(c.choice==='merge'&&!text(c.text).trim())fail('INVALID','合并需要填写最终设定。');
  f.settings.history.push({candidate:clone(pending),choice:c.choice,previous:clone(f.settings.items),createdAt:now()});
  if(c.choice!=='keep'){const conflicts=new Set(list(pending.conflictsWith));f.settings.items=f.settings.items.filter(v=>!conflicts.has(v.id)&&v.id!==pending.id);f.settings.items.push({...pending,text:text(c.text)||pending.text,confirmed:true});f.settings.revision++;}
  f.settings.pending=f.settings.pending.filter(v=>v.id!==c.id);f.settings.confirmed=false;break;
 }
 case 'settings.confirm':if(f.settings.pending.length)fail('SETTINGS_PENDING','请先处理全部待决设定。');f.settings.confirmed=true;break;
 case 'group.add':insert(f.groups,group(c.group,c.group?.id||uid()),c.index);break;
 case 'group.update':{const n=editable(f,c.id);if(n.container!==f.groups)fail('INVALID','请选择大事件。');patchNode(n.node,c.patch);break;}
 case 'group.remove':{const n=editable(f,c.id);if(n.container!==f.groups)fail('INVALID','请选择大事件。');snapshotArchive(f,'group',n.node);n.container.splice(n.container.indexOf(n.node),1);break;}
 case 'group.move':{const n=editable(f,c.id);if(n.container!==f.groups)fail('INVALID','请选择大事件。');n.container.splice(n.container.indexOf(n.node),1);insert(f.groups,n.node,c.index);break;}
 case 'middle.add':if(!c.groupId)fail('INVALID','中事件必须属于大事件。');insert(destination(f,c,'middle'),middle(c.middle,c.middle?.id||uid()),c.index);break;
 case 'middle.update':{const n=editable(f,c.id);if(!Array.isArray(n.node.events)||Array.isArray(n.node.middles))fail('INVALID','请选择中事件。');patchNode(n.node,c.patch);break;}
 case 'middle.remove':{const n=editable(f,c.id);if(!Array.isArray(n.node.events)||Array.isArray(n.node.middles))fail('INVALID','请选择中事件。');snapshotArchive(f,'middle',n.node);n.container.splice(n.container.indexOf(n.node),1);break;}
 case 'middle.move':{const n=editable(f,c.id);if(!c.groupId||!Array.isArray(n.node.events)||Array.isArray(n.node.middles))fail('INVALID','请选择中事件及所属大事件。');const to=destination(f,c,'middle');n.container.splice(n.container.indexOf(n.node),1);insert(to,n.node,c.index);break;}
 case 'event.add':addEvent(f,c);break;
 case 'event.update':{
  const n=editable(f,c.id);if(Array.isArray(n.node.events))fail('INVALID','请选择小事件。');
  if(own(c.patch,'story')){settingsGate(f);if(!n.node.confirmed)fail('UNCONFIRMED','请先人工确认该事件骨架，再整理完整事件故事。');}
  patchNode(n.node,c.patch);break;
 }
 case 'event.remove':{const n=editable(f,c.id);if(Array.isArray(n.node.events))fail('INVALID','请选择小事件。');snapshotArchive(f,'event',n.node);n.container.splice(n.container.indexOf(n.node),1);break;}
 case 'event.move':{const n=editable(f,c.id);if(Array.isArray(n.node.events))fail('INVALID','请选择小事件。');const to=destination(f,c);n.container.splice(n.container.indexOf(n.node),1);insert(to,n.node,c.index);break;}
 case 'node.lock':{
  const n=find(nodes(f).map(n=>({...n,id:n.node.id})),c.id,'事件');if(n.parent?.locked||n.grandparent?.locked)fail('LOCKED','所属分组已固定，请先解除分组固定。');n.node.locked=Boolean(c.locked);lockException=c.id;break;
 }
 case 'node.confirm':{const n=editable(f,c.id);if(!text(n.node.title).trim())fail('INVALID','请先填写事件名称。');n.node.confirmed=c.confirmed!==false;break;}
 case 'mainline.link':{
  const link=c.link||{};for(const id of [link.fromId,link.toId])if(!groupedRows(f).some(r=>r.event.id===id))fail('NOT_FOUND','衔接事件不存在或尚未归入正式骨架。');if(link.fromId===link.toId)fail('INVALID','不能将事件连接到自身。');
  const value={actualTime:'',narrativeOrder:'',before:'',after:'',motive:'',foreshadow:'',notes:'',...link,id:link.id||uid(),stale:true,confirmed:false};
  const index=f.mainline.links.findIndex(l=>l.id===value.id);if(index<0)f.mainline.links.push(value);else f.mainline.links[index]=value;f.mainline.confirmed=false;break;
 }
 case 'mainline.unlink':find(f.mainline.links,c.id,'连接');f.mainline.links=f.mainline.links.filter(l=>l.id!==c.id);f.mainline.confirmed=false;break;
 case 'mainline.review':{const link=find(f.mainline.links,c.id,'连接');for(const id of [link.fromId,link.toId])if(!groupedRows(f).some(r=>r.event.id===id))fail('NOT_FOUND','连接事件已经删除或移至收集箱。');link.stale=false;link.confirmed=true;f.mainline.confirmed=false;break;}
 case 'mainline.confirm':{
  skeletonGate(f);const chain=groupedRows(f);
  for(let i=1;i<chain.length;i++)if(!f.mainline.links.some(l=>l.fromId===chain[i-1].event.id&&l.toId===chain[i].event.id))fail('UNCONFIRMED',`${chain[i-1].code} → ${chain[i].code} 缺少衔接，请补充并人工复核。`);
  if(f.mainline.links.some(l=>l.stale||!l.confirmed))fail('UNCONFIRMED','请先逐条复核事件连接。');f.mainline.confirmed=true;break;
 }
 case 'character.add':f.characters.push({name:'',description:'',confirmed:false,...c.character,id:c.character?.id||uid()});break;
 case 'character.update':patchNode(find(f.characters,c.id,'人物'),c.patch);break;
 case 'character.remove':snapshotArchive(f,'character',find(f.characters,c.id,'人物'));f.characters=f.characters.filter(v=>v.id!==c.id);break;
 case 'source.add':f.sources.push({name:'',content:'',...c.source,id:c.source?.id||uid()});break;
 case 'source.update':{const source=find(f.sources,c.id,'来源');snapshotArchive(f,'sourceRevision',source,uid());patchNode(source,c.patch);break;}
 case 'source.remove':snapshotArchive(f,'source',find(f.sources,c.id,'来源'));f.sources=f.sources.filter(v=>v.id!==c.id);break;
 case 'source.restore':{const a=find(f.archives.filter(a=>a.kind==='source'),c.id,'来源存档');if(f.sources.some(s=>s.id===a.snapshot.id))fail('INVALID','来源已经存在。');f.sources.push(clone(a.snapshot));break;}
 case 'component.add':{
  if(c.component?.sourceId)find(f.sources,c.component.sourceId,'组件来源');f.components.push({title:'',summary:'',confirmed:false,...c.component,id:c.component?.id||uid()});break;
 }
 case 'component.update':{const v=find(f.components,c.id,'组件');patchNode(v,c.patch);v.confirmed=false;break;}
 case 'component.confirm':find(f.components,c.id,'组件').confirmed=true;break;
 case 'component.remove':snapshotArchive(f,'component',find(f.components,c.id,'组件'));f.components=f.components.filter(v=>v.id!==c.id);break;
 case 'component.insert':{
  settingsGate(f);const component=find(f.components,c.id,'组件');if(!component.confirmed)fail('UNCONFIRMED','请先人工确认参考组件。');
  if(!c.event||!text(c.event.title).trim())fail('INVALID','请先按本剧设定适配组件，并填写本剧事件。');
  addEvent(f,{...c,event:{...c.event,confirmed:false,source:{...c.event.source,sourceId:component.sourceId,sourceEventId:component.sourceEventId,componentId:component.id,rawText:component.rawText}}});break;
 }
 case 'component.insertGroup':{
  settingsGate(f);const component=find(f.components,c.id,'组件');if(!component.confirmed)fail('UNCONFIRMED','请先人工确认参考组件。');
  if(!text(c.group?.title).trim())fail('INVALID','请填写适配后的本剧大事件。');
  const adapted=group({...c.group,id:uid(),confirmed:false,locked:false},uid());
  adapted.source={sourceId:component.sourceId,sourceEventId:component.sourceEventId,componentId:component.id};
  const provenance=e=>{if(!text(e.title).trim()||!text(e.summary).trim())fail('INVALID','请先为每个小事件填写本剧行动与结果。');return {...e,id:uid(),confirmed:false,locked:false,source:{...e.source,sourceId:component.sourceId,sourceEventId:e.source?.sourceEventId||e.id,componentId:component.id,rawText:e.source?.rawText||component.rawText}};};
  adapted.events=adapted.events.map(provenance);adapted.middles=adapted.middles.map(m=>({...m,id:uid(),confirmed:false,locked:false,events:m.events.map(provenance)}));
  if(!adapted.events.length&&!adapted.middles.some(m=>m.events.length))fail('INVALID','大事件组件需要具体小事件。');insert(f.groups,adapted,c.index);break;
 }
 case 'simulation.add':{
  const s=c.simulation;if(!s||!Array.isArray(s.groups))fail('INVALID','模拟候选需要事件组结构。');
  const candidate={...s,groups:s.groups.map((g,i)=>group(g,g.id||uid())),looseEvents:(own(s,'looseEvents')?list(s.looseEvents):f.looseEvents).map(e=>event(e,e.id||uid())),id:s.id||uid(),baseFingerprint:frameworkStructureFingerprint(p),adopted:false};
  assertIds({...f,groups:candidate.groups,looseEvents:candidate.looseEvents});f.simulations.push(candidate);break;
 }
 case 'simulation.remove':find(f.simulations,c.id,'模拟');f.simulations=f.simulations.filter(v=>v.id!==c.id);break;
 case 'simulation.adopt':{
  settingsGate(f);const s=find(f.simulations,c.id,'模拟候选');
  if(s.inputFingerprint&&c.inputFingerprint!==s.inputFingerprint||s.baseFingerprint!==frameworkStructureFingerprint(p))fail('STALE','模拟输入已变化，请保留候选并重新运行。');
  const proposed={...f,groups:clone(s.groups),looseEvents:clone(s.looseEvents)};lockGuard(f,proposed);
  f.groups=proposed.groups;f.looseEvents=proposed.looseEvents;s.adopted=true;s.adoptedAt=now();break;
 }
 case 'plan.add':{
  skeletonGate(f);if(!f.mainline.confirmed)fail('UNCONFIRMED','请先人工确认完整主线，再生成集纲版本。');
  if(!c.plan||!Array.isArray(c.plan.episodes)||!c.plan.episodes.length)fail('INVALID','集纲版本必须包含分集。');
  const pnew=plan({...c.plan,eventSnapshot:clone(f.groups),looseEventSnapshot:clone(f.looseEvents),settingsRevision:f.settings.revision,stale:false},c.plan.id||uid());
  for(const e of pnew.episodes)for(const id of list(e.eventIds))if(!groupedRows(f).some(r=>r.event.id===id))fail('INVALID','分集引用了不存在或尚未归组的事件。');
  f.plans.push(pnew);break;
 }
 case 'plan.update':{
  const v=find(f.plans,c.id,'集纲版本');if(own(c.patch,'id'))fail('INVALID','不可修改版本编号。');
  if(c.patch?.stale===false){skeletonGate(f);if(!f.mainline.confirmed)fail('UNCONFIRMED','请先重新确认完整主线，再复核集纲。');}
  if(own(c.patch,'episodes')){
   if(!Array.isArray(c.patch.episodes)||!c.patch.episodes.length)fail('INVALID','集纲必须保留至少一集。');
   const previous=new Map(v.episodes.map(e=>[e.id,e]));let precedingChanged=false;
   const incoming=c.patch.episodes.map((e,i)=>{
    const old=previous.get(e.id),next=episode({...old,...e},e.id||uid());
    for(const id of list(next.eventIds))if(!groupedRows(f).some(r=>r.event.id===id))fail('INVALID','分集引用了不存在或尚未归组的事件。');
    if(old){next.result=text(old.result);next.finalConfirmed=Boolean(old.finalConfirmed);const outlineChanged=!equal([old.content,old.title,old.eventIds],[next.content,next.title,next.eventIds])||v.episodes[i]?.id!==old.id;
     precedingChanged=precedingChanged||outlineChanged;if(precedingChanged){next.stale=Boolean(text(next.result));next.finalConfirmed=false;}
    }else {precedingChanged=true;next.result='';next.finalConfirmed=false;}
    return next;
   });
   const missing=v.episodes.filter(e=>!incoming.some(n=>n.id===e.id));if(missing.length)snapshotArchive(f,'episodeRevision',{id:v.id,episodes:missing},uid());
   Object.assign(v,clone(c.patch),{episodes:incoming});
  }else Object.assign(v,clone(c.patch||{}));
  if(c.patch?.stale===false){for(const e of v.episodes)for(const id of list(e.eventIds))if(!groupedRows(f).some(r=>r.event.id===id))fail('INVALID','分集包含已删除或移至收集箱的事件，请先修订分集。');v.eventSnapshot=clone(f.groups);v.looseEventSnapshot=clone(f.looseEvents);v.settingsRevision=f.settings.revision;}
  break;
 }
 case 'plan.activate':find(f.plans,c.id,'集纲版本');f.activePlanId=c.id;break;
 case 'plan.delete':{const v=find(f.plans,c.id,'集纲版本');snapshotArchive(f,'plan',v);f.plans=f.plans.filter(v=>v.id!==c.id);if(f.activePlanId===c.id)f.activePlanId=null;break;}
 case 'plan.restore':{const a=[...f.archives].reverse().find(a=>a.kind==='plan'&&a.id===c.id)||fail('NOT_FOUND','找不到可恢复版本。');if(f.plans.some(v=>v.id===a.snapshot.id))fail('INVALID','该版本已经存在。');f.plans.push(clone(a.snapshot));break;}
 case 'episode.update':{
  const v=find(f.plans,c.planId,'集纲版本'),e=find(v.episodes,c.episodeId,'分集');
  if(own(c.patch,'eventIds')){if(!Array.isArray(c.patch.eventIds))fail('INVALID','分集事件引用必须是列表。');for(const id of c.patch.eventIds)if(!groupedRows(f).some(r=>r.event.id===id))fail('INVALID','分集引用了不存在或尚未归组的事件。');}
  if(own(c.patch,'result')||c.patch?.finalConfirmed){settingsGate(f);if(v.stale)fail('STALE','集纲依赖的事件或规则已变化，请先复核集纲。');}
  if(own(c.patch,'id'))fail('INVALID','不可修改分集编号。');
  if(own(c.patch,'result')&&c.patch.result!==e.result){e.finalConfirmed=false;e.stale=false;for(const following of v.episodes.slice(v.episodes.indexOf(e)+1))if(text(following.result)){following.stale=true;following.finalConfirmed=false;}}
  const outlineChanged=['content','title','eventIds','hook','continuity','duration'].some(key=>own(c.patch,key)&&!equal(c.patch[key],e[key]));
  Object.assign(e,clone(c.patch||{}));
  if(outlineChanged){for(const affected of v.episodes.slice(v.episodes.indexOf(e))){affected.stale=Boolean(text(affected.result));affected.finalConfirmed=false;}}
  break;
 }
 case 'version.snapshot':{const id=uid();snapshotArchive(f,'version',{...clone(f),archives:[],snapshotName:text(c.name)},id);break;}
 case 'version.restore':{
  const a=find(f.archives.filter(a=>a.kind==='version'),c.id,'项目版本');snapshotArchive(f,'version',{...clone(f),archives:[],snapshotName:'恢复前自动备份'},uid());
  const archives=f.archives;Object.assign(f,clone(a.snapshot),{archives});break;
 }
 default:fail('INVALID',`未知框架操作：${c.type}`);
 }
 assertIds(f);lockGuard(before,f,lockException);
 // Explicit review/confirmation actions are the only way to clear a stale mark.
 if(!['mainline.confirm','mainline.review','version.restore','node.lock'].includes(c.type))invalidate(before,f);
 const active=f.plans.find(v=>v.id===f.activePlanId);p.episodes=active?clone(active.episodes):[];
 p.updatedAt=now();return p;
}
