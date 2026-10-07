import test from 'node:test';
import assert from 'node:assert/strict';
import {isFrameworkTask,prepareFrameworkTask,frameworkTaskContext,frameworkInputFingerprint,validateFrameworkOutput,applyFrameworkProjectRecord,applyFrameworkRecord} from './frameworkAi.js';
import {normalizeFrameworkProject} from './frameworkWorkflow.js';

const project = () => ({id:'p',name:'项目',episodes:[],creator:{mode:'framework',records:[],framework:{version:2,ideas:[{id:'i',text:'选定灵感',included:true},{id:'hidden',text:'未选灵感',included:false}],ideaSummary:'整理摘要',settings:{items:[{id:'s',text:'当前世界规则',category:'rule'}],pending:[],confirmed:true,revision:1},groups:[{id:'g',title:'当前大事件',goal:'目标',locked:false,middles:[{id:'m',title:'中事件',events:[{id:'e',title:'当前小事件',summary:'行动结果',story:'完整故事',confirmed:true,locked:false,source:null}]}]}],looseEvents:[],mainline:{confirmed:true,links:[]},characters:[{id:'c',name:'已定人物'}],sources:[{id:'src',name:'来源书',content:'第一段原文。第二段原文。'}],components:[{id:'comp',title:'已选组件',confirmed:true,sourceId:'src',summary:'对标观察'},{id:'unselected',title:'未选组件',confirmed:true,summary:'禁止泄漏'}],simulations:[{id:'unused',groups:[],comment:'未采用模拟秘密'}],plans:[{id:'plan',name:'当前版',stale:false,episodes:[{id:'ep1',title:'第1集',content:'前集纲',result:'前集已写事实',eventIds:['e']},{id:'ep2',title:'第2集',content:'当前集纲',result:'当前稿',eventIds:['e']},{id:'ep3',title:'第3集',content:'后集纲',result:'未来稿不得当成过去',eventIds:['e']}]},{id:'other',episodes:[{id:'otherEp',result:'其他版本秘密'}]}],activePlanId:'plan',archives:[],legacy:{}}}});
const record = (p,target,output,status='pending') => ({id:'record',projectId:p.id,target,output,status,inputFingerprint:frameworkInputFingerprint(p,target)});
const attach = (p,r) => ({...p,creator:{...p.creator,records:[r]}});

test('loose inbox events neither block plan generation nor become mandatory allocated facts',()=>{
 const p=project();p.creator.framework.looseEvents=[{id:'loose',title:'未采用收集箱秘密',confirmed:false}];
 const target={task:'frameworkPlan',episodeCount:1};
 assert.doesNotThrow(()=>prepareFrameworkTask(p,target));
 assert.doesNotThrow(()=>validateFrameworkOutput(p,target,{name:'正式主线',episodes:[{number:1,content:'完整本集纲',eventIds:['e']}]}));
 assert.throws(()=>validateFrameworkOutput(p,target,{episodes:[{number:1,content:'错误引用',eventIds:['e','loose']}]}),/事件/);
 assert.ok(!frameworkTaskContext(p,{task:'frameworkEpisode',planId:'plan',episodeId:'ep2'}).includes('未采用收集箱秘密'));
});

test('framework targets route separately and pending settings block official generation',()=>{
 assert.equal(isFrameworkTask({task:'frameworkPlan'}),true);assert.equal(isFrameworkTask({task:'episode'}),false);
 const p=project();p.creator.framework.settings.pending=[{id:'pending',text:'冲突建议'}];
 assert.throws(()=>prepareFrameworkTask(p,{task:'frameworkSimulate',mode:'infer',componentIds:[]}),/设定/);
 assert.doesNotThrow(()=>prepareFrameworkTask(p,{task:'frameworkSettingsCheck',text:'补充设定'}));
});
test('episode context reads exact active plan and only earlier bodies',()=>{
 const ctx=frameworkTaskContext(project(),{task:'frameworkEpisode',planId:'plan',episodeId:'ep2'});
 assert.match(ctx,/当前集纲/);assert.match(ctx,/前集已写事实/);assert.match(ctx,/当前世界规则/);assert.match(ctx,/完整故事/);
 for(const forbidden of ['未来稿不得当成过去','其他版本秘密','未选灵感','未采用模拟秘密','禁止泄漏'])assert.ok(!ctx.includes(forbidden),forbidden);
 assert.throws(()=>prepareFrameworkTask(project(),{task:'frameworkEpisode',planId:'other',episodeId:'otherEp'}),/当前|采用/);
});
test('simulation context includes only selected confirmed components and source identity',()=>{
 const ctx=frameworkTaskContext(project(),{task:'frameworkSimulate',mode:'reorder',componentIds:['comp']});
 assert.match(ctx,/已选组件/);assert.match(ctx,/src/);assert.ok(!ctx.includes('禁止泄漏'));
 assert.throws(()=>prepareFrameworkTask(project(),{task:'frameworkSimulate',mode:'infer',componentIds:['missing']}),/组件/);
});
test('extract accepts exact JSON fence but rejects prose and retains trusted raw source',()=>{
 const p=project(),target={task:'frameworkExtract',sourceId:'src'};
 const result=validateFrameworkOutput(p,target,'```json\n{"groups":[{"id":"sg","title":"阶段","middles":[{"id":"sm","title":"段落","events":[{"id":"se","title":"具体行动","summary":"行动后果","source":{"sourceId":"evil","rawText":"第一段原文。"}}]}]}]}\n```');
 assert.equal(result.groups[0].middles[0].events[0].source.sourceId,'src');
 assert.equal(result.groups[0].middles[0].events[0].source.rawText,'第一段原文。');
 assert.throws(()=>validateFrameworkOutput(p,target,'附解释 {"groups":[]} trailing'),/JSON|结构/);
 assert.throws(()=>validateFrameworkOutput(p,target,{groups:[{id:'g',title:'伪造',events:[{id:'e',title:'凭空',summary:'凭空',source:{rawText:'来源中不存在'}}]}]}),/原文|来源/);
});
test('setting checks never auto replace conflicts and compare every existing setting',()=>{
 const p=project(),target={task:'frameworkSettingsCheck',text:'新规则'};
 const next=applyFrameworkProjectRecord(attach(p,record(p,target,JSON.stringify({items:[{text:'新规则',category:'rule',conflictsWith:['s']}]}))),'record');
 assert.equal(next.creator.framework.settings.items[0].text,'当前世界规则');
 assert.deepEqual(next.creator.framework.settings.pending[0].conflictsWith,['s']);
 assert.equal(next.creator.records[0].status,'adopted');
 assert.throws(()=>validateFrameworkOutput(p,target,{items:[{text:'新规则',conflictsWith:['unknown']}]}),/设定|编号/);
});
test('locked simulation nodes cannot be changed, removed or moved to a new parent',()=>{
 const p=project();p.creator.framework.groups[0].middles[0].events[0].locked=true;
 const target={task:'frameworkSimulate',mode:'reorder',componentIds:[]};
 const bad=structuredClone(p.creator.framework.groups);bad[0].middles[0].events[0].summary='被覆盖';
 assert.throws(()=>validateFrameworkOutput(p,target,{groups:bad,looseEvents:[]}),/固定|锁定/);
 const moved=structuredClone(p.creator.framework.groups);moved[0].middles[0].id='new-parent';
 assert.throws(()=>validateFrameworkOutput(p,target,{groups:moved,looseEvents:[]}),/固定|锁定/);
 assert.throws(()=>validateFrameworkOutput(p,target,{groups:[],looseEvents:[]}),/固定|锁定|事件/);
});
test('plan validates exact arbitrary count and supports many to many event allocation',()=>{
 const p=project(),target={task:'frameworkPlan',episodeCount:3};
 const result=validateFrameworkOutput(p,target,{name:'新版本',episodes:[{number:1,content:'第一集详细纲',eventIds:['e']},{number:2,content:'第二集详细纲',eventIds:['e']},{number:3,content:'第三集详细纲',eventIds:['e']}]});
 assert.equal(result.episodes.length,3);assert.deepEqual(result.episodes[2].eventIds,['e']);
 assert.throws(()=>validateFrameworkOutput(p,target,{episodes:[{number:1,content:'纲',eventIds:['e']}]}),/集数|3/);
 assert.throws(()=>validateFrameworkOutput(p,{task:'frameworkPlan'},{episodes:[{number:1,content:'纲',eventIds:['invented']}]}),/事件|编号/);
});
test('fingerprints exclude candidate/history changes and follow exact task dependencies',()=>{
 const p=project(),target={task:'frameworkExtract',sourceId:'src'};const baseline=frameworkInputFingerprint(p,target);
 assert.ok(baseline);p.creator.records.push({output:'候选'});p.creator.framework.ideaSummary='无关变化';
 assert.equal(frameworkInputFingerprint(p,target),baseline);p.creator.framework.sources[0].content+='修改';
 assert.notEqual(frameworkInputFingerprint(p,target),baseline);
 const episodeTarget={task:'frameworkEpisode',planId:'plan',episodeId:'ep2'},b=frameworkInputFingerprint(p,episodeTarget);
 p.creator.framework.plans[1].episodes[0].result='另版编辑';assert.equal(frameworkInputFingerprint(p,episodeTarget),b);
 p.creator.framework.plans[0].episodes[0].result='前集已修改';assert.notEqual(frameworkInputFingerprint(p,episodeTarget),b);
});
test('stale malformed cancelled outputs stay readable and cannot silently adopt',()=>{
 const p=project(),target={task:'frameworkIdeas'},r=record(p,target,JSON.stringify({summary:'候选摘要'}));p.creator.framework.ideas[0].text='已改输入';
 const current=attach(p,r),serialized=JSON.stringify(current);
 assert.throws(()=>applyFrameworkProjectRecord(current,'record',{allowStale:true}),/输入|旧版|变化/);assert.equal(JSON.stringify(current),serialized);
 const fresh=project();assert.throws(()=>applyFrameworkProjectRecord(attach(fresh,record(fresh,target,'broken')),'record'),/JSON|结构/);
 assert.throws(()=>applyFrameworkProjectRecord(attach(fresh,record(fresh,target,'候选','cancelled')),'record'),/停止|取消|完成/);
});
test('episode adoption archives previous draft and never overwrites another version',()=>{
 const p=project(),target={task:'frameworkEpisode',planId:'plan',episodeId:'ep2'},output='第2集\n2-1 房间 日 内\n人物：甲\n△甲推开门。\n甲：事情已经决定。';
 const next=applyFrameworkRecord({scriptProjects:[attach(p,record(p,target,output))]},'p','record');
 const edited=next.scriptProjects[0],ep=edited.creator.framework.plans[0].episodes[1];
 assert.equal(ep.result,output);assert.equal(ep.finalConfirmed,false);assert.equal(edited.creator.framework.plans[1].episodes[0].result,'其他版本秘密');
 assert.ok(ep.generationVersions.some(v=>v.previous==='当前稿'));
 assert.equal(edited.creator.records[0].status,'adopted');
});
test('episode validation rejects summaries and wrong episode scene numbering',()=>{
 const p=project(),target={task:'frameworkEpisode',planId:'plan',episodeId:'ep2'};
 assert.throws(()=>validateFrameworkOutput(p,target,'他们后来解决问题。'),/剧本|场/);
 assert.throws(()=>validateFrameworkOutput(p,target,'第1集\n1-1 房间 日 内\n人物：甲\n甲：事情已经决定。'),/集|编号/);
});
test('expansion validates the exact stable event identity',()=>{
 const p=project(),target={task:'frameworkExpand',eventId:'e'};
 assert.throws(()=>validateFrameworkOutput(p,target,{eventId:'wrong',story:'完整行动经过'}),/事件|编号/);
 assert.equal(validateFrameworkOutput(p,target,{eventId:'e',story:'完整行动经过'}).story,'完整行动经过');
});
test('locked ancestor blocks paid expansion before model invocation',()=>{
 const p=project();p.creator.framework.groups[0].locked=true;
 assert.throws(()=>prepareFrameworkTask(p,{task:'frameworkExpand',eventId:'e'}),/固定|锁定/);
});
test('simulation cannot shift a fixed node by inserting an earlier unlocked event',()=>{
 const p=project();p.creator.framework.groups[0].middles[0].events[0].locked=true;
 const groups=structuredClone(normalizeFrameworkProject(p).creator.framework.groups);
 assert.doesNotThrow(()=>validateFrameworkOutput(p,{task:'frameworkSimulate',mode:'infer',componentIds:[]},{groups,looseEvents:[]}));
 groups[0].middles[0].events.unshift({id:'new',title:'新增前序',summary:'行动'});
 assert.throws(()=>validateFrameworkOutput(p,{task:'frameworkSimulate',mode:'infer',componentIds:[]},{groups,looseEvents:[]}),/固定|锁定/);
});
test('unconfirmed characters provide only identity rather than draft story facts',()=>{
 const p=project();p.creator.framework.characters.push({id:'draft-c',name:'待定人物',description:'未经采用的人物秘密',confirmed:false});
 const ctx=frameworkTaskContext(p,{task:'frameworkChat'});
 assert.match(ctx,/draft-c/);assert.ok(!ctx.includes('未经采用的人物秘密'));
});
test('plan candidate adoption stores inactive edition with untouched active bodies',()=>{
 const p=project(),target={task:'frameworkPlan',episodeCount:1},r=record(p,target,JSON.stringify({name:'新候选集纲',episodes:[{number:1,content:'完整集纲',eventIds:['e']}]}));
 const next=applyFrameworkProjectRecord(attach(p,r),'record');
 assert.equal(next.creator.framework.plans.length,3);assert.equal(next.creator.framework.activePlanId,'plan');
 assert.equal(next.creator.framework.plans[2].episodes[0].result,'');assert.equal(next.creator.framework.plans[0].episodes[1].result,'当前稿');
});
test('extraction adoption keeps exact source and hierarchy as unconfirmed components',()=>{
 const p=project(),target={task:'frameworkExtract',sourceId:'src'},r=record(p,target,JSON.stringify({groups:[{id:'sg',title:'素材大事件',events:[{id:'se',title:'素材具体行动',summary:'真实后果',source:{rawText:'第一段原文。'}}]}]}));
 const next=applyFrameworkProjectRecord(attach(p,r),'record'),component=next.creator.framework.components.at(-1);
 assert.equal(component.sourceId,'src');assert.equal(component.rawText,'第一段原文。第二段原文。');assert.equal(component.confirmed,false);
 assert.equal(component.groups[0].events[0].source.sourceEventId,'se');assert.equal(next.creator.framework.groups[0].title,'当前大事件');
});
test('simulation adoption remains an independent candidate until explicit structure adoption',()=>{
 const p=project(),target={task:'frameworkSimulate',mode:'infer',componentIds:['comp']},groups=structuredClone(p.creator.framework.groups);groups[0].title='模拟新阶段';
 const next=applyFrameworkProjectRecord(attach(p,record(p,target,JSON.stringify({groups,looseEvents:[]}))),'record');
 assert.equal(next.creator.framework.groups[0].title,'当前大事件');assert.equal(next.creator.framework.simulations.at(-1).groups[0].title,'模拟新阶段');
});
test('malformed structured rows return meaningful errors with preserved candidates',()=>{
 const p=project();
 assert.throws(()=>validateFrameworkOutput(p,{task:'frameworkSettingsCheck',text:'补充'},{items:[null]}),error=>error.code==='FRAMEWORK_AI_INVALID'&&/条目|结构/.test(error.message));
 assert.throws(()=>validateFrameworkOutput(p,{task:'frameworkPlan'},{episodes:[null]}),error=>error.code==='FRAMEWORK_AI_INVALID'&&/集纲|结构/.test(error.message));
});
test('scene headings with only a narrative summary cannot pass full screenplay validation',()=>{
 const p=project(),target={task:'frameworkEpisode',planId:'plan',episodeId:'ep2'};
 assert.throws(()=>validateFrameworkOutput(p,target,'第2集\n2-1 事件经过\n人物：甲\n甲后来解决了问题。'),/剧本|场|对白/);
});

test('framework conversations retain prior discussion while screenplay tasks exclude discussion candidates',()=>{
 const p=project();p.creator.chat=[{id:'m',role:'assistant',content:'之前讨论的未采用转折',stage:'frameworkChat'}];
 assert.match(frameworkTaskContext(p,{task:'frameworkChat',scope:'project'}),/之前讨论的未采用转折/);
 assert.ok(!frameworkTaskContext(p,{task:'frameworkEpisode',planId:'plan',episodeId:'ep2'}).includes('之前讨论的未采用转折'));
 const current=frameworkTaskContext(p,{task:'frameworkChat',scope:'current',workspaceStage:'settings'});
 assert.ok(!current.includes('完整故事'));assert.match(current,/当前世界规则/);
});


test('contextual simulation adoption applies reviewed cards in one atomic transaction',()=>{
 let p=normalizeFrameworkProject(project());const target={task:'frameworkSimulate',layer:'groups',mode:'infer'};
 const output={groups:[...structuredClone(p.creator.framework.groups),{id:'next-group',title:'后续大事件',goal:'后续行动',events:[],middles:[]}],looseEvents:[]};
 p=attach(p,record(p,target,JSON.stringify(output)));const next=applyFrameworkProjectRecord(p,'record',{activateSimulation:true});
 assert.equal(next.creator.framework.groups.at(-1).id,'next-group');assert.equal(next.creator.framework.simulations.at(-1).adopted,true);assert.equal(next.creator.records[0].status,'adopted');
 assert.equal(p.creator.framework.groups.length,1);
});
test('contextual adoption still rejects stale and locked-node changes without partial writes',()=>{
 let p=normalizeFrameworkProject(project());const target={task:'frameworkSimulate',layer:'groups',mode:'reorder'};
 p.creator.framework.groups[0].locked=true;const output={groups:structuredClone(p.creator.framework.groups),looseEvents:[]};output.groups[0].goal='改写固定目标';
 p=attach(p,record(p,target,JSON.stringify(output)));const before=JSON.stringify(p);
 assert.throws(()=>applyFrameworkProjectRecord(p,'record',{activateSimulation:true}),/固定/);assert.equal(JSON.stringify(p),before);
 p.creator.framework.groups[0].goal='后来的人工改动';assert.throws(()=>applyFrameworkProjectRecord(p,'record',{activateSimulation:true}),/输入已经变化/);
});


test('card organization uses the real task pipeline and only adopts the selected card',()=>{
 let p=normalizeFrameworkProject(project());p.creator.framework.settings.confirmed=false;
 const target={task:'frameworkCard',nodeType:'event',nodeId:'e'};
 assert.doesNotThrow(()=>prepareFrameworkTask(p,target));assert.match(frameworkTaskContext(p,target),/targetCard/);
 const output={nodeId:'e',title:'整理标题',content:'完整文字，保留行动、对白与结果。'};
 p=attach(p,record(p,target,JSON.stringify(output)));const next=applyFrameworkProjectRecord(p,'record');
 const e=next.creator.framework.groups[0].middles[0].events[0];assert.equal(e.story,output.content);assert.equal(e.summary,output.content);assert.equal(e.title,output.title);assert.equal(e.confirmed,false);
 assert.equal(next.creator.framework.groups[0].goal,p.creator.framework.groups[0].goal);
 assert.deepEqual(next.creator.framework.plans.map(p=>p.episodes.map(e=>e.result)),p.creator.framework.plans.map(p=>p.episodes.map(e=>e.result)));
 assert.throws(()=>validateFrameworkOutput(p,target,{...output,nodeId:'wrong'}),/编号/);
 p.creator.framework.groups[0].locked=true;assert.throws(()=>prepareFrameworkTask(p,target),/固定/);
});

test('bulk split accepts whole stories before confirmation, appends fresh cards and rejects stale or malformed adoption',()=>{
 const p=project();p.creator.framework.settings.confirmed=false;p.creator.framework.groups[0].locked=true;
 const target={task:'frameworkSplit',text:'女主捡到包。归还包之后受邀赴宴，认识男主。'};
 assert.equal(isFrameworkTask(target),true);assert.doesNotThrow(()=>prepareFrameworkTask(p,target));
 assert.match(frameworkTaskContext(p,target),/女主捡到包/);
 const output={groups:[{id:'g',title:'捡包',goal:'女主捡到包并归还。'},{title:'赴宴',goal:'女主受邀赴宴，认识男主。'}]};
 const next=applyFrameworkProjectRecord(attach(p,record(p,target,JSON.stringify(output))),'record');
 assert.equal(next.creator.framework.groups.length,3);assert.deepEqual(next.creator.framework.groups[0],normalizeFrameworkProject(p).creator.framework.groups[0]);
 assert.ok(next.creator.framework.groups[1].id!=='g');assert.equal(new Set(next.creator.framework.groups.map(g=>g.id)).size,3);
 assert.equal(next.creator.records[0].status,'adopted');assert.equal(next.creator.framework.groups[1].confirmed,false);
 assert.throws(()=>validateFrameworkOutput(p,target,{groups:[{title:'只有标题'}]}),/完整事件/);
 assert.throws(()=>prepareFrameworkTask(p,{task:'frameworkSplit',text:' '}),/故事内容/);
 const saved=attach(p,record(p,target,JSON.stringify(output)));saved.creator.framework.ideaSummary='后来修改的灵感';
 assert.throws(()=>applyFrameworkProjectRecord(saved,'record'),{code:'FRAMEWORK_AI_STALE'});
});
