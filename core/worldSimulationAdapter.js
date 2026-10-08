import {frameworkState,applyFrameworkCommand} from './frameworkWorkflow.js';
import {normalizeCreatorProject,updateCreatorSection} from './creatorWorkspace.js';
import {rewriteIdentity,isRoleCaption} from './rewriteIdentity.js';
import {readRewriteOutline,validateRewriteOutline} from './rewriteOutline.js';
import {conversionFingerprint,assertCanonicalRewriteProse,groupIdentityReady} from './rewriteConversion.js';
import {getBranch,validateSeed,copy,uid} from '../world-simulation/engine.js';
import {saveCurrentOutlineVersion} from './rewriteWorldVersions.js';
export function sourceFingerprint(p){return JSON.stringify(p.creator?.mode==='framework'?{id:p.id,mode:'framework',ideas:frameworkState(p).ideas.filter(i=>i.included),settings:frameworkState(p).settings,characters:frameworkState(p).characters,groups:frameworkState(p).groups,mainline:frameworkState(p).mainline}:{id:p.id,mode:p.creator?.mode,settings:p.creator?.sections?.settings,outline:p.creator?.sections?.macroOutline,identity:p.creator?.rewrite?.identity});}
// This is author-side planning data, never historical state or actor knowledge.
export function projectWorldPlan(p){const framework=p.creator?.mode==='framework',f=framework?frameworkState(p):null;return framework?{mode:'framework',inspiration:f.ideas.filter(i=>i.included),people:f.characters.filter(c=>c.confirmed),groups:f.groups,mainline:f.mainline}:{mode:'rewrite',identity:rewriteIdentity(p).accepted?{people:rewriteIdentity(p).people,relations:rewriteIdentity(p).relations}:null,groups:readRewriteOutline(p.creator?.sections?.macroOutline?.output).groups};}
export function projectWorldSeed(p){
 const framework=p.creator?.mode==='framework',f=framework?frameworkState(p):null,identity=framework?null:rewriteIdentity(p);
 const people=framework?f.characters.filter(c=>c.confirmed):identity.accepted?identity.people:[];
 const rules=framework&&f.settings.confirmed?f.settings.items.filter(i=>i.confirmed!==false).map(i=>({id:i.id,text:i.text,locked:!!i.locked,public:false})):!framework&&p.creator.sections.settings?.accepted&&!p.creator.sections.settings.stale?[{id:'settings',text:p.creator.sections.settings.output,public:false}]:[];
 return {seed:validateSeed({characters:people.map(c=>({id:c.id,name:c.name||c.label,goal:c.goal||'',resources:{},relations:{},locationId:null,knowledge:[]})),rules,locations:[],facts:[],routes:[]}),warnings:[...(!people.length?['尚无已确认人物，请在世界档案中填写，洗稿写回前需确认新作人物。']:[]),...(!rules.length?['尚无已确认世界规则，请核对起点。']:[])],anchors:framework?f.groups.map(g=>({id:g.id,title:g.title,goal:g.goal,locked:g.locked})):readRewriteOutline(p.creator.sections.macroOutline?.output).groups.map(g=>({id:g.id,title:g.title,goal:g.goal}))};
}
export function worldWorkspace(p){return {worlds:[],activeWorldId:null,...p.creator?.worldSimulation};}
export function putWorld(project,world){const ws=worldWorkspace(project),exists=ws.worlds.some(w=>w.id===world.id);return {...project,updatedAt:new Date().toISOString(),creator:{...project.creator,worldSimulation:{...ws,activeWorldId:ws.activeWorldId||world.id,worlds:exists?ws.worlds.map(w=>w.id===world.id?world:w):[...ws.worlds,world]}}};}
export function applyWorldStory(raw,world,branchId){
 const p=normalizeCreatorProject(raw,'script'),branch=getBranch(world,branchId);if(world.source?.projectId!==p.id||world.source?.fingerprint!==sourceFingerprint(p))throw new Error('新作设定、人物或大纲已变化，请核对世界起点后新建世界');
 if(world.lastExport?.branchId===branchId&&world.lastExport.revision===branch.revision)return raw;
 if(!branch.events.length)throw new Error('当前路线没有已采用事件');if(branch.pending.length)throw new Error('当前路线仍有待重推的后续事件，请完成推演后采用');
 const nodes=branch.events.map(e=>({id:`world-${world.id}-${e.id}`,title:e.title,worldProjectId:world.id,worldBranchId:branchId,worldEventId:e.id,goal:e.summary,events:[{id:`world-step-${world.id}-${e.id}`,title:e.title,summary:e.summary,purpose:e.dependsOn?.length?`依据事件：${e.dependsOn.join('、')}`:'本路线已采用事件',characterIds:e.actorIds||[],participantIds:e.actorIds||[],references:[],sourceActorRefs:[],source:'大世界模拟已采用路线',confirmed:true}],middles:[],participantIds:e.actorIds||[],sourceActorRefs:[],source:'大世界模拟已采用路线'}));
 let next=p;
 if(p.creator.mode==='framework'){
  const f=frameworkState(p);for(const c of world.seed.characters){const current=f.characters.find(v=>v.id===c.id);if(current&&current.name!==c.name)throw new Error('世界人物名与新作已确认人物不一致');if(!current)next=applyFrameworkCommand(next,{type:'character.add',character:{id:c.id,name:c.name,goal:c.goal,description:'作者确认的大世界起点人物',confirmed:true}});}
  const current=frameworkState(next),groups=[...current.groups.filter(g=>g.worldProjectId!==world.id),...nodes];const simulationId=`world-export-${uid()}`;
  next=applyFrameworkCommand(next,{type:'simulation.add',simulation:{id:simulationId,name:`大世界：${branch.name}`,groups,looseEvents:current.looseEvents}});next=applyFrameworkCommand(next,{type:'simulation.adopt',id:simulationId});
 }else if(p.creator.mode==='rewrite'){
  const identity=rewriteIdentity(p);if(!identity.accepted||!identity.people.length)throw new Error('请先确认洗稿区的新作人物与关系');for(const c of world.seed.characters){const found=identity.people.find(v=>v.id===c.id);if(!found||(found.name||found.label)!==c.name)throw new Error('世界人物必须对应已确认新作人物编号和姓名');}
  if(p.creator.sections.macroOutline.locked)throw new Error('新作大纲已锁定');const prose=nodes.map(g=>[g.title,g.goal,...g.events.flatMap(e=>[e.title,e.summary,e.purpose])].join('\n')).join('\n');assertCanonicalRewriteProse(p,prose);
  const allowed=new Set(identity.people.flatMap(v=>[v.name,v.label,...v.aliases||[]]).filter(Boolean));for(const actor of identity.sourceActors)for(const name of [actor.name,...actor.aliases||[]])if(name&&name.length>=2&&!allowed.has(name)&&!isRoleCaption(name)&&prose.includes(name))throw new Error(`新作仍出现来源人物原名「${name}」，请修订世界事件标题和内容`);
  const existing=readRewriteOutline(p.creator.sections.macroOutline.output).groups,groups=[...existing.filter(g=>g.worldProjectId!==world.id),...nodes];
  for(const g of nodes){g.identityState='converted';g.identityRevision=identity.revision;for(const e of g.events){e.identityState='converted';e.identityRevision=identity.revision;e.identityFingerprint=conversionFingerprint(p,g,e);}g.identityFingerprint=conversionFingerprint(p,g);}
  const output=JSON.stringify(validateRewriteOutline({groups})),state=updateCreatorSection({scriptProjects:[p]},'script',p.id,'macroOutline',{output,accepted:groups.every(g=>groupIdentityReady(p,g))});next=state.scriptProjects[0];
  const versionId=`world-export-${uid()}`;next=saveCurrentOutlineVersion({scriptProjects:[next]},next.id,{versionId}).scriptProjects[0];
  next={...next,creator:{...next.creator,rewrite:{...next.creator.rewrite,activeOutlineVersionId:versionId,outlineVersions:next.creator.rewrite.outlineVersions.map(v=>v.id===versionId?{...v,name:`大世界：${branch.name}`,adoptedAt:new Date().toISOString(),changeSummary:'采用独立世界路线，旧正文保留'}:v)}}};
 }else throw new Error('此创作模式尚未接入大世界');
 const saved=copy(world);saved.source.fingerprint=sourceFingerprint(next);saved.lastExport={branchId,revision:branch.revision};return putWorld(next,saved);
}
