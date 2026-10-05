import test from 'node:test';
import assert from 'node:assert/strict';
import {createIPProject,importIPNovel,getIPProject,validateIPPlan,ipOriginal} from './ipWorkspace.js';
import {purposeReadingJobs,sourceOpeningPolicy,fitEpisodeBudget,purposeReadingLimit} from './ipReading.js';
import {runIPTask} from './ipAi.js';

const fixture=(content,duration=120)=>{
 let state=createIPProject({fruitProjects:[]},{name:'素材库目的性选材',duration,readConcurrency:4}),id=state.fruitProjects[0].id;
 state=importIPNovel(state,id,{content});return getIPProject(state,id);
};
const prompt=r=>r.messages.map(m=>m.content).join('\n');
const groupOutline=(r,i,label)=>`${label} ${Number(prompt(r).match(/单元内第(\d+)至/)[1])+i}`;
const book=(first,count,repeat=1)=>Array.from({length:count},(_,i)=>`第${first+i}章 ${i<2?'旧世界前史':i<5?'新星球主线':'未入选后续'}\n${'角色沿原著因果推进。'.repeat(repeat)}原著真实阶段停点。\n`).join('');

test('capacity-sized source selects a middle story and returns full planning in one model request',async()=>{
 const project=fixture(book(501,10)),source=project.creator.ip.source,calls=[],reads=[],drafts=[];
 const start=source.chapters[2].start+10,end=source.chapters[4].end-4;
 const result=await runIPTask({project,task:'plan',taskId:'purpose-whole',profile:{model:'mock'},onRead:r=>reads.push(r),onDraft:d=>drafts.push(d),api:{aiChat:async r=>{
  calls.push(r);
  if(r.taskId.includes(':settings')){
   assert.doesNotMatch(r.messages.at(-1).content,/角色沿原著因果推进。原著真实阶段停点。\n\n【.*第501章/);
   assert.match(r.messages.at(-1).content,/所选故事|选中故事原文/);return '【故事梗概】所选故事\n【人物小传】原著人物';
  }
  assert.match(prompt(r),/小说是可选材的素材库/);assert.match(prompt(r),/小说第501章/);assert.match(prompt(r),/无需覆盖全部章节/);
  assert.ok(r.messages.at(-1).content.includes(source.content));
  return JSON.stringify({mainline:'新星球目标与冲突',ending:'第505章原著阶段停点',notes:'只选第503至505章；前段作背景，后续留在素材库',readingIndex:'第501至502章前史；第503章新星球起点；第505章已有结果；第506章之后另一个故事',segments:[{from:3,to:5,episodes:80,focus:'新星球独立因果链'}],episodes:Array.from({length:80},(_,i)=>({chapterIds:[source.chapters[2].id],sourceRanges:[{start,end}],outline:`所选故事的真实动作和接点${i+1}`}))});
 }}});
 assert.equal(result.plan.episodes.length,80);assert.deepEqual(calls.map(r=>r.taskId),['purpose-whole:plan','purpose-whole:settings']);
 assert.equal(reads.length,1);assert.equal(reads[0].readingMode,'story-selection');assert.equal(reads[0].end,source.content.length);
 const sample=result.plan.episodes[0];assert.equal(ipOriginal(project,sample),source.content.slice(start,end));
 assert.ok(result.plan.episodes.every(e=>!e.chapterIds.includes(source.chapters.at(-1).id)));
 assert.ok(drafts.some(d=>d.type==='settings-ready'));
});

test('continuous story reading batches reduce a 500-chapter request fanout while retaining verbatim coverage',()=>{
 const project=fixture(book(501,500,270)),source=project.creator.ip.source;
 const {jobs,reused}=purposeReadingJobs(source,[],48000);
 assert.equal(reused.length,0);assert.ok(jobs.length<50,`Expected fewer than 50 story batches, got ${jobs.length}`);
 assert.ok(jobs.some(j=>j.chapter.chapters.length>5));assert.equal(jobs.map(j=>source.content.slice(j.start,j.end)).join(''),source.content);
 assert.ok(jobs.every(j=>j.end-j.start<=48000));
});

test('cold long-source planning keeps capacity-sized story indexes intact without mechanical digest requests',async()=>{
 const project=fixture(book(501,500,270)),source=project.creator.ip.source,calls=[],reads=[];
 const result=await runIPTask({project,task:'plan',taskId:'purpose-cold',profile:{model:'mock'},onRead:r=>reads.push(r),api:{aiChat:async r=>{
  calls.push(r);
  if(r.taskId.includes(':read-'))return `故事索引${r.taskId}：${'真实目标、因果、起点与阶段停点。'.repeat(65)}`;
  if(r.taskId.includes(':digest-'))throw new Error('容量内的故事索引不应机械再次压缩');
  if(r.taskId.includes(':settings'))return '【故事梗概】只提取已选故事';
  assert.match(prompt(r),/故事索引purpose-cold:read-/);
  return JSON.stringify({mainline:'只选中部完整因果链',ending:'所选真实阶段停点',segments:[{from:3,to:23,episodes:80,focus:'素材库只选一个故事'}],episodes:Array.from({length:80},(_,i)=>({chapterIds:[source.chapters[2].id],outline:`真实分集故事切点${i+1}`}))});
 }}});
 assert.equal(result.plan.episodes.length,80);assert.ok(calls.length<40,`Cold planning made ${calls.length} requests`);
 assert.equal(calls.length,reads.length+2);assert.ok(reads.length<35);
 assert.equal(reads.slice().sort((a,b)=>a.start-b.start).map(r=>source.content.slice(r.start,r.end)).join(''),source.content);
});

test('automatic full planning repairs blank or copied episode details before accepting them',async t=>{
 for(const failure of ['blank','copied'])await t.test(failure,async()=>{
  const project=fixture(book(1,8)),source=project.creator.ip.source;let attempts=0;
  const result=await runIPTask({project,task:'plan',taskId:`purpose-detail-${failure}`,profile:{model:'mock'},api:{aiChat:async r=>{
   if(r.taskId.includes(':settings'))return '【故事梗概】原著故事';
   attempts++;if(attempts===2)assert.match(prompt(r),failure==='blank'?/非空|空集/:/完全重复|复制同一集/);
   return JSON.stringify({mainline:'真实因果',ending:'真实停点',segments:[{from:1,to:6,episodes:80,focus:'主线'}],episodes:Array.from({length:80},(_,i)=>({chapterIds:[source.chapters[0].id],outline:attempts===1?(failure==='blank'?'':'重复的同一场面'):`真实不同故事切点${i+1}`}))});
  }}});
  assert.equal(attempts,2);assert.equal(result.plan.episodes.length,80);
 });
});

test('near-capacity structural repair drops oversized prior output while retaining complete source and Skill',async()=>{
 const project=fixture(book(1,6,100)),source=project.creator.ip.source;let plans=0;
 const result=await runIPTask({project,task:'plan',taskId:'purpose-capacity-repair',profile:{model:'mock',contextWindowTokens:58000},api:{aiChat:async r=>{
  if(r.taskId.includes(':settings'))return '【故事梗概】原著事实';
  assert.ok(r.messages.at(-1).content.includes(source.content));
  assert.ok(r.messages.some(m=>m.content.includes('小说是可选材的素材库')));
  if(++plans===1)return '不合法上次长结果'.repeat(12000);
  assert.match(prompt(r),/上次结果已单独保存/);assert.doesNotMatch(prompt(r),/不合法上次长结果/);
  return JSON.stringify({mainline:'原著主线',ending:'原著停点',segments:[{from:1,to:5,episodes:80,focus:'真实故事'}],episodes:Array.from({length:80},(_,i)=>({chapterIds:[source.chapters[0].id],outline:`原著切点${i+1}`}))});
 }}});
 assert.equal(plans,2);assert.equal(result.plan.episodes.length,80);
});

test('explicit settings refresh reuses selected raw material from a whole-source selection cache',async()=>{
 const project=fixture(book(501,9)),source=project.creator.ip.source,calls=[];
 project.creator.ip.reading=[{sourceId:source.id,start:0,end:source.content.length,note:'很短的主线选择索引',readingMode:'story-selection'}];
 project.creator.ip.plan={sourceId:source.id,mainline:'新星球故事',ending:'真实停点',segments:[{from:3,to:5,episodes:80}],episodes:Array.from({length:80},(_,i)=>({chapterIds:[source.chapters[2].id],outline:`故事切点${i+1}`}))};
 await runIPTask({project,task:'settings',episodeId:project.episodes[0].id,taskId:'purpose-settings-refresh',profile:{model:'mock'},api:{aiChat:async r=>{
  calls.push(r);assert.ok(r.messages.at(-1).content.includes(source.content.slice(source.chapters[2].start,source.chapters[4].end))===false,'selected chapters have headers between them');
  assert.ok(r.messages.at(-1).content.includes(source.content.slice(source.chapters[2].start,source.chapters[2].end)));
  assert.ok(!r.messages.at(-1).content.includes(source.content.slice(source.chapters[8].start,source.chapters[8].end)));
  return '【故事梗概】原著已选主线\n【人物小传】选中故事的人物';
 }}});
 assert.equal(calls.length,1);assert.ok(calls[0].taskId.endsWith(':settings'));
});

test('old completed interval notes are reused over chapter boundaries without another source request',async()=>{
 const project=fixture(book(501,30)),source=project.creator.ip.source,calls=[];
 project.creator.ip.reading=source.chapters.map(c=>({sourceId:source.id,chapterId:c.id,start:c.start,end:c.end,note:`${c.title}：已有事实索引`}));
 await runIPTask({project,task:'plan',taskId:'purpose-cached',profile:{model:'mock'},api:{aiChat:async r=>{
  calls.push(r);if(r.taskId.includes(':settings'))return '【故事梗概】已读素材中所选故事';
  if(r.taskId.includes(':plan-group-')){const count=Number(prompt(r).match(/本次只规划 (\d+) 集/)[1]);assert.ok(count<=12);return JSON.stringify({episodes:Array.from({length:count},(_,i)=>({chapterIds:[source.chapters[5].id],outline:groupOutline(r,i,'入选场面')}))});}
  return JSON.stringify({mainline:'从第506章开始的故事',ending:'第516章真实停点',segments:[{from:6,to:16,episodes:80,focus:'选中单元'}]});
 }}});
 assert.equal(calls.filter(r=>r.taskId.includes(':read-')).length,0);assert.equal(calls.filter(r=>r.taskId.includes(':digest-')).length,0);
 assert.equal(calls.filter(r=>r.taskId.includes(':plan-group-')).length,7);
});

test('opening preference uses actual source chapter numbers, including a prefatory parsed record',()=>{
 const complete=fixture('书名\n第一章 故事开篇\n原著开头\n第二章 后续\n原著事实'),middle=fixture('书名\n第501章 旧前史\n原著事实\n第502章 新目标\n原著事实');
 assert.equal(complete.creator.ip.source.chapters[0].title,'序／开篇材料');
 assert.match(sourceOpeningPolicy(complete.creator.ip.source),/优先从第1章/);
 assert.match(sourceOpeningPolicy(middle.creator.ip.source),/小说第501章/);assert.match(sourceOpeningPolicy(middle.creator.ip.source),/不受文件首尾限制/);
});

test('reasonable plans over one hundred episodes remain valid and extreme counts trigger story reselection',async()=>{
 const project=fixture(book(1,4)),source=project.creator.ip.source;
 for(const count of [120,10000]){
  const requests=[];let maps=0;
  const result=await runIPTask({project,task:'plan',taskId:`purpose-count-${count}`,profile:{model:'mock'},api:{aiChat:async r=>{
   requests.push(r);if(r.taskId.includes(':settings'))return '【故事梗概】原著事实';
   if(r.taskId.includes(':plan-group-')){const n=Number(prompt(r).match(/本次只规划 (\d+) 集/)[1]);return JSON.stringify({episodes:Array.from({length:n},(_,i)=>({chapterIds:[source.chapters[count===10000?1:0].id],outline:groupOutline(r,i,'原著选中场面')}))});}
   maps++;
   if(count===10000&&maps>1){assert.match(prompt(r),/重新选择更合适的开头/);assert.match(prompt(r),/不能仅把集数改小/);return JSON.stringify({mainline:'重新选中较小完整故事',ending:'原著阶段结果',segments:[{from:2,to:2,episodes:80,focus:'只选中的因果单元'}]});}
   return JSON.stringify({mainline:'已有真实因果',ending:'原著收束',segments:[{from:1,to:4,episodes:count,focus:'初始整个素材'}]});
  }}});
  assert.equal(result.plan.episodes.length,count===120?120:80);assert.ok(requests.length<15);
  if(count===10000)assert.equal(result.plan.segments[0].from,2);
 }
 assert.equal(fitEpisodeBudget([{from:2,to:3,episodes:9000},{from:4,to:4,episodes:1000}],80).reduce((n,s)=>n+s.episodes,0),80);
 assert.throws(()=>validateIPPlan({episodes:Array.from({length:49},()=>({chapterIds:[source.chapters[0].id]}))},source,60),/至少50集/);
 assert.throws(()=>validateIPPlan({episodes:Array.from({length:79},()=>({chapterIds:[source.chapters[0].id]}))},source,120),/至少80集/);
});

test('declared smaller capacity reduces purpose batches and cancellation never marks the direct source as read',async()=>{
 assert.ok(purposeReadingLimit({contextWindowTokens:40000},[{role:'system',content:'规则'.repeat(8000)}])<48000);
 const project=fixture(book(1,6)),reads=[];let cancelled=false;
 await assert.rejects(()=>runIPTask({project,task:'plan',taskId:'purpose-cancel',profile:{model:'mock'},isCancelled:()=>cancelled,onRead:r=>reads.push(r),api:{aiChat:async()=>{cancelled=true;return {ok:false,error:'取消',partialText:'保存的付费半段'};}}}),e=>/停止/.test(e.message)&&e.partialText==='保存的付费半段');
 assert.equal(reads.length,0);
});

test('fixed Skill and directory capacity failure occurs before the first paid reading request',async()=>{
 const project=fixture(book(501,500,2));let calls=0;
 await assert.rejects(()=>runIPTask({project,task:'plan',taskId:'purpose-fixed-capacity',profile:{model:'mock',contextWindowTokens:4096},api:{aiChat:async()=>{calls++;throw new Error('不应调用');}}}),/完整 Skill|上下文/);
 assert.equal(calls,0);
});

test('malformed surrogate cache boundaries are ignored and purpose reading always advances',()=>{
 const source={id:'unicode-source',content:'😀文😀字',chapters:[{id:'chapter',title:'第一章 开篇',start:0,end:7}]};
 const {reused,jobs}=purposeReadingJobs(source,[{sourceId:source.id,start:1,end:2,note:'旧损坏缓存'},{sourceId:source.id,start:2,end:4,note:'另一损坏缓存'}],2);
 assert.equal(reused.length,0);assert.ok(jobs.every(j=>j.end>j.start));assert.equal(jobs.map(j=>source.content.slice(j.start,j.end)).join(''),source.content);
});

test('compact whole-source map checkpoint is resumed without repeating mainline selection after a later failure',async()=>{
 const project=fixture(book(501,6)),source=project.creator.ip.source,diagnostics=[],reads=[];let planCalls=0;
 const map={mainline:'已选中段主线',ending:'真实停点',segments:[{from:2,to:3,episodes:80,focus:'已选单元'}]};
 await assert.rejects(()=>runIPTask({project,task:'plan',taskId:'purpose-first',profile:{model:'mock'},onDraft:d=>diagnostics.push(d),onRead:r=>reads.push(r),api:{aiChat:async r=>{if(r.taskId.includes(':settings'))return {ok:false,error:'设定网络中断'};planCalls++;return JSON.stringify(map);}}}),/网络中断/);
 project.creator.records=[{diagnostics}];project.creator.ip.reading=reads;
 const result=await runIPTask({project,task:'plan',taskId:'purpose-resume',profile:{model:'mock'},api:{aiChat:async r=>{if(r.taskId.includes(':settings'))return '【故事梗概】已有主线';if(r.taskId.includes(':plan-group-'))return JSON.stringify({episodes:Array.from({length:Number(prompt(r).match(/本次只规划 (\d+) 集/)[1])},(_,i)=>({chapterIds:[source.chapters[1].id],outline:groupOutline(r,i,'本单元原著场面')}))});planCalls++;throw new Error('不应重复已完成选材');}}});
 assert.equal(result.plan.episodes.length,80);assert.equal(planCalls,1);
});

test('explicit reading capacity refusal splits only rejected input and retains Unicode source coverage',async()=>{
 const project=fixture(book(501,12,450)+'😀'),source=project.creator.ip.source,reads=[];let refused=0;
 const result=await runIPTask({project,task:'plan',taskId:'purpose-adaptive-input',profile:{model:'mock'},onRead:r=>reads.push(r),api:{aiChat:async r=>{
  if(r.taskId.includes(':read-')){
   const [,start,end]=r.taskId.match(/:read-(\d+)-(\d+)$/).map(Number);
   if(end-start>24000){refused++;return {ok:false,code:'CONTEXT_LENGTH_EXCEEDED',error:'maximum context length exceeded'};}
   assert.ok(!(source.content.charCodeAt(start)>=0xdc00&&source.content.charCodeAt(start)<=0xdfff));
   return '已完整阅读当前原文：选材开头、因果目标与真实阶段停点。';
  }
  if(r.taskId.includes(':settings'))return '【故事梗概】所选原著事实';
  return JSON.stringify({mainline:'原著完整因果',ending:'真实阶段停点',segments:[{from:2,to:4,episodes:80,focus:'已选主线'}],episodes:Array.from({length:80},(_,i)=>({chapterIds:[source.chapters[1].id],outline:`各集原著场面${i+1}`}))});
 }}});
 assert.ok(refused>0);assert.equal(result.plan.episodes.length,80);
 assert.equal(reads.slice().sort((a,b)=>a.start-b.start).map(r=>source.content.slice(r.start,r.end)).join(''),source.content);
 assert.ok(reads.every(r=>r.end-r.start<=24000));
});

test('reading does not retry authentication, quota, network errors, or capacity refusals carrying paid output',async t=>{
 for(const failure of [
  {code:'AUTHENTICATION_FAILED',error:'登录失效'},
  {code:'WEB_QUOTA_EXHAUSTED',error:'额度达到上限'},
  {code:'NETWORK_ERROR',error:'连接中断'},
  {code:'INPUT_TOO_LONG',error:'输入过长',partialText:'已产生的付费内容'}
 ])await t.test(failure.code,async()=>{
  const project=fixture(book(501,12,450)),reads=[],drafts=[];let calls=0;
  project.creator.ip.readConcurrency=1;
  await assert.rejects(()=>runIPTask({project,task:'plan',taskId:'purpose-no-repeat',profile:{model:'mock'},onRead:r=>reads.push(r),onDraft:d=>drafts.push(d),api:{aiChat:async()=>{calls++;return {ok:false,...failure};}}}),e=>e.code===failure.code);
  assert.equal(calls,1);assert.equal(reads.length,0);
  if(failure.partialText)assert.equal(drafts[0].content,failure.partialText);
 });
});
