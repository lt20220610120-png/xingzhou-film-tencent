import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFrameworkProject,frameworkRows} from './frameworkWorkflow.js';
import {isFrameworkTask,prepareFrameworkTask,frameworkTaskContext,frameworkInputFingerprint,validateFrameworkOutput,applyFrameworkProjectRecord} from './frameworkAi.js';
import * as frameworkAi from './frameworkAi.js';

const fixture=()=>normalizeFrameworkProject({id:'analysis',creator:{mode:'framework',records:[],framework:{version:2,ideaSummary:'相遇后相爱',ideas:[{id:'idea',text:'归还失物的灵感',included:true}],settings:{items:[{id:'rule',text:'现代城市、人物不会瞬移'}],pending:[],confirmed:true,revision:1},mainline:{orderConfirmed:true,confirmed:false,links:[]},groups:[{id:'a',title:'相遇',goal:'女主归还失物，在生日宴与男主相遇。',confirmed:true,events:[{id:'a1',title:'捡包',story:'女主拾得失物，主动寻找失主。',confirmed:true}]},{id:'b',title:'相爱',goal:'男女主通过共同解决问题建立信任。',confirmed:true,events:[]}]}}});
const target={task:'frameworkAnalyze'};
const output=()=>({reasoning:'依照全剧前后因果安排',groups:[{groupId:'a',events:[{eventId:'a1'},{title:'归还包',story:'女主归还包，失主邀请她赴宴。',before:'找到失主',after:'获得邀请',actualTime:'拾包当天下午'},{title:'赴宴',story:'女主赴生日宴，与男主相遇，为后续合作留下契机。'}]},{groupId:'b',events:[{title:'合作',story:'两人相遇后共同解决问题，逐步建立信任。'}]}]});

test('small-event analysis has its own task and requires confirmed rules and macro order',()=>{
 assert.equal(isFrameworkTask(target),true);
 const p=fixture();assert.doesNotThrow(()=>prepareFrameworkTask(p,target));
 p.creator.framework.mainline.orderConfirmed=false;assert.throws(()=>prepareFrameworkTask(p,target),/顺序/);
 p.creator.framework.mainline.orderConfirmed=true;p.creator.framework.groups[1].confirmed=false;assert.throws(()=>prepareFrameworkTask(p,target),/大事件/);
});
test('current-group analysis reads later macro events and selected ideas without permitting other-group writes',()=>{
 const p=fixture(),t={...target,groupId:'a'};
 const context=frameworkTaskContext(p,t);assert.match(context,/归还失物的灵感/);assert.match(context,/共同解决问题建立信任/);
 const result=output();result.groups.pop();assert.doesNotThrow(()=>validateFrameworkOutput(p,t,result));
 assert.throws(()=>validateFrameworkOutput(p,t,output()),/范围|大事件/);
});
test('analysis adoption inserts detailed cards while keeping existing IDs, text, confirmations and macro order',()=>{
 const p=fixture();p.creator.records=[{id:'r',projectId:p.id,target,status:'pending',output:JSON.stringify(output()),inputFingerprint:frameworkInputFingerprint(p,target)}];
 const next=applyFrameworkProjectRecord(p,'r'),f=next.creator.framework;
 assert.deepEqual(f.groups.map(g=>g.id),['a','b']);assert.deepEqual(f.groups.map(g=>g.goal),p.creator.framework.groups.map(g=>g.goal));
 assert.deepEqual(f.groups[0].events[0],p.creator.framework.groups[0].events[0]);
 assert.deepEqual(frameworkRows(f).map(r=>r.code),['A1','A2','A3','B1']);
 assert.equal(f.groups[0].events[1].actualTime,'拾包当天下午');assert.equal(f.groups[0].events[1].confirmed,false);
 assert.equal(f.mainline.orderConfirmed,true);assert.equal(f.mainline.confirmed,false);
 assert.equal(p.creator.framework.groups[0].events.length,1);
});
test('analysis cannot omit, duplicate, rewrite or move existing event references across parents',()=>{
 const p=fixture();let result=output();result.groups[0].events.shift();assert.throws(()=>validateFrameworkOutput(p,target,result),/已有|保留/);
 result=output();result.groups[0].events[0].story='覆盖已确认正文';assert.throws(()=>validateFrameworkOutput(p,target,result),/已有|覆盖|修改/);
 result=output();result.groups[1].events.push({eventId:'a1'});assert.throws(()=>validateFrameworkOutput(p,target,result),/所属|大事件|重复/);
 result=output();result.groups[0].events.push({eventId:'a1'});assert.throws(()=>validateFrameworkOutput(p,target,result),/重复|已有/);
 result=output();result.groups.pop();assert.throws(()=>validateFrameworkOutput(p,target,result),/遗漏|大事件/);
});
test('analysis preserves locked card positions and skips fixed macro events',()=>{
 const p=fixture();p.creator.framework.groups[0].events[0].locked=true;
 const result=output();result.groups[0].events.unshift({title:'前置行动',story:'不能挤动固定事件'});
 assert.throws(()=>validateFrameworkOutput(p,target,result),/固定/);
 p.creator.framework.groups[0].locked=true;
 const allowed=output();allowed.groups.shift();assert.doesNotThrow(()=>validateFrameworkOutput(p,target,allowed));
 assert.throws(()=>prepareFrameworkTask(p,{...target,groupId:'a'}),/固定/);
});
test('analysis fills an empty draft placeholder without dropping its stable identity',()=>{
 const p=fixture();p.creator.framework.groups[0].events=[{id:'empty',title:'新小事件',story:'',summary:'',confirmed:false,locked:false}];
 const result=output();result.groups[0].events[0]={eventId:'empty',title:'捡包',story:'女主捡包后开始寻找失主。'};
 p.creator.records=[{id:'r',projectId:p.id,target,status:'pending',output:JSON.stringify(result),inputFingerprint:frameworkInputFingerprint(p,target)}];
 const f=applyFrameworkProjectRecord(p,'r').creator.framework;
 assert.equal(f.groups[0].events[0].id,'empty');assert.equal(f.groups[0].events[0].story,'女主捡包后开始寻找失主。');
});
test('old analysis cannot be adopted after macro context changes',()=>{
 const p=fixture();p.creator.records=[{id:'r',projectId:p.id,target,status:'pending',output:JSON.stringify(output()),inputFingerprint:frameworkInputFingerprint(p,target)}];
 p.creator.framework.groups[1].goal='改成其他结局';assert.throws(()=>applyFrameworkProjectRecord(p,'r'),/旧版|变化/);
});
test('complete small events in retained middle groups do not require duplicate direct events',()=>{
 const p=fixture();p.creator.framework.groups[0].events=[];
 p.creator.framework.groups[0].middles=[{id:'m',title:'已完成的相遇过程',locked:true,events:[{id:'m1',title:'相遇',story:'女主赴宴后与男主相遇。',confirmed:true,locked:true}]}];
 p.creator.framework=normalizeFrameworkProject(p).creator.framework;
 const result=output();result.groups[0].events=[];
 assert.doesNotThrow(()=>validateFrameworkOutput(p,target,result));
 p.creator.records=[{id:'r',projectId:p.id,target,status:'pending',output:JSON.stringify(result),inputFingerprint:frameworkInputFingerprint(p,target)}];
 const f=applyFrameworkProjectRecord(p,'r').creator.framework;
 assert.deepEqual(f.groups[0].middles,p.creator.framework.groups[0].middles);
 assert.equal(f.groups[0].events.length,0);
});
test('candidate revision retains earlier user requirements across multiple rounds',()=>{
 assert.equal(typeof frameworkAi.frameworkRevisionTarget,'function');
 const r={target:{task:'frameworkCard',nodeId:'a',nodeType:'group'},instruction:'宋馨雅改为夏初雪，母亲用关系称谓',output:'第一轮候选'};
 const first=frameworkAi.frameworkRevisionTarget(r);
 const second=frameworkAi.frameworkRevisionTarget({target:first,instruction:'强调女主主动选择',output:'第二轮候选'});
 assert.deepEqual(second.revisionInstructions,['宋馨雅改为夏初雪，母亲用关系称谓','强调女主主动选择']);
 assert.equal(second.revisionCandidate,'第二轮候选');
 assert.equal(second.nodeId,'a');
 assert.match(frameworkTaskContext(fixture(),second),/宋馨雅改为夏初雪/);
});
