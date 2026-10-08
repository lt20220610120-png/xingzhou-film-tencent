import {changeRewriteIdentity} from './rewriteIdentity.js';
import {applyIdentityConversion} from './rewriteConversion.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,normalizeState} from './projectStore.js';
import {createCreatorProject,updateCreatorSection,updateCreatorProject,appendCreatorRecord,adoptCreatorRecord,creatorInputFingerprint,buildCreatorText} from './creatorWorkspace.js';
import {addRewriteSource,saveRewriteAnalysis,prepareRewriteTask,addRewritePlan,applyRewriteVersion} from './rewriteWorkflow.js';
import {copyOutlineGroups,readRewriteOutline,moveOutlineGroup} from './rewriteOutline.js';
import {readRewriteMainline} from './rewriteMainline.js';
import {rewriteStoryInput,resolveStoryReferences,validateRewriteStory,mergeRewriteStory} from './rewriteStory.js';
import {runCreatorTask} from './creatorAi.js';
import * as storyHelpers from './rewriteStory.js';

const macro={groups:[{id:'g1',title:'相遇',goal:'建立认识',events:[{id:'e1',title:'捡包',summary:'路边拾包',purpose:'找到失主'},{id:'e2',title:'归还',summary:'核实后归还',purpose:'为答谢留因'}]},{id:'g2',title:'相爱',goal:'共同选择',events:[{id:'e3',title:'答谢',summary:'表达谢意',purpose:'推进认识'}]}]};
const confirmFixtureIdentity=p=>{
 const books=[p.creator.source,...p.creator.references];
 if(!p.creator.rewrite?.identity){p=changeRewriteIdentity(p,{type:'candidate',value:{people:[{id:'hero',label:'女主',role:'femaleLead',notes:'女主谨慎，先核对失主身份'}],relations:[],sourceActors:books.map(b=>({sourceId:b.id,id:'lead',name:'女主',role:'femaleLead',evidence:'原剧本正文',appearances:macro.groups.flatMap(g=>g.events.map(e=>({groupId:g.id,eventId:e.id})))})),bindings:books.map(b=>({sourceId:b.id,actorId:'lead',personId:'hero'}))}});p=changeRewriteIdentity(p,{type:'confirm'});}
 const own=readRewriteOutline(p.creator.sections.macroOutline.output),refs=e=>(p.creator.rewrite?.eventReferences?.[e.id]??e.references??[]).map(r=>({sourceId:r.sourceId,actorId:'lead'}));
 const unique=rows=>rows.filter((r,i)=>rows.findIndex(x=>x.sourceId===r.sourceId)===i);
 const converted=applyIdentityConversion(p,{}, {groups:own.groups.map(g=>({groupId:g.id,title:g.title,goal:g.goal,participantIds:['hero'],sourceActorRefs:unique(g.events.flatMap(refs)),events:g.events.map(e=>({eventId:e.id,title:e.title,summary:e.summary,purpose:e.purpose,participantIds:['hero'],sourceActorRefs:unique(refs(e))}))}))});
 converted.creator.sections.macroOutline.accepted=true;
 return converted;
};
const setup=()=>{let s=createCreatorProject(createInitialState(),{mode:'rewrite',name:'不分集故事'});const id=s.scriptProjects[0].id;
 for(const name of ['选中素材','未选书秘密']){s=addRewriteSource(s,id,{name,content:'第1集\n原剧本正文不应整本进入故事推演'});const b=[s.scriptProjects[0].creator.source,...s.scriptProjects[0].creator.references].at(-1);s=saveRewriteAnalysis(s,id,b.id,{macroOutline:macro},'macroOutline');}
 const own={groups:copyOutlineGroups(macro.groups,s.scriptProjects[0].creator.source.id)};
 for(const [key,output] of Object.entries({settings:'已确认未来城市，无魔法',macroOutline:JSON.stringify(own),characters:'女主谨慎，先核对失主身份'}))s=updateCreatorSection(s,'script',id,key,{output,accepted:key!=='macroOutline',stale:false});
 s.scriptProjects[0]=confirmFixtureIdentity(s.scriptProjects[0]);own.groups=readRewriteOutline(s.scriptProjects[0].creator.sections.macroOutline.output).groups;
 return {s,id,own,p:s.scriptProjects[0],target:{section:'outline',side:'output',task:'rewriteStory',format:'rewriteStory',eventIds:[own.groups[0].events[0].id]}};
};
const result=(own,index=0,story='女主先在原地等候，发现无人返回，转而寻找失主的联系方式。')=>({format:'story-v1',eventGroups:[{id:'story-'+index,eventId:own.groups[0].events[index].id,groupId:own.groups[0].id,title:'捡包',story,continuity:'为下一事件核对身份提供线索。'}]});
test('reference identities survive copied outline, reorder and reload; same A1 in another book is not selected',()=>{
 const {p,own}=setup();const first=own.groups[0].events[0];assert.equal(first.references[0].eventId,'e1');
 assert.equal(readRewriteOutline(JSON.stringify(moveOutlineGroup(own,own.groups[0].id,1))).groups[1].events[0].references[0].sourceId,p.creator.source.id);
 assert.equal(resolveStoryReferences(p,first).references.length,1);const legacy={...first,source:'无法确定的旧来源'};delete legacy.references;
 assert.equal(resolveStoryReferences(p,legacy).unresolved,true);assert.deepEqual(resolveStoryReferences(p,legacy).references,[]);
});
test('story input includes full new chain and confirmed constraints but only explicitly selected source events',()=>{
 const {p,target}=setup();const input=rewriteStoryInput(p,target,{strict:true}),serialized=JSON.stringify(input);
 assert.match(serialized,/已确认未来城市/);assert.match(serialized,/女主谨慎/);assert.equal(input.chain.length,2);assert.equal(input.selectedReferences.length,3);
 assert.ok(!serialized.includes('未选书秘密'));assert.ok(!serialized.includes('原剧本正文不应整本'));
 const prepared=prepareRewriteTask(p,target);assert.equal(prepared.creator.source,null);assert.deepEqual(prepared.episodes,[]);assert.match(prepared.creator.sections.outline.input,/eventIds/);
});
test('explicit no-reference overrides old prose; multi-book reference selections are precise',()=>{
 const {p,target,own}=setup(),event=own.groups[0].events[0],second=p.creator.references[0];
 p.creator.rewrite={...p.creator.rewrite,eventReferences:{[event.id]:[]}};assert.deepEqual(resolveStoryReferences(p,event),{references:[],unresolved:false});
 p.creator.rewrite.eventReferences[event.id]=[...event.references,{sourceId:second.id,groupId:'g2',eventId:'e3'}];
 assert.equal(resolveStoryReferences(p,event).references.length,2);assert.equal(rewriteStoryInput(p,target).selectedReferences.length,4);
 p.creator.rewrite.eventReferences[event.id]=[{sourceId:'removed',groupId:'g1',eventId:'e1'}];assert.throws(()=>rewriteStoryInput(p,target,{strict:true}),/核对参考/);
});
test('story validation rejects episodes, wrong target IDs, empty text and incomplete responses',()=>{
 const {own,target}=setup();assert.equal(validateRewriteStory(result(own),own,target.eventIds).eventGroups[0].episodes.length,0);
 for(const bad of [{eventGroups:[]},{eventGroups:[{...result(own).eventGroups[0],episodes:[{number:1,outline:'不应分集'}]}]},{eventGroups:[{...result(own).eventGroups[0],story:''}]},result(own,1)])assert.throws(()=>validateRewriteStory(bad,own,target.eventIds));
});
test('draft adoption merges just the targeted event, preserves old material and confirmed characters; manual changes invalidate in-flight output',()=>{
 let {s,id,own,target}=setup();s=updateCreatorSection(s,'script',id,'outline',{output:'旧版主线原稿',accepted:false});
 const record={id:'first',type:'ai',target,output:JSON.stringify(result(own)),inputFingerprint:creatorInputFingerprint(s.scriptProjects[0],target)};
 s=appendCreatorRecord(s,'script',id,record);s=adoptCreatorRecord(s,'script',id,'first');let p=s.scriptProjects[0];
 assert.equal(p.creator.sections.outline.accepted,false);assert.equal(p.creator.sections.characters.stale,false);assert.equal(readRewriteMainline(p.creator.sections.outline.output).legacyText,'旧版主线原稿');
 const secondTarget={...target,eventIds:[own.groups[0].events[1].id]},second={id:'second',target:secondTarget,type:'ai',output:JSON.stringify(result(own,1)),inputFingerprint:creatorInputFingerprint(p,secondTarget)};
 s=appendCreatorRecord(s,'script',id,second);s=adoptCreatorRecord(s,'script',id,'second');p=s.scriptProjects[0];assert.equal(readRewriteMainline(p.creator.sections.outline.output).eventGroups.length,2);
 s=appendCreatorRecord(s,'script',id,{...record,id:'third',inputFingerprint:creatorInputFingerprint(p,target)});
 const edited=JSON.parse(p.creator.sections.outline.output);edited.eventGroups[1].story='人工确认的具体归还过程';s=updateCreatorSection(s,'script',id,'outline',{output:JSON.stringify(edited),accepted:false});
 assert.throws(()=>adoptCreatorRecord(s,'script',id,'third'),/旧版输入/);assert.match(s.scriptProjects[0].creator.sections.outline.output,/人工确认/);
 s=normalizeState(JSON.parse(JSON.stringify(s)));assert.match(buildCreatorText(s.scriptProjects[0],'script','output',{includeSections:true}),/人工确认/);
});
test('legacy episode material stays archived while the new story is unsegmented',()=>{
 const {own,target}=setup(),prior={eventGroups:[{...result(own).eventGroups[0],story:undefined,episodes:[{number:1,title:'第1集',outline:'旧集纲'}]}]};
 const merged=readRewriteMainline(mergeRewriteStory(JSON.stringify(prior),result(own),own,target.eventIds));assert.equal(merged.eventGroups[0].episodes.length,0);assert.equal(merged.eventGroups[0].legacyEpisodes[0].outline,'旧集纲');
});
test('unconfirmed macro or a locked story cannot be overwritten by generation results',()=>{
 let {s,id,p,target,own}=setup();p.creator.sections.macroOutline.accepted=false;assert.throws(()=>rewriteStoryInput(p,target,{strict:true}),/确认采用/);
 s=updateCreatorSection(s,'script',id,'macroOutline',{accepted:true});s=updateCreatorSection(s,'script',id,'outline',{output:JSON.stringify(result(own)),accepted:true,locked:true});
 s=appendCreatorRecord(s,'script',id,{id:'locked',type:'ai',target,output:JSON.stringify(result(own)),inputFingerprint:creatorInputFingerprint(s.scriptProjects[0],target)});assert.throws(()=>adoptCreatorRecord(s,'script',id,'locked'),/锁定/);
});
test('actual model request obeys story granularity, target IDs, selected references and complete new causal chain',async()=>{
 const {s,p,target,own}=setup();let request;
 await runCreatorTask({api:{aiChat:async r=>{request=r;return JSON.stringify(result(own));}},state:s,project:p,target,profile:{id:'mock',model:'mock',endpoint:'https://mock.invalid'},taskId:'mock-story'});
 const text=request.messages.map(m=>m.content).join('\n');assert.match(text,/不分集/);assert.match(text,/完整故事稿/);assert.match(text,/共同选择/);assert.ok(text.includes(target.eventIds[0]));assert.match(text,/女主谨慎/);assert.ok(!text.includes('未选书秘密'));assert.ok(!text.includes('原剧本正文不应整本'));
});

test('editing outline references replaces a mainline override while ordinary outline edits retain it',()=>{
 let {s,id,own}=setup();const e=own.groups[0].events[0];
 s=updateCreatorProject(s,'script',id,{rewrite:{eventReferences:{[e.id]:[]}}});
 own.groups[0].title='改了标题';s=updateCreatorSection(s,'script',id,'macroOutline',{output:JSON.stringify(own)});
 assert.deepEqual(resolveStoryReferences(s.scriptProjects[0],e).references,[]);
 e.references=[{sourceId:s.scriptProjects[0].creator.references[0].id,groupId:'g2',eventId:'e3'}];
 s=updateCreatorSection(s,'script',id,'macroOutline',{output:JSON.stringify(own)});
 assert.equal(resolveStoryReferences(s.scriptProjects[0],e).references[0]?.eventId,'e3');
});

test('deleted outline events remain archived without blocking confirmation or entering current story context',()=>{
 const {p,own,target}=setup();const raw={format:'story-v1',eventGroups:[...result(own).eventGroups,...result(own,1,'删去事件的旧稿').eventGroups]};
 own.groups[0].events.splice(1,1);own.groups.splice(1,1);
 assert.equal(typeof storyHelpers.alignRewriteStory,'function');
 const aligned=storyHelpers.alignRewriteStory(raw,own);assert.equal(aligned.eventGroups.length,1);assert.equal(aligned.archivedEventGroups[0].story,'删去事件的旧稿');
 assert.doesNotThrow(()=>validateRewriteStory(aligned,own,target.eventIds));
 p.creator.sections.macroOutline.output=JSON.stringify(own);p.creator.sections.outline.output=JSON.stringify(aligned);
 assert.ok(!JSON.stringify(rewriteStoryInput(p,target)).includes('删去事件的旧稿'));
 const merged=readRewriteMainline(mergeRewriteStory(JSON.stringify(aligned),result(own),own,target.eventIds));
 assert.equal(merged.archivedEventGroups[0].story,'删去事件的旧稿');
});

test('long story requests preserve exact complete constraints and event identities instead of summary-only context',async()=>{
 const {s,p,target,own}=setup();const required='精确约束：门禁号码 627314，只能在主人确认后归还。';
 p.creator.sections.settings.output=required.repeat(1000);Object.assign(p,confirmFixtureIdentity(p));let request;
 const response=await runCreatorTask({api:{aiChat:async r=>{request=r;return r.taskId.includes(':read-')?'摘要省略了门禁号码':JSON.stringify(result(own));}},state:s,project:p,target,profile:{id:'mock',model:'mock',endpoint:'https://mock.invalid'},taskId:'long-story'});
 const prompt=request.messages.map(m=>m.content).join('\n');assert.ok(prompt.includes(required));assert.ok(prompt.includes(target.eventIds[0]));assert.equal(response.meta.readSegments,0);
});

test('downstream episode planning reads active story only, excluding removed events and incompatible archived material',async()=>{
 const {s,p,own}=setup();const raw={format:'story-v1',legacyText:'旧稿冲突：女主会魔法',archivedEventGroups:[{id:'removed',eventId:'deleted',story:'已删除剧情：男主去火星'}],eventGroups:[{...result(own).eventGroups[0],legacyEpisodes:[{number:1,outline:'旧集纲：召唤龙'}]}]};
 p.creator.sections.outline={...p.creator.sections.outline,output:JSON.stringify(raw),accepted:true,stale:false};let request;
 await runCreatorTask({api:{aiChat:async r=>{request=r;return '细纲候选';}},state:s,project:p,target:{section:'detail',task:'rewritePlan'},profile:{id:'mock',model:'mock',endpoint:'https://mock.invalid'},taskId:'detail'});
 const prompt=request.messages.map(m=>m.content).join('\n');assert.match(prompt,/女主先在原地等候/);
 for(const old of ['女主会魔法','男主去火星','召唤龙'])assert.ok(!prompt.includes(old),old);
 assert.match(p.creator.sections.outline.output,/男主去火星/);
});

test('restoring a detail version restores its story source selections rather than the other version references',()=>{
 let {s,id,own}=setup();const eid=own.groups[0].events[0].id;
 const plan={majorEvents:[{id:'a',title:'相遇',startEpisode:1,endEpisode:1}],episodes:[{number:1,outline:'归还后认识',eventIds:['a']}]};
 s=updateCreatorProject(s,'script',id,{rewrite:{eventReferences:{[eid]:[]}}});
 s.scriptProjects[0]=confirmFixtureIdentity(s.scriptProjects[0]);s=addRewritePlan(s,id,plan);const a=s.scriptProjects[0].creator.rewrite.versions[0].id;
 s=updateCreatorProject(s,'script',id,{rewrite:{...s.scriptProjects[0].creator.rewrite,eventReferences:{[eid]:[{sourceId:s.scriptProjects[0].creator.references[0].id,groupId:'g2',eventId:'e3'}]}}});
 s.scriptProjects[0]=confirmFixtureIdentity(s.scriptProjects[0]);s=addRewritePlan(s,id,plan);const b=s.scriptProjects[0].creator.rewrite.versions[1].id;
 s=applyRewriteVersion(s,id,b);assert.equal(resolveStoryReferences(s.scriptProjects[0],own.groups[0].events[0]).references.length,1);
 s=applyRewriteVersion(s,id,a);assert.deepEqual(resolveStoryReferences(s.scriptProjects[0],own.groups[0].events[0]).references,[]);
 s=applyRewriteVersion(s,id,b);assert.equal(resolveStoryReferences(s.scriptProjects[0],own.groups[0].events[0]).references[0].eventId,'e3');
});
