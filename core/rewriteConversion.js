import {readRewriteOutline} from './rewriteOutline.js';
import {isRoleCaption,actorKey,identityBooks,rewriteIdentity,readIdentityObject} from './rewriteIdentity.js';
import {resolveStoryReferences} from './rewriteReferences.js';

const clone=v=>JSON.parse(JSON.stringify(v));
const text=v=>typeof v==='string'?v:'';
const list=v=>Array.isArray(v)?v:[];
const fail=message=>{throw new Error(message);};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const hash=v=>{const raw=JSON.stringify(canonical(v));let h=2166136261;for(let i=0;i<raw.length;i++)h=Math.imul(h^raw.charCodeAt(i),16777619);return `identity-v1:${raw.length}:${(h>>>0).toString(16)}`;};
const nodeText=(node,group=false)=>group?{title:node.title,goal:node.goal}:{title:node.title,summary:node.summary,purpose:node.purpose};
const refsFor=(p,e)=>resolveStoryReferences(p,e).references;
const sameOccurrence=(a,r)=>list(a.appearances).some(v=>v.groupId===r.groupId&&v.eventId===r.eventId)&&a.sourceId===r.sourceId;
const actorsFor=(identity,refs)=>identity.sourceActors.filter(a=>refs.some(r=>sameOccurrence(a,r)));

const sourceDigests=new Map();
const sourceDigest=content=>{if(sourceDigests.has(content))return sourceDigests.get(content);const digest=hash(content);sourceDigests.set(content,digest);if(sourceDigests.size>6)sourceDigests.delete(sourceDigests.keys().next().value);return digest;};
export function conversionFingerprint(p,g,event=null){
 const identity=p.creator.rewrite?.identity||rewriteIdentity(p),nodes=event?[event]:[g,...g.events],sourceRefs=event?refsFor(p,event):g.events.flatMap(e=>refsFor(p,e));
 const actorRefs=nodes.flatMap(n=>list(n.sourceActorRefs));
 const bindings=identity.bindings.filter(b=>actorRefs.some(r=>r.sourceId===b.sourceId&&r.actorId===b.actorId));
 const participantIds=new Set([...nodes.flatMap(n=>list(n.participantIds)),...bindings.map(b=>b.personId)]);
 const relations=identity.relations.filter(r=>participantIds.has(r.fromId)||participantIds.has(r.toId));
 for(const r of relations){participantIds.add(r.fromId);participantIds.add(r.toId);}
 return hash({settings:p.creator.sections.settings?.accepted?p.creator.sections.settings.output:'',groupId:g.id,eventId:event?.id||null,groupText:nodeText(g,true),text:event?nodeText(event):g.events.map(e=>({id:e.id,...nodeText(e)})),participants:nodes.map(n=>list(n.participantIds)),actorRefs,people:identity.people.filter(v=>participantIds.has(v.id)),relations,bindings,actors:identity.sourceActors.filter(a=>actorRefs.some(r=>actorKey(r.sourceId,r.actorId)===actorKey(a.sourceId,a.id))),references:sourceRefs,sources:identityBooks(p).filter(b=>sourceRefs.some(r=>r.sourceId===b.id)).map(b=>({id:b.id,contentDigest:sourceDigest(b.content),outline:b.analysis?.macroOutline}))});
}
export function groupIdentityReady(p,g){
 return g.identityState==='converted'&&g.identityFingerprint===conversionFingerprint(p,g)&&g.events.every(e=>e.identityState==='converted'&&e.identityFingerprint===conversionFingerprint(p,g,e));
}
export function conversionScope(p,target={}){
 const outline=readRewriteOutline(p.creator.sections.macroOutline?.output),groupIds=target.groupIds,eventIds=target.eventIds;
 if(groupIds&&(!Array.isArray(groupIds)||!groupIds.length||new Set(groupIds).size!==groupIds.length||groupIds.some(id=>!outline.groups.some(g=>g.id===id))))fail('要转换的大事件范围已变化。');
 if(eventIds&&(!Array.isArray(eventIds)||!eventIds.length||new Set(eventIds).size!==eventIds.length||eventIds.some(id=>!outline.groups.some(g=>g.events.some(e=>e.id===id)))))fail('要转换的小事件范围已变化。');
 const selected=outline.groups.filter(g=>(!groupIds||groupIds.includes(g.id))&&(!eventIds||g.events.some(e=>eventIds.includes(e.id)))&&(!target.onlyPending||!groupIdentityReady(p,g))).map(g=>({...g,events:g.events.filter(e=>!eventIds||eventIds.includes(e.id))}));
 return {outline,groups:selected};
}
export function conversionTaskInput(p,target={}, {strict=false}={}){
 const identity=rewriteIdentity(p),scope=conversionScope(p,target),books=identityBooks(p);
 if(strict){
  if(p.creator.sections.macroOutline?.locked)fail('新作大纲已锁定，请先解锁再转换人物。');
  if(!identity.accepted||!identity.people.length||p.creator.sections.characters?.stale&&!p.creator.sections.characters?.locked)fail('请先在人物与关系确认新作人物及对应，再转换事件。');
  if(!scope.groups.length)fail('没有待转换的事件，请先引用事件或选择需要重新转换的组。');
  if(scope.groups.some(g=>g.locked||g.events.some(e=>e.locked)))fail('选中事件已锁定，请先解锁；不能覆盖固定内容。');
 }
 const selectedReferences=[];
 for(const g of scope.groups)for(const e of g.events){
  const resolved=resolveStoryReferences(p,e);if(strict&&resolved.unresolved)fail(`「${e.title}」来源对应未能确认，请先选择具体参考事件。`);
  for(const r of resolved.references){const book=books.find(b=>b.id===r.sourceId);if(strict&&!book)fail('引用的来源已移除，请先核对。');
   const source=book?readRewriteOutline(book.analysis?.macroOutline).groups.find(v=>v.id===r.groupId):null,ev=source?.events.find(v=>v.id===r.eventId);
   if(strict&&!ev)fail('来源事件已移除或重新拆解，请先重新选择参考。');
   selectedReferences.push({...r,bookName:book?.name||'',group:source,event:ev,referenceOnly:true});
  }
  const refs=resolved.references,required=identity.sourceActors.filter(a=>refs.some(r=>a.sourceId===r.sourceId&&(sameOccurrence(a,r)||['femaleLead','maleLead','lead'].includes(a.role))));
  if(strict&&refs.some(r=>!identity.sourceActors.some(a=>a.sourceId===r.sourceId)))fail('来源角色尚未整理，请先在人物与关系整理对应。');
  if(strict&&required.some(a=>!identity.bindings.some(b=>b.sourceId===a.sourceId&&b.actorId===a.id&&b.personId&&b.status==='confirmed')))fail('所选事件的主角或关系人物对应尚未确认，请先处理对应冲突。');
 }
 const {history,...cast}=identity;
 return {projectId:p.id,target,identity:cast,adoptedSettings:p.creator.sections.settings?.accepted?p.creator.sections.settings.output:'',fullOutline:scope.outline,selectedGroups:scope.groups,selectedReferences,currentStories:p.creator.sections.outline?.output||''};
}

export function validateIdentityConversion(p,target,raw){
 const input=conversionTaskInput(p,target,{strict:true}),data=readIdentityObject(raw),identity=rewriteIdentity(p),seen=new Set();
 if(!Array.isArray(data.groups)||data.groups.length!==input.selectedGroups.length)fail('转换结果遗漏或添加了当前范围之外的大事件。');
 const validateNode=(n,refs,group=false)=>{
  const fields=group?['title','goal']:['title','summary','purpose'];
  for(const key of fields)if(!text(n?.[key]).trim())fail('转换后的事件名称、内容与作用不能为空。');
  if(!Array.isArray(n.participantIds)||new Set(n.participantIds).size!==n.participantIds.length||n.participantIds.some(id=>!identity.people.some(v=>v.id===id)))fail('转换事件引用了不存在或重复的新作人物。');
  if(!Array.isArray(n.sourceActorRefs))fail('转换事件需要来源角色对应，可无来源时返回空列表。');
  const used=new Set();for(const r of n.sourceActorRefs){const key=actorKey(r.sourceId,r.actorId);if(used.has(key))fail('来源角色对应重复。');used.add(key);
   const actor=identity.sourceActors.find(a=>actorKey(a.sourceId,a.id)===key),binding=identity.bindings.find(b=>actorKey(b.sourceId,b.actorId)===key);
   if(!actor||!refs.some(v=>v.sourceId===r.sourceId))fail('转换引用了无关书籍或不存在的来源角色。');
   if(!binding?.personId||binding.status!=='confirmed'||!n.participantIds.includes(binding.personId))fail('来源角色必须使用已确认的新作人物对应，不能以原名猜测。');
  }
  for(const a of actorsFor(identity,refs))if(!used.has(actorKey(a.sourceId,a.id)))fail('转换遗漏了所选事件中已知的来源角色，请逐一对应。');
  const prose=fields.map(k=>n[k]).join('\n'),allowed=new Set(identity.people.flatMap(v=>[v.name,v.label,...list(v.aliases)]).filter(Boolean));
  const generic=new Set(['男主','女主','主角','母亲','父亲','妈妈','爸爸','司机','医生','老板','同事','路人']);
  for(const a of identity.sourceActors.filter(a=>refs.some(r=>r.sourceId===a.sourceId)))for(const name of [a.name,...list(a.aliases)]){
   if(name.length<2||allowed.has(name)||isRoleCaption(name)||generic.has(name))continue;
   const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const found=/^[A-Za-z ]+$/.test(name)?new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`).test(prose):prose.includes(name);
   if(found)fail(`新作事件仍出现来源人物原名「${name}」，请按确认对应转换；来源出处文字不受此限制。`);
  }
  return {...Object.fromEntries(fields.map(k=>[k,n[k]])),participantIds:[...n.participantIds],sourceActorRefs:n.sourceActorRefs.map(r=>({sourceId:r.sourceId,actorId:r.actorId}))};
 };
 const groups=data.groups.map(c=>{
  const g=input.selectedGroups.find(g=>g.id===c?.groupId);if(!g||seen.has(g.id))fail('大事件转换范围错误或重复。');seen.add(g.id);
  if(!Array.isArray(c.events)||!equal(c.events.map(e=>e.eventId),g.events.map(e=>e.id)))fail('转换必须按原顺序覆盖指定小事件，不能遗漏、重排或跨组。');
  const refs=g.events.flatMap(e=>refsFor(p,e));const patch=validateNode(c,refs,true);
  return {groupId:g.id,...patch,events:c.events.map((n,i)=>({eventId:g.events[i].id,...validateNode(n,refsFor(p,g.events[i]))}))};
 });
 return {reasoning:text(data.reasoning),groups:input.selectedGroups.map(g=>groups.find(c=>c.groupId===g.id))};
}
export function applyIdentityConversion(project,target,raw){
 const result=validateIdentityConversion(project,target,raw),p=clone(project),scope=conversionScope(p,target),identity=rewriteIdentity(p),previous=p.creator.sections.macroOutline.output;
 const groups=scope.outline.groups.map(g=>{
  const c=result.groups.find(c=>c.groupId===g.id);if(!c)return g;
  return {...g,title:c.title,goal:c.goal,participantIds:c.participantIds,sourceActorRefs:c.sourceActorRefs,identityState:'converted',identityRevision:identity.revision,events:g.events.map(e=>{const patch=c.events.find(v=>v.eventId===e.id);if(!patch)return e;const {eventId,...values}=patch;return {...e,...values,references:refsFor(p,e),identityState:'converted',identityRevision:identity.revision};})};
 });
 for(const g of groups){const c=result.groups.find(c=>c.groupId===g.id);if(!c)continue;for(const e of g.events)if(c.events.some(v=>v.eventId===e.id))e.identityFingerprint=conversionFingerprint(p,g,e);g.identityFingerprint=conversionFingerprint(p,g);}
 p.creator.rewrite={...p.creator.rewrite,identityConversions:[...list(p.creator.rewrite?.identityConversions),{id:`conversion-${Date.now()}-${Math.random().toString(36).slice(2)}`,createdAt:new Date().toISOString(),beforeOutline:previous,afterOutline:JSON.stringify({groups}),identityRevision:identity.revision,reasoning:result.reasoning}]};
 p.creator.sections={...p.creator.sections,macroOutline:{...p.creator.sections.macroOutline,output:JSON.stringify({groups}),accepted:false,stale:false}};
 for(const key of ['outline','detail'])if(p.creator.sections[key]?.output)p.creator.sections[key]={...p.creator.sections[key],stale:true};
 p.episodes=list(p.episodes).map(e=>({...e,...(e.result?{stale:true}:{})}));
 return p;
}
export function assertRewriteIdentityReady(p,eventIds){
 const outline=readRewriteOutline(p.creator.sections.macroOutline?.output),groups=outline.groups.filter(g=>!eventIds||g.events.some(e=>eventIds.includes(e.id))),identity=rewriteIdentity(p);
 const referenced=groups.some(g=>g.events.some(e=>refsFor(p,e).length)||g.identityState);
 if(!referenced&&!p.creator.rewrite?.identity)return;
 if(!identity.accepted||!identity.people.length||p.creator.sections.characters?.stale&&!p.creator.sections.characters?.locked)fail('请先在人物与关系确认新作人物及关系对应。');
 for(const g of groups){if(g.events.some(e=>refsFor(p,e).length)||g.identityState){const events=g.events.filter(e=>!eventIds||eventIds.includes(e.id));if(g.identityState!=='converted'||g.identityFingerprint!==conversionFingerprint(p,g)||events.some(e=>e.identityState!=='converted'||e.identityFingerprint!==conversionFingerprint(p,g,e)))fail(`「${g.title}」的人物转换尚未完成或依据已变化，请先转换/复核相关事件。`);}}
}
export function assertCanonicalRewriteProse(p,prose,eventIds){
 const identity=rewriteIdentity(p);if(!p.creator.rewrite?.identity)return;
 const outline=readRewriteOutline(p.creator.sections.macroOutline?.output),refs=outline.groups.flatMap(g=>g.events.filter(e=>!eventIds||eventIds.includes(e.id)).flatMap(e=>refsFor(p,e))),allowed=new Set(identity.people.flatMap(v=>[v.name,v.label,...list(v.aliases)]).filter(Boolean));
 for(const actor of identity.sourceActors.filter(a=>refs.some(r=>r.sourceId===a.sourceId)))for(const name of [actor.name,...list(actor.aliases)]){
  if(name.length<2||allowed.has(name)||isRoleCaption(name)||['男主','女主','主角','母亲','父亲','妈妈','爸爸','司机','医生','老板','同事','路人'].includes(name))continue;
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),found=/^[A-Za-z ]+$/.test(name)?new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`).test(prose):prose.includes(name);
  if(found)fail(`新作故事仍出现来源人物原名「${name}」，请按确认的新作关系修改候选。`);
 }
 for(const old of identity.history.flatMap(h=>list(h.snapshot?.people))){const current=identity.people.find(v=>v.id===old.id),name=old.name;if(!current||!name||name.length<2||allowed.has(name)||isRoleCaption(name))continue;if(prose.includes(name))fail(`故事仍使用新作人物的旧名字「${name}」，请复核后使用当前姓名或确认别称。`);}
}
export function prepareRewriteConversionProject(p,target){const input=conversionTaskInput(p,target,{strict:true});return {...p,episodes:[],creator:{...p.creator,source:null,references:[],chat:[],story:{events:[],characters:[]},sections:{macroOutline:{input:JSON.stringify(input),output:'',accepted:false}}}};}
export const REWRITE_CONVERSION_RULE='按已确认新作人物身份和关系转换所选大事件、小事件。若 target.revisionCandidate 存在，只是待修订候选，沿用 revisionInstructions 中未被本次明确改变的要求，当前要求优先。不得把未采用候选当事实。不做全文字符串替换，不借原名猜身份。identity 是唯一新作人物库；selectedReferences 是参考证据。把行动、心理、对白称谓和关系适配为同一新作主角及其关系人物；姓名未知用已确认label，不造人名。只有绑定status=confirmed可以使用；无法对应时报告问题而不硬改。保留原阶段目标、事件作用、结果、顺序和ID；不增删事件、不改变来源引用、不擅自补结局。sourceActorRefs 要覆盖参考事件明确出现的来源角色，participantIds 必须为对应的新作人物ID，多个来源同一角色可共用同一新作ID。不要在新作title/goal/summary/purpose里保留原书人名；来源证据保留在原有出处。只返回指定范围 JSON：{"reasoning":"人物转换说明及因果问题","groups":[{"groupId":"原大事件ID","title":"新作标题","goal":"新作完整阶段目标","participantIds":["新作人物ID"],"sourceActorRefs":[{"sourceId":"来源ID","actorId":"来源角色ID"}],"events":[{"eventId":"原小事件ID","title":"新作小事件标题","summary":"适配后的具体事件","purpose":"保持的作用与因果","participantIds":["新作人物ID"],"sourceActorRefs":[{"sourceId":"来源ID","actorId":"来源角色ID"}]}]}]}。每个人物关系以已确认新作关系为准；候选先审阅，不自称已采用。';
