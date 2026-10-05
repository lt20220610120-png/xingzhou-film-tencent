import test from 'node:test';
import assert from 'node:assert/strict';
import {createIPProject,importIPNovel,getIPProject} from './ipWorkspace.js';
import {runIPTask} from './ipAi.js';
import {withGroundedScenes,groundedGroup,continuityReply} from './ipPlanTestFixture.js';

const refusal='我只是一个文本 AI，在这方面没法帮到你。';
const fixture=(longNotes=false)=>{
 let state=createIPProject({fruitProjects:[]},{name:'拒绝答复不能完成创作',duration:60});const id=state.fruitProjects[0].id;
 state=importIPNovel(state,id,{content:withGroundedScenes('第一章 原文\n'+'已发生的原著因果。'.repeat(13000))});
 const p=getIPProject(state,id),source=p.creator.ip.source;
 p.creator.ip.reading=Array.from({length:4},(_,i)=>({sourceId:source.id,start:Math.floor(source.content.length*i/4),end:Math.floor(source.content.length*(i+1)/4),note:longNotes?'完整有效原著事实、人物与阶段停点。'.repeat(230):`完整原著事实与人物 ${i+1}`}));
 return p;
};
const fullPlan=p=>({mainline:'真实主线',ending:'真实停点',segments:[{from:1,to:1,episodes:50,focus:'有效事实'}],episodes:Array.from({length:50},(_,i)=>({chapterIds:[p.creator.ip.source.chapters[0].id],outline:`不同真实场面和切点${i+1}`}))});

test('new digest refusal is saved separately and cannot certify compact factual synthesis',async()=>{
 const p=fixture(true),diagnostics=[];let calls=0;
 await assert.rejects(()=>runIPTask({project:p,task:'plan',taskId:'digest-refused',profile:{model:'mock'},onDraft:d=>diagnostics.push(d),api:{aiChat:async r=>{calls++;assert.ok(r.taskId.includes(':digest-'));return refusal;}}}),e=>e.code==='IP_MODEL_REFUSAL');
 assert.equal(calls,1);assert.equal(diagnostics[0].type,'digest-refusal');assert.equal(diagnostics[0].content,refusal);
 assert.ok(!diagnostics.some(d=>d.type==='digest'&&d.compact));
});

test('old compact digest refusal is ignored while valid source notes and newer successful synthesis remain reusable',async()=>{
 const p=fixture(true),diagnostics=[];
 await assert.rejects(()=>runIPTask({project:p,task:'plan',taskId:'digest-key',profile:{model:'mock'},onDraft:d=>diagnostics.push(d),api:{aiChat:async()=>refusal}}),e=>e.code==='IP_MODEL_REFUSAL');
 const refused=diagnostics.find(d=>d.type==='digest-refusal');p.creator.records.push({diagnostics:[{...refused,type:'digest',compact:true}]});
 let digestCalls=0;
 const result=await runIPTask({project:p,task:'plan',taskId:'digest-recovered',profile:{model:'mock'},api:{aiChat:async r=>{
  if(r.taskId.includes(':plan-continuity-'))return continuityReply();
  if(r.taskId.includes(':plan-group-'))return JSON.stringify(groundedGroup(p.creator.ip.source,r,'有效原著场面'));
  assert.ok(!r.taskId.includes(':read-'));
  if(r.taskId.includes(':digest-')){digestCalls++;return '有效的原著角色、因果与阶段结果';}
  assert.ok(!r.messages.at(-1).content.includes(refusal));
  return r.taskId.includes(':settings')?'【故事梗概】已选原著主线':JSON.stringify(fullPlan(p));
 }}});
 assert.equal(result.plan.episodes.length,50);assert.ok(digestCalls>0);
});

test('new settings refusal does not become a completed setting or visible generated version',async()=>{
 const p=fixture(),diagnostics=[];let calls=0;
 await assert.rejects(()=>runIPTask({project:p,task:'settings',taskId:'settings-refused',profile:{model:'mock'},onDraft:d=>diagnostics.push(d),api:{aiChat:async r=>{calls++;assert.ok(r.taskId.endsWith(':settings'));return refusal;}}}),e=>e.code==='IP_MODEL_REFUSAL');
 assert.equal(calls,1);assert.equal(diagnostics[0].type,'settings-refusal');assert.equal(diagnostics[0].content,refusal);
 assert.ok(!diagnostics.some(d=>d.type==='settings-checkpoint'||d.type==='settings-ready'||d.type==='version'));
});

test('an old complete settings refusal checkpoint is ignored without invalidating good source notes',async()=>{
 const p=fixture(),diagnostics=[];
 await assert.rejects(()=>runIPTask({project:p,task:'settings',taskId:'settings-key',profile:{model:'mock'},onDraft:d=>diagnostics.push(d),api:{aiChat:async()=>refusal}}),e=>e.code==='IP_MODEL_REFUSAL');
 const refused=diagnostics.find(d=>d.type==='settings-refusal');p.creator.records.push({diagnostics:[{...refused,type:'settings-checkpoint',complete:true}]});
 let calls=0;
 const result=await runIPTask({project:p,task:'settings',taskId:'settings-recovered',profile:{model:'mock'},api:{aiChat:async r=>{calls++;assert.ok(r.taskId.endsWith(':settings'));return '【故事梗概】有效原文梗概\n【人物小传】有戏份的原著角色';}}});
 assert.equal(calls,1);assert.match(result.content,/有效原文梗概/);
});
