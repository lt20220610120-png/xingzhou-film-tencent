import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFrameworkProject,frameworkState,applyFrameworkCommand as cmd,frameworkEvents,frameworkDraftText} from './frameworkWorkflow.js';
import {validateFrameworkOutput,prepareFrameworkTask,frameworkTaskContext} from './frameworkAi.js';

const fresh=()=>normalizeFrameworkProject({id:'components',creator:{mode:'framework',records:[]}});
const story=()=>{let p=cmd(fresh(),{type:'settings.confirm'});for(const [i,title] of ['相遇','相爱','挫折'].entries())p=cmd(p,{type:'group.add',group:{id:`g${i}`,title,events:[{id:`e${i}`,title:`行动${i}`,summary:'前因与结果',confirmed:true}]}});return p;};
const output=p=>({name:'候选',groups:structuredClone(frameworkState(p).groups),looseEvents:structuredClone(frameworkState(p).looseEvents)});

test('batch macro confirmation confirms content and order without confirming small events or complete story',()=>{
 let p=fresh();for(let i=0;i<13;i++)p=cmd(p,{type:'group.add',group:{id:'g'+i,title:'阶段'+i,goal:'完整事件内容',events:[{id:'e'+i,title:'具体行动',story:'待确认故事'}]}});
 const next=cmd(p,{type:'mainline.confirmGroups'}),f=frameworkState(next);
 assert.ok(f.groups.every(g=>g.confirmed));assert.equal(f.mainline.orderConfirmed,true);assert.equal(f.mainline.confirmed,false);
 assert.ok(f.groups.every(g=>!g.events[0].confirmed));assert.ok(frameworkState(p).groups.every(g=>!g.confirmed));
});
test('batch macro confirmation rejects incomplete or unconfirmed fixed cards atomically',()=>{
 let p=story();p.creator.framework.groups[1].goal='';const before=JSON.stringify(p);
 assert.throws(()=>cmd(p,{type:'mainline.confirmGroups'}),/内容|正文/);assert.equal(JSON.stringify(p),before);
 p.creator.framework.groups.forEach(g=>g.goal='完整事件');p.creator.framework.groups[0].locked=true;p.creator.framework.groups[0].confirmed=false;
 assert.throws(()=>cmd(p,{type:'mainline.confirmGroups'}),/固定|解锁/);
 p.creator.framework.groups[0].confirmed=true;const fixed=structuredClone(p.creator.framework.groups[0]);
 const next=cmd(p,{type:'mainline.confirmGroups'});assert.deepEqual(next.creator.framework.groups[0],normalizeFrameworkProject(p).creator.framework.groups[0]);assert.equal(next.creator.framework.groups[0].goal,fixed.goal);
});

test('batch macro confirmation preserves an already confirmed story and its episode plan',()=>{
 let p=cmd(fresh(),{type:'settings.confirm'});
 p=cmd(p,{type:'group.add',group:{id:'g',title:'相遇',goal:'完整大事件',events:[{id:'e',title:'归还失物',summary:'行动经过和结果',confirmed:true}]}});
 p=cmd(p,{type:'mainline.confirm'});
 p=cmd(p,{type:'plan.add',plan:{episodes:[{id:'ep',title:'第1集',result:'已写正文'}]}});
 const before=frameworkState(p),next=frameworkState(cmd(p,{type:'mainline.confirmGroups'}));
 assert.equal(before.mainline.confirmed,true);assert.equal(next.mainline.confirmed,true);
 assert.deepEqual(next.plans,before.plans);assert.deepEqual(next.groups[0].events,before.groups[0].events);
});

test('macro order can be confirmed before any small events and stays confirmed as they are added',()=>{
 let p=fresh();p=cmd(p,{type:'group.add',group:{id:'a',title:'相遇'}});p=cmd(p,{type:'group.add',group:{id:'b',title:'相爱'}});
 p=cmd(p,{type:'mainline.orderConfirm'});assert.equal(frameworkState(p).mainline.orderConfirmed,true);assert.equal(frameworkState(p).mainline.confirmed,false);
 p=cmd(p,{type:'event.add',groupId:'a',event:{id:'e',title:'捡到包'}});assert.equal(frameworkState(p).mainline.orderConfirmed,true);
 p=cmd(p,{type:'group.move',id:'b',index:0});assert.equal(frameworkState(p).mainline.orderConfirmed,false);assert.equal(frameworkEvents(p)[0].code,'B1');
 assert.throws(()=>cmd(p,{type:'plan.add',plan:{episodes:[{title:'第1集'}]}}),/确认/);
});

test('manual drafts survive pending rules and stale plans while formal confirmation stays gated',()=>{
 let p=story();p=cmd(p,{type:'settings.propose',items:[{text:'尚未决定的新规则'}]});
 p=cmd(p,{type:'event.update',id:'e0',draft:true,patch:{story:'正在写的故事草稿'}});
 assert.equal(frameworkState(p).groups[0].events[0].story,'正在写的故事草稿');
 assert.throws(()=>prepareFrameworkTask(p,{task:'frameworkExpand',eventId:'e0'}),/设定/);
 p.creator.framework.plans=[{id:'plan',stale:true,episodes:[{id:'ep',title:'第1集'}]}];
 p=cmd(p,{type:'episode.update',planId:'plan',episodeId:'ep',draft:true,patch:{result:'先写下来'}});
 assert.equal(frameworkState(p).plans[0].episodes[0].result,'先写下来');
 assert.throws(()=>cmd(p,{type:'episode.update',planId:'plan',episodeId:'ep',patch:{finalConfirmed:true}}),/设定/);
});

test('local small-event simulation reads the whole story but cannot alter other macro events or targets',()=>{
 const p=story(),target={task:'frameworkSimulate',mode:'reorder',layer:'group',groupId:'g0'};
 const result=output(p);result.groups[0].events.push({id:'new',title:'归还包',summary:'富太太邀她喝茶'});
 assert.doesNotThrow(()=>validateFrameworkOutput(p,target,result));
 result.groups[1].goal='改动别的大事件';assert.throws(()=>validateFrameworkOutput(p,target,result),/其他大事件/);
 const altered=output(p);altered.groups[0].title='改成陌生结局';assert.throws(()=>validateFrameworkOutput(p,target,altered),/目标/);
 assert.throws(()=>prepareFrameworkTask(p,{...target,afterEventId:'e1'}),/起点/);
});

test('forward inference preserves the chosen prefix at both component levels',()=>{
 const p=story();let result=output(p);
 result.groups.push({id:'g3',title:'解决麻烦',events:[]});
 assert.doesNotThrow(()=>validateFrameworkOutput(p,{task:'frameworkSimulate',mode:'infer',layer:'groups',afterGroupId:'g1'},result));
 result.groups[0].goal='重写开端';assert.throws(()=>validateFrameworkOutput(p,{task:'frameworkSimulate',mode:'infer',layer:'groups',afterGroupId:'g1'},result),/起点/);
 result=output(p);result.groups[0].events.push({id:'a2',title:'归还包',summary:'发现失主身份'});
 assert.doesNotThrow(()=>validateFrameworkOutput(p,{task:'frameworkSimulate',mode:'infer',layer:'group',groupId:'g0',afterEventId:'e0'},result));
 result.groups[0].events[0].summary='偷偷重写前一事件';assert.throws(()=>validateFrameworkOutput(p,{task:'frameworkSimulate',mode:'infer',layer:'group',groupId:'g0',afterEventId:'e0'},result),/起点/);
});

test('every macro event needs small events before story confirmation or paid episode planning',()=>{
 let p=story();p=cmd(p,{type:'group.add',group:{id:'empty',title:'尚未展开的结局'}});
 assert.throws(()=>cmd(p,{type:'mainline.confirm'}),/每个大事件/);
 p.creator.framework.mainline.confirmed=true;
 assert.throws(()=>prepareFrameworkTask(p,{task:'frameworkPlan'}),/每个大事件/);
});

test('stage exports include real component content and keep outlines separate from scene bodies',()=>{
 const p=story();p.creator.framework.groups[0].events[0].story='原样保留的完整故事';
 const text=frameworkDraftText(p);assert.match(text,/A1 · 行动0/);assert.match(text,/原样保留的完整故事/);
 p.creator.framework.plans=[{id:'plan',episodes:[{title:'第1集',content:'本集行动取舍',hook:'让观众期待后续',result:'不应混入的正文'}]}];p.creator.framework.activePlanId='plan';
 const outline=frameworkDraftText(p,'plan');assert.match(outline,/本集行动取舍/);assert.match(outline,/让观众期待后续/);assert.ok(!outline.includes('不应混入的正文'));
});

test('current-stage conversation includes events in the new small-event and master workspaces',()=>{
 const p=story();p.creator.framework.plans=[{id:'plan',episodes:[{id:'ep',content:'当前版集纲',result:'当前版正文'}]}];p.creator.framework.activePlanId='plan';
 for(const stage of ['smallEvents','master']){const context=frameworkTaskContext(p,{task:'frameworkChat',scope:'current',workspaceStage:stage});assert.match(context,/行动0/);}
 const master=frameworkTaskContext(p,{task:'frameworkChat',scope:'current',workspaceStage:'master'});assert.match(master,/当前版集纲/);assert.match(master,/当前版正文/);
});
