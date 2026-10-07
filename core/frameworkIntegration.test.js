import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCreatorProject,creatorInputFingerprint} from './creatorWorkspace.js';
import {runCreatorTask} from './creatorAi.js';

test('creator loading initializes framework workflow without inventing story data and is idempotent',()=>{
 const raw={id:'integration-framework',name:'空白原创',mode:'original',episodes:[],creator:{mode:'framework',sections:{},records:[]}};
 const loaded=normalizeCreatorProject(raw,'script');
 assert.ok(loaded.creator.framework,'framework workflow is part of persisted project loading');
 assert.deepEqual(loaded.creator.framework.groups,[]);
 assert.deepEqual(normalizeCreatorProject(loaded,'script'),loaded);
 assert.equal(raw.creator.framework,undefined);
});

test('free original loading retains its existing data model',()=>{
 const p=normalizeCreatorProject({id:'free',name:'自由',mode:'original',episodes:[],creator:{mode:'free',sections:{},records:[]}},'script');
 assert.equal(p.creator.framework,undefined);
});

test('framework conversation uses structured project facts instead of ignored legacy stages',async()=>{
 const project={id:'framework-chat',name:'自有故事',mode:'original',episodes:[],creator:{mode:'framework',sections:{},records:[],chat:[],framework:{version:2,ideas:[{id:'i1',text:'要保留的原创灵感',included:true}],ideaSummary:'唯一的创作意图',settings:{items:[{id:'rule',category:'世界规则',text:'每天能力最多使用三次',confirmed:true}],pending:[],confirmed:true,revision:1,history:[]},groups:[],looseEvents:[],mainline:{links:[],confirmed:false},characters:[],sources:[],components:[],simulations:[],plans:[],activePlanId:null,archives:[],legacy:{}}}};
 let request;
 const result=await runCreatorTask({project,state:{skills:[]},kind:'script',target:{task:'frameworkChat',section:'framework'},profile:{id:'mock',model:'test'},instruction:'讨论下一步',api:{aiChat:async r=>{request=r;return {ok:true,output:'真实接口返回的讨论候选'};}},taskId:'integration-chat'});
 const sent=request.messages.map(m=>m.content).join('\n');
 assert.match(sent,/每天能力最多使用三次/);
 assert.match(sent,/要保留的原创灵感|唯一的创作意图/);
 assert.equal(result.output,'真实接口返回的讨论候选');
 const changed={...project,creator:{...project.creator,framework:{...project.creator.framework,ideaSummary:'用户修改后的创作意图'}}};
 assert.notEqual(creatorInputFingerprint(project,{task:'frameworkChat',section:'framework'}),creatorInputFingerprint(changed,{task:'frameworkChat',section:'framework'}));
});

test('cancelled framework response retains returned text as a non-adoptable partial candidate',async()=>{
 let stopped=false;
 const project=normalizeCreatorProject({id:'cancelled-framework',name:'停止验证',mode:'original',episodes:[],creator:{mode:'framework',sections:{},records:[]}},'script');
 await assert.rejects(()=>runCreatorTask({project,state:{skills:[]},kind:'script',target:{task:'frameworkChat',section:'framework'},profile:{id:'mock',model:'test'},api:{aiChat:async()=>{stopped=true;return {ok:true,output:'停止时已返回的内容'};}},isCancelled:()=>stopped,taskId:'cancel-framework'}),error=>error.code==='STOPPED'&&error.partialText==='停止时已返回的内容');
});

test('existing episode editor saves framework bodies into their owning plan across reloads',async()=>{
 const {applyFrameworkCommand:cmd}=await import('./frameworkWorkflow.js');
 const {updateCreatorEpisode,buildCreatorText,archiveCreatorProject}=await import('./creatorWorkspace.js');
 let p=normalizeCreatorProject({id:'bridge',mode:'original',episodes:[],creator:{mode:'framework',records:[]}},'script');
 p=cmd(p,{type:'settings.confirm'});
 p=cmd(p,{type:'group.add',group:{id:'g',title:'阶段',events:[{id:'e',title:'行动',confirmed:true}]}});
 p=cmd(p,{type:'mainline.confirm'});
 p=cmd(p,{type:'plan.add',plan:{id:'plan',episodes:[{id:'ep',title:'第1集',content:'细纲',eventIds:['e']}]}});
 p=cmd(p,{type:'plan.activate',id:'plan'});
 const saved=updateCreatorEpisode({scriptProjects:[p]},'script',p.id,'ep',{result:'手动修改的完整正文'}).scriptProjects[0];
 assert.equal(normalizeCreatorProject(saved,'script').episodes[0].result,'手动修改的完整正文');
 assert.match(buildCreatorText(saved,'script'),/手动修改的完整正文/);
 const archived=archiveCreatorProject({scriptProjects:[saved],scriptLibrary:[]},saved.id).scriptLibrary[0].versions[0];
 assert.equal(archived.framework.activePlanId,'plan');
 assert.equal(archived.sourcePlanId,'plan');
});

test('framework scene-number prompt follows adopted plan order after episode reorder',async()=>{
 const project=normalizeCreatorProject({id:'number-order',mode:'original',creator:{mode:'framework',framework:{version:2,settings:{items:[],pending:[],confirmed:true},groups:[{id:'g',title:'阶段',events:[{id:'e',title:'行动',confirmed:true}]}],plans:[{id:'plan',episodes:[{id:'second',title:'第2集',content:'第二集的纲',eventIds:['e']},{id:'first',title:'第1集',content:'第一集的纲',eventIds:['e']}]}],activePlanId:'plan'}}},'script');
 let request;
 await runCreatorTask({project,state:{skills:[]},kind:'script',target:{task:'frameworkEpisode',planId:'plan',episodeId:'second'},profile:{id:'mock',model:'test'},api:{aiChat:async r=>{request=r;return {ok:true,output:'第1集\n1-1 办公室 日 内\n人物：主角\n△主角坐下。'};}},taskId:'order-test'});
 const prompt=request.messages.map(m=>m.content).join('\n');
 assert.match(prompt,/分集序号：1/);assert.match(prompt,/分场编号使用 1-1/);assert.ok(!prompt.includes('分场编号使用 2-1'));
});
