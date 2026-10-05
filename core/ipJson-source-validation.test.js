import test from 'node:test';
import assert from 'node:assert/strict';
import {createIPProject,importIPNovel,getIPProject} from './ipWorkspace.js';
import {runIPTask} from './ipAi.js';
import {groundedEpisodes,continuityReply} from './ipPlanTestFixture.js';

const fixture=()=>{
 // Reproduce the captured chapter-29..34 UTF-16 boundaries without publishing
 // any of the user's novel text. The actual bad proposal was [76000,86000).
 const lengths=Array(100).fill(2450);lengths[0]=5558;
 lengths.splice(28,6,2543,2445,2357,2352,2362,2403);
 let scene=0;
 const content=lengths.map((n,i)=>{
  const head=`第${i+1}章 原文场面\n`,cuts=Array.from({length:50},()=>`素材场面${String(++scene).padStart(6,'0')}甲依原著通知核实线索并逐步完成眼前任务。\n`).join('');
  assert.ok(head.length+cuts.length<n,'unique source cuts must preserve captured UTF-16 chapter bounds');
  return head+cuts+'原'.repeat(n-head.length-cuts.length-1)+'\n';
 }).join('');
 let state=createIPProject({fruitProjects:[]},{name:'数字范围误估回归',duration:60});const id=state.fruitProjects[0].id;
 state=importIPNovel(state,id,{content});const p=getIPProject(state,id),source=p.creator.ip.source;
 p.creator.ip.reading=[{sourceId:source.id,start:0,end:content.length,note:'所有原文已有有效故事索引，单元选目录20–31章，真实起止与场面已核实',readingMode:'story-index'}];
 return p;
};
const prompt=r=>r.messages.at(-1).content;
const validGroup=(p,r)=>{
 const source=p.creator.ip.source,n=Number(prompt(r).match(/本次只规划 (\d+) 集/)[1]),first=Number(prompt(r).match(/单元内第(\d+)至/)[1]);
 const cuts=groundedEpisodes(source,150,{start:source.chapters[28].start,end:source.chapters[30].end,label:'主线不同真实场面'}).filter((_,i)=>i%3===0);
 const previous=JSON.parse(prompt(r).match(/已安排前文接点：([^\n]+)/)[1]);
 assert.ok(n<=6);assert.ok(cuts.length>=first-1+n);
 const episodes=cuts.slice(first-1,first-1+n);
 if(previous.length){const after=previous.at(-1).sourceRanges.at(-1).end;assert.ok(episodes.every(e=>source.content.indexOf(e.sourceQuotes[0].startQuote)>=after),'batch source anchors must continue after completed cuts');}
 return {episodes};
};
const map=()=>({mainline:'单元真实因果',ending:'第31章阶段停点',segments:[{from:20,to:31,episodes:50,focus:'只选本单元原文已有场面'}]});

test('captured 76000–86000 guessed range is rejected with chapter boundaries, then repaired without forcing full chapters',async()=>{
 const p=fixture(),source=p.creator.ip.source,calls=[],drafts=[];let groups=0;
 assert.equal(source.chapters[28].start,71708);assert.equal(source.chapters[30].end,79053);assert.equal(source.chapters[33].end,86170);
 const result=await runIPTask({project:p,task:'plan',taskId:'captured-range',profile:{model:'mock'},onDraft:d=>drafts.push(d),api:{aiChat:async r=>{
  calls.push(r);
  if(r.taskId.endsWith(':plan'))return JSON.stringify(map());
  if(r.taskId.includes(':settings'))return '【故事梗概】真实主线';
  if(r.taskId.includes(':plan-continuity-'))return continuityReply();
  const directory=JSON.parse(prompt(r).match(/本单元有效章节：\n([^\n]+)/)[1]);
  assert.ok(directory.every(c=>Number.isInteger(c.start)&&Number.isInteger(c.end)));
  assert.match(prompt(r),/不得猜数字sourceRanges/);assert.match(prompt(r),/sourceQuotes/);assert.match(prompt(r),/至少4个非空白字符/);
  const window=prompt(r).match(/完整原文窗口\[(\d+),(\d+)\)/).slice(1).map(Number);
  assert.ok(source.chapters.filter(c=>c.start<window[1]&&c.end>window[0]).every(c=>prompt(r).includes(source.content.slice(Math.max(window[0],c.start),Math.min(window[1],c.end)))),'batch receives all raw source in its allowed window');
  const response=validGroup(p,r);
  if(++groups===1)response.episodes[0].sourceRanges=[{start:76000,end:86000}];
  else if(groups===2){assert.match(prompt(r),/第\s*1\s*集.*sourceRanges.*76000.*86000/);assert.match(prompt(r),/原句定位/);assert.match(prompt(r),/79053/);assert.match(prompt(r),/删除估算偏移/);}
  return JSON.stringify(response);
 }}});
 assert.equal(result.plan.episodes.length,50);assert.equal(groups,10,'one repair plus nine completed six-episode groups');
 assert.ok(result.plan.episodes.every(e=>e.sourceRanges?.length&&e.sourceQuotes?.length));
 assert.ok(result.plan.episodes.every(e=>e.sourceRanges.every(range=>range.start>=source.chapters[28].start&&range.end<=source.chapters[30].end)));
 assert.ok(drafts.some(d=>d.type==='plan'&&d.content.includes('86000')),'the rejected numeric proposal stays in raw task records');
 assert.ok(calls.every(r=>!r.taskId.includes(':read-')),'existing valid source reading is reused');
});

test('a numeric range inside the unit cannot silently replace different declared chapter IDs',async()=>{
 const p=fixture(),source=p.creator.ip.source;let groups=0;
 const result=await runIPTask({project:p,task:'plan',taskId:'declared-source',profile:{model:'mock'},api:{aiChat:async r=>{
  if(r.taskId.endsWith(':plan'))return JSON.stringify(map());if(r.taskId.includes(':settings'))return '【故事梗概】原著';
  if(r.taskId.includes(':plan-continuity-'))return continuityReply();
  const response=validGroup(p,r);
  if(++groups===1){response.episodes[0].chapterIds=[source.chapters[28].id];response.episodes[0].sourceRanges=[{start:source.chapters[29].start+10,end:source.chapters[29].end-10}];}
  if(groups===2){assert.match(prompt(r),/sourceRanges.*原句定位.*不一致/);assert.ok(prompt(r).includes(String(source.chapters[29].start+10)));}
  return JSON.stringify(response);
 }}});
 assert.equal(result.plan.episodes.length,50);assert.equal(groups,10);
 assert.deepEqual(result.plan.episodes[0].chapterIds,[source.chapters[28].id],'actual chapter-29 anchor must not be silently replaced by a chapter-30 numeric guess');
});

test('genuine chapter IDs outside the story unit remain rejected even when numeric ranges point inside it',async()=>{
 const p=fixture(),source=p.creator.ip.source,drafts=[];let groups=0;
 await assert.rejects(()=>runIPTask({project:p,task:'plan',taskId:'outside-declared',profile:{model:'mock'},onDraft:d=>drafts.push(d),api:{aiChat:async r=>{
  if(r.taskId.endsWith(':plan'))return JSON.stringify(map());if(r.taskId.includes(':settings'))return '【故事梗概】原著';
  if(r.taskId.includes(':plan-continuity-'))return continuityReply();
  groups++;const response=validGroup(p,r);
  response.episodes[0].chapterIds=[source.chapters[34].id];response.episodes[0].sourceRanges=[{start:source.chapters[28].start,end:source.chapters[28].end}];
  return JSON.stringify(response);
 }}}),e=>e.validationCode==='IP_PLAN_SOURCE_MISMATCH'&&e.message.includes('本批允许的原文范围'));
 assert.ok(groups<20,'invalid source repair remains bounded');
 assert.ok(!drafts.some(d=>d.type==='planning-checkpoint'&&d.stage.startsWith('source-v6-segment-')),'invalid units never become complete checkpoints');
});

test('valid exact partial chapter ranges are retained and successful group checkpoints resume after a later outage',async()=>{
 const p=fixture(),source=p.creator.ip.source,diagnostics=[];let firstCalls=0,savedRange;
 await assert.rejects(()=>runIPTask({project:p,task:'plan',taskId:'source-checkpoint',profile:{model:'mock'},onDraft:d=>diagnostics.push(d),api:{aiChat:async r=>{
  if(r.taskId.endsWith(':plan'))return JSON.stringify(map());if(r.taskId.includes(':settings'))return '【故事梗概】原著';
  if(r.taskId.includes(':plan-continuity-'))return continuityReply();
  if(++firstCalls>1)throw new Error('外部服务中断');
  const response=validGroup(p,r);response.episodes.forEach(e=>{const quote=e.sourceQuotes[0];const start=source.content.indexOf(quote.startQuote);e.sourceRanges=[{start,end:start+quote.endQuote.length}];});savedRange=response.episodes[0].sourceRanges[0];return JSON.stringify(response);
 }}}),/外部服务中断/);
 p.creator.records.push({diagnostics});let resumed=0;
 const result=await runIPTask({project:p,task:'plan',taskId:'source-resume',profile:{model:'mock'},api:{aiChat:async r=>{
  if(r.taskId.includes(':plan-continuity-'))return continuityReply();
  assert.ok(r.taskId.includes(':plan-group-'),'completed map, settings and source reads must be reused');
  assert.doesNotMatch(prompt(r),/单元内第1至6集/);resumed++;return JSON.stringify(validGroup(p,r));
 }}});
 assert.equal(resumed,8);assert.equal(result.plan.episodes.length,50);assert.deepEqual(result.plan.episodes[0].sourceRanges,[savedRange]);
 assert.ok(savedRange.start>source.chapters[28].start&&savedRange.end<source.chapters[28].end,'a genuine partial chapter cut remains precise after resuming');
});
