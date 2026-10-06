import test from 'node:test';
import assert from 'node:assert/strict';
import {readRewriteOutline,validateRewriteOutline,copyOutlineGroups,moveOutlineGroup,moveOutlineEvent,rewriteOutlineText} from './rewriteOutline.js';
import {createCreatorProject,normalizeCreatorProject,updateCreatorSection,updateCreatorEpisode,appendCreatorRecord,adoptCreatorRecord,creatorInputFingerprint,buildCreatorText} from './creatorWorkspace.js';
import {saveRewriteAnalysis,addRewriteSource,rewriteSources,addRewritePlan,applyRewriteVersion,rewriteState,addRewriteEpisode,removeRewriteEpisode,restoreRewriteEpisode} from './rewriteWorkflow.js';
import {creatorTasksConflict} from './creatorTaskSlots.js';
import {runCreatorTask} from './creatorAi.js';
const outline=()=>({groups:[{id:'a',title:'相遇',goal:'由陌生到认识',events:[{id:'a1',title:'捡包',summary:'发现遗失物',purpose:'引出男主母亲'},{id:'a2',title:'还包',summary:'物归原主',purpose:'建立联系'}]},{id:'b',title:'相爱',goal:'互相信任',events:[{id:'b1',title:'共同解决问题',summary:'两人一起行动',purpose:'感情升温'}]}]});
const initial=()=>createCreatorProject({scriptProjects:[]},{mode:'rewrite'});
test('outline keeps groups and nested events without episode allocation; moving changes only chosen order',()=>{
 const data=validateRewriteOutline(outline()),moved=moveOutlineGroup(data,'b',-1);
 assert.deepEqual(moved.groups.map(g=>g.id),['b','a']);assert.deepEqual(moved.groups[1].events.map(e=>e.id),['a1','a2']);
 const reordered=moveOutlineEvent(data,'a','a2','a',-1);assert.deepEqual(reordered.groups[0].events.map(e=>e.id),['a2','a1']);
 const transferred=moveOutlineEvent(data,'a','a1','b');assert.deepEqual(transferred.groups[0].events.map(e=>e.id),['a2']);assert.equal(transferred.groups[1].events[1].purpose,'引出男主母亲');
 assert.equal(JSON.stringify(readRewriteOutline(JSON.stringify(data))),JSON.stringify(data));
 assert.match(rewriteOutlineText(data),/阶段目标：由陌生到认识/);assert.match(rewriteOutlineText(data),/作用与因果：引出男主母亲/);
 assert.throws(()=>validateRewriteOutline({groups:[{title:'阶段',goal:'目的',events:[]}]}));
 assert.throws(()=>validateRewriteOutline({groups:[...outline().groups,...outline().groups]}),/重复/);
});
test('reference imports get independent identities, and partial macro analysis preserves existing mainline',()=>{
 let s=initial(),id=s.scriptProjects[0].id;s=addRewriteSource(s,id,{name:'书',content:'真实材料'});const book=rewriteSources(s.scriptProjects[0])[0];
 s=saveRewriteAnalysis(s,id,book.id,{settings:'背景',outline:'原有逐集主线',characters:'人物'});
 s=saveRewriteAnalysis(s,id,book.id,{macroOutline:outline(),outline:'不能改旧主线'},'macroOutline');
 assert.equal(rewriteSources(s.scriptProjects[0])[0].analysis.outline,'原有逐集主线');
 const copy=copyOutlineGroups(outline().groups);assert.notEqual(copy[0].id,'a');assert.notEqual(copy[0].events[0].id,'a1');
 assert.equal(copy[0].events[0].purpose,'引出男主母亲');
 assert.equal(creatorTasksConflict({task:'rewriteAnalyze',sourceId:'s'},{task:'rewriteAnalyze',sourceId:'s',analysisStage:'macroOutline'}),true);
 assert.equal(creatorTasksConflict({task:'rewriteAnalyze',sourceId:'s',analysisStage:'macroOutline'},{task:'rewriteAnalyze',sourceId:'s',analysisStage:'outline'}),false);
});
test('adopted outline is readable in later model context, exported plainly, and changing it marks derived work stale',async()=>{
 let s=initial(),id=s.scriptProjects[0].id;s=updateCreatorSection(s,'script',id,'macroOutline',{output:JSON.stringify(outline()),accepted:true});
 for(const key of ['outline','characters','detail'])s=updateCreatorSection(s,'script',id,key,{output:'已定内容',accepted:true});
 let p=s.scriptProjects[0];const calls=[];
 await runCreatorTask({api:{aiChat:async req=>(calls.push(req),'候选')},state:{skills:[]},project:p,target:{section:'outline'},profile:{id:'qa',model:'mock'},taskId:'qa'});
 assert.match(calls[0].messages.at(-1).content,/作用与因果：引出男主母亲/);
 const exported=buildCreatorText(p,'script','output',{includeSections:true});assert.match(exported,/【大纲】/);assert.doesNotMatch(exported,/"groups"/);
 s=updateCreatorSection(s,'script',id,'macroOutline',{output:JSON.stringify(moveOutlineGroup(outline(),'b',-1)),accepted:false});
 for(const key of ['outline','characters','detail'])assert.equal(s.scriptProjects[0].creator.sections[key].stale,true);
 const legacy=normalizeCreatorProject({id:'old',mode:'rewrite',creator:{schemaVersion:1,mode:'rewrite',sections:{outline:{output:'原有主线',accepted:true}}},episodes:[]});
 assert.equal(legacy.creator.sections.outline.output,'原有主线');assert.equal(legacy.creator.sections.macroOutline.output,'');
});
test('macro candidates validate structure at adoption and append preserves both group collections',()=>{
 let s=initial(),id=s.scriptProjects[0].id,target={section:'macroOutline',side:'output'};
 const record={id:'r',type:'ai',target,output:JSON.stringify(outline()),status:'pending',inputFingerprint:creatorInputFingerprint(s.scriptProjects[0],target)};
 s=appendCreatorRecord(s,'script',id,record);s=adoptCreatorRecord(s,'script',id,'r');
 const p=s.scriptProjects[0];assert.equal(p.creator.sections.macroOutline.accepted,true);
 s=appendCreatorRecord(s,'script',id,{...record,id:'r2',inputFingerprint:creatorInputFingerprint(p,target)});s=adoptCreatorRecord(s,'script',id,'r2',{mode:'append'});
 assert.equal(validateRewriteOutline(s.scriptProjects[0].creator.sections.macroOutline.output).groups.length,4);
});
test('manual added/deleted/restored episodes survive active edition switches with body and input intact',()=>{
 let s=initial(),id=s.scriptProjects[0].id;
 const plan={majorEvents:[{id:'e',title:'阶段',startEpisode:1,endEpisode:1}],episodes:[{number:1,title:'第1集',eventIds:['e'],outline:'第一集'}]};
 s=addRewritePlan(s,id,plan);const v1=rewriteState(s.scriptProjects[0]).versions[0].id;s=applyRewriteVersion(s,id,v1);
 s=addRewriteEpisode(s,id);const ep=s.scriptProjects[0].episodes.at(-1);assert.equal(ep.title,'第2集');assert.equal(ep.manualRewrite,true);
 s=updateCreatorEpisode(s,'script',id,ep.id,{content:'自己新增提纲',result:'原创正文'});
 s=addRewritePlan(s,id,plan);const v2=rewriteState(s.scriptProjects[0]).versions.at(-1).id;s=applyRewriteVersion(s,id,v2);s=applyRewriteVersion(s,id,v1);
 assert.equal(s.scriptProjects[0].episodes.at(-1).result,'原创正文');assert.equal(s.scriptProjects[0].episodes.at(-1).content,'自己新增提纲');
 s=removeRewriteEpisode(s,id,ep.id);assert.equal(s.scriptProjects[0].episodes.length,1);assert.equal(rewriteState(s.scriptProjects[0]).versions.find(v=>v.id===v1).snapshot.episodes.length,1);
 const record=s.scriptProjects[0].creator.records.find(r=>r.type==='deleted-node'&&r.node.id===ep.id);s=restoreRewriteEpisode(s,id,record.id);
 assert.equal(s.scriptProjects[0].episodes.at(-1).id,ep.id);assert.equal(s.scriptProjects[0].episodes.at(-1).manualRewrite,true);assert.equal(s.scriptProjects[0].episodes.at(-1).result,'原创正文');
});
test('an unfinished manual outline snapshot can be restored as a draft',()=>{
 let s=initial(),id=s.scriptProjects[0].id,target={section:'macroOutline',side:'output'};
 s=updateCreatorSection(s,'script',id,'macroOutline',{output:JSON.stringify(outline()),accepted:true});
 s=appendCreatorRecord(s,'script',id,{id:'unfinished',type:'history',target,previousAccepted:false,output:'{"groups":[{"id":"draft","title":"未完成阶段","goal":"","events":[]}]}'});
 s=adoptCreatorRecord(s,'script',id,'unfinished');
 assert.equal(readRewriteOutline(s.scriptProjects[0].creator.sections.macroOutline.output).groups[0].title,'未完成阶段');
 assert.equal(s.scriptProjects[0].creator.sections.macroOutline.accepted,false);
});
