import test from 'node:test';
import assert from 'node:assert/strict';
import {createIPProject,importIPNovel,getIPProject,applyIPPlan,updateIPDraft,confirmIPEpisode,ipHash} from './ipWorkspace.js';
import {runIPTask} from './ipAi.js';
import {IP_BUILTIN_SKILLS} from './ipBuiltinSkills.js';

const scene=n=>`场面${String(n).padStart(4,'0')}甲收到医院通知后立即赶往诊室核实病情。`;
const fixture=()=>{
 let state=createIPProject({fruitProjects:[]},{name:'有原文依据的因果故事',duration:60}),id=state.fruitProjects[0].id;
 state=importIPNovel(state,id,{content:Array.from({length:100},(_,i)=>`第${i+1}章 真实阶段${i+1}\n${scene(i+1)}\n`).join('')});
 const p=getIPProject(state,id),source=p.creator.ip.source;
 p.creator.ip.reading=[{sourceId:source.id,start:0,end:source.content.length,note:'已读事实只用于选主线，不能代替逐批原文。',readingMode:'story-index'}];
 return {state,id,p,source};
};
const map={mainline:'从收到通知到完成就诊，原著真实因果',ending:'材料已发生的诊室停点',segments:[{from:1,to:100,episodes:50,focus:'原著就诊因果'}]};
const episodes=(source,start,count)=>Array.from({length:count},(_,i)=>{const n=start+i;return {chapterIds:[source.chapters[n-1].id],outline:`角色在场面${n}收到通知与就诊，保留实际因果`,sourceQuotes:[{startQuote:scene(n),endQuote:scene(n)}]};});
const response=(source,r)=>{
 if(r.taskId.includes(':plan-continuity-'))return JSON.stringify({ok:true,issues:[]});
 if(r.taskId.includes(':settings'))return '【故事梗概】收到通知后就诊\n【人物小传】甲：原著角色';
 if(r.taskId.includes(':plan-group-')){const prompt=r.messages.at(-1).content,n=Number(prompt.match(/本次只规划 (\d+) 集/)[1]),start=Number(prompt.match(/单元内第(\d+)至/)[1]);return JSON.stringify({episodes:episodes(source,start,n)});}
 return JSON.stringify(map);
};
const args=(p,api,extra={})=>({project:p,task:'plan',taskId:'grounded-flow',profile:{model:'mock'},api,...extra});

test('continuous first edition closes only its selected segment and leaves later library chapters unused',async()=>{
 const {p,source}=fixture(),calls=[],chosen={...map,ending:'第60章的真实就诊结果',segments:[{from:1,to:60,episodes:50,focus:'选定阶段'}]};
 const api={aiChat:async r=>{calls.push(r);if(r.taskId.includes(':plan-finale'))return JSON.stringify({episodes:[...episodes(source,49,1),...episodes(source,60,1)].map(e=>({...e,chapterIds:[source.chapters[0].id]}))});if(r.taskId.includes(':plan-group-')||r.taskId.includes(':settings'))return response(source,r);return JSON.stringify(chosen);}};
 const result=await runIPTask(args(p,api,{firstDraftMode:true}));
 assert.equal(result.plan.episodes.length,50);assert.ok(result.plan.episodes.every(e=>e.sourceRanges.every(r=>r.end<=source.chapters[59].end)));
 assert.equal(result.plan.episodes.at(-1).sourceRanges.at(-1).end,source.chapters[59].start+source.content.slice(source.chapters[59].start,source.chapters[59].end).trimEnd().length);
 assert.deepEqual(result.plan.episodes.at(-1).chapterIds,[source.chapters[59].id]);
 assert.equal(calls.filter(r=>r.taskId.includes(':plan-finale')).length,1);assert.equal(calls.filter(r=>r.taskId.includes(':plan-continuity')).length,0);
});

test('a trailing standalone author ellipsis does not prevent a real final scene from closing the first edition',async()=>{
 const {p,source}=fixture();source.content+='\n　　......';source.chapters.at(-1).end=source.content.length;
 const result=await runIPTask(args(p,{aiChat:async r=>r.taskId.includes(':plan-finale')?JSON.stringify({episodes:episodes(source,99,2)}):response(source,r)},{firstDraftMode:true}));
 assert.equal(result.plan.episodes.at(-1).sourceRanges.at(-1).end,source.content.slice(0,source.content.indexOf('\n　　......')).trimEnd().length);
});

test('cached selection notes are reused, but every batch receives complete raw source and yields precise different cuts',async()=>{
 const {p,source}=fixture(),calls=[];
 const result=await runIPTask(args(p,{aiChat:async r=>{
  calls.push(r);assert.ok(!r.taskId.includes(':read-'));
  if(r.taskId.includes(':plan-group-')){const match=r.messages.at(-1).content.match(/完整原文窗口\[(\d+),(\d+)\)/);assert.ok(match);const start=Number(match[1]),end=Number(match[2]);for(const c of source.chapters.filter(c=>c.start<end&&c.end>start))assert.ok(r.messages.at(-1).content.includes(source.content.slice(Math.max(start,c.start),Math.min(end,c.end))));}
  return response(source,r);
 }}));
 assert.equal(result.plan.episodes.length,50);assert.equal(calls.filter(r=>r.taskId.includes(':plan-group-')).length,9);assert.equal(calls.filter(r=>r.taskId.includes(':plan-continuity-')).length,9);
 for(let i=1;i<50;i++)assert.ok(result.plan.episodes[i].sourceRanges[0].start>=result.plan.episodes[i-1].sourceRanges.at(-1).end);
 assert.equal(result.plan.episodes[0].sourceQuotes[0].startQuote,scene(1));
});

test('old summary-derived episode checkpoints are invalidated while the unchanged selected map and valid notes survive',async()=>{
 const {p,source}=fixture(),diagnostics=[];
 await assert.rejects(()=>runIPTask(args(p,{aiChat:async r=>{if(r.taskId.includes(':plan-group-'))throw new Error('故意中断在新分集之前');return response(source,r);}},{onDraft:d=>diagnostics.push(d)})),/故意中断/);
 const key=diagnostics.find(d=>d.type==='planning-checkpoint'&&d.stage==='map').key;
 diagnostics.push({type:'planning-checkpoint',key,sourceId:source.id,complete:true,stage:'segment-0-batch-0-12',content:JSON.stringify({episodes:[{chapterIds:[source.chapters[0].id],outline:'旧版猜测数字且无原句',sourceRanges:[{start:0,end:99}]}]})});
 p.creator.records.push({diagnostics});let maps=0,reads=0,settings=0,groups=0;
 const result=await runIPTask(args(p,{aiChat:async r=>{if(r.taskId.includes(':read-'))reads++;else if(r.taskId.includes(':settings'))settings++;else if(r.taskId.includes(':plan-group-'))groups++;else if(!r.taskId.includes(':plan-continuity-'))maps++;return response(source,r);} }));
 assert.equal(result.plan.episodes.length,50);assert.equal(maps,0);assert.equal(reads,0);assert.equal(settings,0);assert.equal(groups,9);assert.ok(!result.plan.episodes.some(e=>e.outline.includes('旧版猜测')));
});

test('an initial full episode list without exact source anchors falls back to its complete map and real-source batching',async()=>{
 const {p,source}=fixture(),calls=[];
 const result=await runIPTask(args(p,{aiChat:async r=>{calls.push(r);if(r.taskId.endsWith(':plan')||r.taskId.endsWith(':plan-repair'))return JSON.stringify({...map,episodes:Array.from({length:50},(_,i)=>({chapterIds:[source.chapters[0].id],outline:`假的不同场面${i+1}`,sourceRanges:[{start:0,end:99}]}))});return response(source,r);}}));
 assert.equal(result.plan.episodes.length,50);assert.equal(calls.filter(r=>r.taskId.includes(':plan-map')).length,0);assert.ok(calls.some(r=>r.taskId.includes(':plan-group-')));assert.ok(result.plan.episodes.every(e=>e.sourceQuotes?.length));
});

test('an audited single-episode prefix resumes directly even when the normal batch size is six',async()=>{
 const {p,source}=fixture(),diagnostics=[];let singles=0;
 await assert.rejects(()=>runIPTask(args(p,{aiChat:async r=>{
  if(r.taskId.includes(':plan-group-')){
   const count=Number(r.messages.at(-1).content.match(/本次只规划 (\d+) 集/)[1]);
   if(count>1)throw Object.assign(new Error('预算截断，安全拆小批'),{code:'OUTPUT_TRUNCATED',partialText:'{"episodes":['});
   if(++singles>1)throw new Error('外部服务中断');
  }
  return response(source,r);
 }},{onDraft:d=>diagnostics.push(d)})),/外部服务中断/);
 const prefix=diagnostics.find(d=>d.type==='planning-checkpoint'&&d.stage.endsWith('-batch-0-1'));
 assert.ok(prefix,'the first actual single episode passed both source and causal checks before the outage');
 p.creator.records.push({diagnostics});const calls=[];
 const result=await runIPTask(args(p,{aiChat:async r=>{
  calls.push(r);
  if(r.taskId.includes(':plan-group-'))assert.doesNotMatch(r.messages.at(-1).content,/单元内第1至/,'the paid verified first episode must not be requested again');
  return response(source,r);
 }}));
 assert.equal(result.plan.episodes.length,50);
 assert.deepEqual(result.plan.episodes[0].sourceRanges,JSON.parse(prefix.content).episodes[0].sourceRanges);
 assert.ok(calls.some(r=>r.taskId.includes(':plan-group-')&&/单元内第2至6集/.test(r.messages.at(-1).content)));
 assert.ok(calls.every(r=>!r.taskId.includes(':read-')&&!r.taskId.includes(':settings')&&!r.taskId.endsWith(':plan')));
});

test('a causal omission reported against full skipped source triggers bounded repair instead of certifying a matched quote',async()=>{
 const {p,source}=fixture(),diagnostics=[];let audits=0,repairs=0;
 const result=await runIPTask(args(p,{aiChat:async r=>{
  if(r.taskId.includes(':plan-continuity-')){audits++;assert.ok(r.messages.at(-1).content.includes(scene(2)));if(audits===1)return JSON.stringify({ok:false,issues:['第2集从发现疾病直接进入病房，省掉原著已经写明的劝治与接受治疗。']});return JSON.stringify({ok:true,issues:[]});}
  if(r.taskId.includes(':plan-group-')&&r.taskId.endsWith('-repair')){repairs++;assert.match(r.messages.at(-1).content,/省掉原著已经写明的劝治/);}
  return response(source,r);
 }},{onDraft:d=>diagnostics.push(d)}));
 assert.equal(result.plan.episodes.length,50);assert.equal(repairs,1);assert.equal(audits,10);assert.ok(diagnostics.some(d=>d.type==='plan-continuity'&&d.content.includes('劝治')));
});

test('a locally grounded candidate survives an audit outage, and resume pays only for its missing audit',async()=>{
 const {p,source}=fixture(),diagnostics=[];let groups=0,audits=0;
 await assert.rejects(()=>runIPTask(args(p,{aiChat:async r=>{
  if(r.taskId.includes(':plan-group-'))groups++;
  if(r.taskId.includes(':plan-continuity-')){audits++;throw Object.assign(new Error('审稿接口暂时中断'),{code:'STREAM_INCOMPLETE',partialText:'{"ok":'});}
  return response(source,r);
 }},{onDraft:d=>diagnostics.push(d)})),error=>error.code==='STREAM_INCOMPLETE');
 assert.equal(groups,1,'no paid candidate regeneration for an audit-only transport error');assert.equal(audits,1);
 const pending=diagnostics.find(d=>d.type==='planning-checkpoint'&&d.stage.endsWith('-candidate'));
 assert.ok(pending,'matched source cuts remain pending rather than being discarded or certified');
 assert.ok(!diagnostics.some(d=>d.type==='planning-checkpoint'&&d.stage.endsWith('-batch-0-6')),'a missing audit cannot become a completed batch');
 p.creator.records.push({diagnostics});const resumed=[];
 const result=await runIPTask(args(p,{aiChat:async r=>{resumed.push(r);if(r.taskId.includes(':plan-group-'))assert.doesNotMatch(r.messages.at(-1).content,/单元内第1至6集/);return response(source,r);}}));
 assert.equal(result.plan.episodes.length,50);
 assert.equal(resumed.filter(r=>r.taskId.includes(':plan-group-')).length,8);
 assert.equal(resumed.filter(r=>r.taskId.includes(':plan-continuity-')).length,9);
});

test('an explicit model content filter in the audit stops unchanged and never retries candidate formatting',async()=>{
 const {p,source}=fixture(),diagnostics=[];let groups=0,audits=0;
 await assert.rejects(()=>runIPTask(args(p,{aiChat:async r=>{
  if(r.taskId.includes(':plan-group-'))groups++;
  if(r.taskId.includes(':plan-continuity-')){audits++;throw Object.assign(new Error('模型明确拒绝本次请求'),{code:'MODEL_CONTENT_FILTER'});}
  return response(source,r);
 }},{onDraft:d=>diagnostics.push(d)})),error=>error.code==='MODEL_CONTENT_FILTER');
 assert.equal(groups,1);assert.equal(audits,1);assert.ok(diagnostics.some(d=>d.type==='planning-checkpoint'&&d.stage.endsWith('-candidate')));
});

test('cached downstream source cuts are audited again when the preceding outline changes, without paying to regenerate those cuts',async()=>{
 const {p,source}=fixture(),diagnostics=[];
 await runIPTask(args(p,{aiChat:async r=>response(source,r)},{onDraft:d=>diagnostics.push(d)}));
 const first=diagnostics.find(d=>d.type==='planning-checkpoint'&&d.stage.endsWith('-batch-0-6'));
 const revised=JSON.parse(first.content);revised.episodes[0].outline+='，本段接点现明确为收到医院通知';first.content=JSON.stringify(revised);
 p.creator.records.push({diagnostics});let groups=0,audits=0;
 const result=await runIPTask(args(p,{aiChat:async r=>{if(r.taskId.includes(':plan-group-'))groups++;if(r.taskId.includes(':plan-continuity-'))audits++;return response(source,r);}}));
 assert.equal(result.plan.episodes.length,50);assert.equal(groups,0);assert.equal(audits,8,'later causal approvals depend on the actual prior story, not only the same map key');
});

test('adopting changed sources clears the changed episode and all downstream bodies while preserving every old full version',()=>{
 let {state,id,p,source}=fixture();const first={...map,episodes:episodes(source,1,50)};
 state=applyIPPlan(state,id,first);p=getIPProject(state,id);
 for(let i=1;i<=3;i++){state=updateIPDraft(state,id,p.episodes[i].id,`旧正文${i}：完整对白与动作`);if(i===1)state=confirmIPEpisode(state,id,p.episodes[i].id);}
 p=getIPProject(state,id);const changed={...first,episodes:first.episodes.map((e,i)=>i===1?{...e,outline:'新的真实故事切点'}:e)};
 state=applyIPPlan(state,id,changed);p=getIPProject(state,id);
 assert.match(p.episodes[1].scriptText,/旧正文1/);assert.equal(p.episodes[2].scriptText,'');assert.equal(p.episodes[3].scriptText,'');
 for(let i=1;i<=3;i++){assert.ok(p.episodes[i].ipVersions.some(v=>v.content===`旧正文${i}：完整对白与动作`));assert.equal(p.episodes[i].finalConfirmed,false);}
 assert.equal(p.episodes[2].ipVersions.at(-1).outline,first.episodes[1].outline);
});
