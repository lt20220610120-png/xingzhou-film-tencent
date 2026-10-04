import test from 'node:test';
import assert from 'node:assert/strict';
import { createIPProject, importIPNovel, getIPProject } from './ipWorkspace.js';
import { runIPTask } from './ipAi.js';
import { IP_BUILTIN_SKILLS } from './ipBuiltinSkills.js';

const truncated=partialText=>({ok:false,code:'FAILED',error:'模型输出被截断，尚未完整生成。',partialText});
function novel(content){let s=createIPProject({fruitProjects:[]},{name:'读取边界',duration:60});const id=s.fruitProjects[0].id;s=importIPNovel(s,id,{name:'原文.txt',content});return getIPProject(s,id);}
const direct=p=>JSON.stringify({mainline:'原文主线',ending:'材料实际末句',notes:'保留事实',episodes:[{chapterIds:p.creator.ip.source.chapters.map(c=>c.id),outline:'原著场面'}]});
const text=r=>r.messages.map(m=>m.content).join('\n');
const range=r=>{if(!r.taskId.includes(':read-'))return null;const m=text(r).match(/字符 \[(\d+),(\d+)\)/);return m&&{start:Number(m[1]),end:Number(m[2])};};

test('truncated first read splits exact source intervals, saves only completed notes and disables DeepSeek thinking',async()=>{
 const p=novel('第一章 开篇\n'+'原文事实。'.repeat(1100)+'真实最后一句'),reads=[],requests=[],drafts=[];let failed=false;
 const result=await runIPTask({project:p,task:'plan',profile:{model:'cn:deepseek-v4.1-flash'},taskId:'split',onRead:r=>reads.push(r),onDraft:d=>drafts.push(d),api:{aiChat:async r=>{requests.push(r);if(range(r)){if(!failed){failed=true;return truncated('不能算读完的半段');}return '已完整阅读当前区间，保留末句。';}return direct(p);}}});
 assert.equal(result.plan.episodes.length,1);assert.equal(reads.map(r=>p.creator.ip.source.content.slice(r.start,r.end)).join(''),p.creator.ip.source.content);
 assert.ok(reads.every(r=>r.note!=='不能算读完的半段'));assert.ok(drafts.some(d=>d.content==='不能算读完的半段'));
 assert.ok(requests.every(r=>r.analysisMode===true));assert.ok(requests.filter(r=>range(r)).every(r=>r.maxOutputTokens<=4096));
});

test('resume accepts successful adaptive and legacy intervals without reading those bytes again',async()=>{
 const p=novel('第一章 开篇\n'+'事实'.repeat(4100)),source=p.creator.ip.source,reads=[];
 p.creator.ip.reading=[{sourceId:source.id,chapterId:source.chapters[0].id,start:0,end:2100,note:'旧成功记录'},{sourceId:source.id,chapterId:source.chapters[0].id,start:2100,end:6400,note:'旧版较长成功记录'}];
 await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'resume',onRead:r=>reads.push(r),api:{aiChat:async r=>range(r)?'余下真实事实':direct(p)}});
 assert.equal(reads[0].start,6400);assert.equal(reads.reduce((n,r)=>n+r.end-r.start,0),source.content.length-6400);
});

test('long-novel planning reduces bounded factual batches then generates episode groups with complete Skill',async()=>{
 const p=novel(Array.from({length:30},(_,i)=>`第${i+1}章 场面${i+1}\n事实${i+1}。\n`).join('')),requests=[];
 const result=await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'long',api:{aiChat:async r=>{requests.push(r);if(range(r))return '事件、人物、场面与真实停点。'.repeat(100);if(r.taskId.includes(':digest-'))return '贯通事实与原文真实停点；各章场面来源仍在通读记录。';if(r.taskId.includes(':plan-group-')){const input=text(r),ids=JSON.parse(input.match(/本单元有效章节：\n([^\n]+)/)[1]).map(c=>c.id),count=Number(input.match(/本次只规划 (\d+) 集/)[1]);return JSON.stringify({episodes:Array.from({length:count},()=>({chapterIds:ids,outline:'有原文依据的场面和接点'}))});}return JSON.stringify({mainline:'从第1章推进至第30章',ending:'第30章真实停点',notes:'材料范围明确',segments:[{from:1,to:15,episodes:4,focus:'前半主线'},{from:16,to:30,episodes:4,focus:'后半收束'}]});}}});
 assert.equal(result.plan.episodes.length,8);assert.ok(requests.some(r=>r.taskId.includes(':digest-')));assert.ok(requests.filter(r=>r.taskId.includes(':plan-group-')).length>=4);
 for(const r of requests.filter(r=>!range(r))){for(const file of IP_BUILTIN_SKILLS[0].files)assert.ok(text(r).includes(file.content));}
 assert.deepEqual(result.plan.episodes.at(-1).chapterIds,p.creator.ip.source.chapters.slice(15).map(c=>c.id));
});

test('truncated whole planning switches to compact map and splits a truncated episode group',async()=>{
 const p=novel('第一章 开始\n相识。\n第二章 转折\n误会。\n第三章 收束\n原文结局。'),drafts=[];let mapFailed=false,groupFailed=false;
 const result=await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'plan-truncate',onDraft:d=>drafts.push(d),api:{aiChat:async r=>{
  if(range(r))return '原文事实笔记';if(r.taskId.endsWith(':plan')&&!mapFailed){mapFailed=true;return truncated('{"episodes":[未完整');}
  if(r.taskId.includes(':plan-group-')){if(!groupFailed){groupFailed=true;return truncated('未完整分集');}const n=Number(text(r).match(/本次只规划 (\d+) 集/)[1]);return JSON.stringify({episodes:Array.from({length:n},()=>({chapterIds:[p.creator.ip.source.chapters[0].id],outline:'原文场面'}))});}
  return JSON.stringify({mainline:'相识误会收束',ending:'实际结局',notes:'只选原文',segments:[{from:1,to:3,episodes:3,focus:'完整主线'}]});
 }}});
 assert.equal(result.plan.episodes.length,3);assert.ok(drafts.some(d=>d.content==='{"episodes":[未完整'));assert.ok(drafts.some(d=>d.content==='未完整分集'));
});

test('invalid JSON is retained and bounded repair cannot fabricate a valid planning result',async()=>{
 const p=novel('第一章 原文\n已有事实'),drafts=[];let generationCalls=0;
 await assert.rejects(()=>runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'invalid',onDraft:d=>drafts.push(d),api:{aiChat:async r=>{if(range(r))return '有效完整笔记';generationCalls++;return '不合法的 JSON 输出';}}}),/结构/);
 assert.equal(generationCalls,2);assert.ok(drafts.every(d=>d.content==='不合法的 JSON 输出'));
});

test('repeated truncation terminates without claiming any coverage and cancellation prevents split retries',async()=>{
 const p=novel('第一章 原文\n'+'甲'.repeat(3500)),reads=[];let calls=0;
 await assert.rejects(()=>runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'bounded',onRead:r=>reads.push(r),api:{aiChat:async()=>{calls++;return truncated('不完整');}}}),/截断/);
 assert.equal(reads.length,0);assert.ok(calls<10);
 let cancelled=false;calls=0;
 await assert.rejects(()=>runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'cancel',isCancelled:()=>cancelled,api:{aiChat:async()=>{calls++;cancelled=true;return truncated('取消时保留文字');}}}),e=>/停止/.test(e.message)&&e.partialText==='取消时保留文字');assert.equal(calls,1);
});

test('settings truncation produces completed smaller sections and keeps paid partial text separately',async()=>{
 const p=novel('第一章 原文\n甲登场。\n第二章 后续\n乙登场。'),drafts=[];let characterCalls=0;
 const result=await runIPTask({project:p,task:'settings',episodeId:p.episodes[0].id,profile:{model:'m'},taskId:'settings',onDraft:d=>drafts.push(d),api:{aiChat:async r=>{
  if(range(r))return '人物与命运的已发生事实';if(r.taskId.endsWith(':settings'))return truncated('未完整的人物小传');
  if(r.taskId.endsWith(':settings-overview'))return '【故事梗概】已发生的故事\n【核心标签】\n【核心设定】';
  characterCalls++;if(characterCalls===1)return truncated('未完整的批次');return text(r).includes('第一章')?'【人物小传】甲：原文已发生事实':'【人物小传】乙：原文已发生事实';
 }}});
 assert.match(result.content,/甲：原文已发生事实/);assert.match(result.content,/乙：原文已发生事实/);assert.doesNotMatch(result.content,/未完整/);assert.ok(drafts.some(d=>d.content==='未完整的人物小传'));assert.ok(drafts.some(d=>d.content==='未完整的批次'));
});

test('reading boundaries never split a Unicode supplementary character into unpaired surrogates',async()=>{
 const p=novel('第一章 原文\n'+'甲'.repeat(3192)+'😀'+'乙'.repeat(3400)),reads=[];
 await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'unicode',onRead:r=>reads.push(r),api:{aiChat:async r=>range(r)?'完整事实':direct(p)}});
 const source=p.creator.ip.source.content;
 for(const r of reads){const first=source.charCodeAt(r.start),last=source.charCodeAt(r.end-1);assert.ok(!(first>=0xdc00&&first<=0xdfff));assert.ok(!(last>=0xd800&&last<=0xdbff));}
 assert.equal(reads.map(r=>source.slice(r.start,r.end)).join(''),source);
});

test('completed settings sections survive failure or cancellation of a later paid character batch',async t=>{
 for(const outcome of ['failure','cancel'])await t.test(outcome,async()=>{
  const p=novel('第一章 开篇\n甲登场。\n第二章 后续\n乙登场。'),drafts=[];let characterCalls=0,cancelled=false;
  await assert.rejects(()=>runIPTask({project:p,task:'settings',episodeId:p.episodes[0].id,profile:{model:'m'},taskId:'retained-settings',isCancelled:()=>cancelled,onDraft:d=>drafts.push(d),api:{aiChat:async r=>{
   if(range(r))return '完整事实'.repeat(1200);
   if(r.taskId.endsWith(':settings'))return truncated('未完成总提取');
   if(r.taskId.endsWith(':settings-overview'))return '【故事梗概】已完成概览\n【核心设定】原文规则';
   characterCalls++;
   if(characterCalls===1)return '【人物小传】甲：已经付费完成的人物资料';
   if(outcome==='cancel')cancelled=true;
   return {ok:false,error:outcome==='cancel'?'任务停止':'后续网络中断',partialText:'乙的未完成资料'};
  }}}),outcome==='cancel'?/停止/:/后续网络中断/);
  const saved=drafts.filter(d=>d.type==='settings-section').map(d=>d.content);
  assert.deepEqual(saved,['【故事梗概】已完成概览\n【核心设定】原文规则','【人物小传】甲：已经付费完成的人物资料']);
 });
});

function cachedNovel(){
 const p=novel(Array.from({length:30},(_,i)=>`第${i+1}章 事实${i+1}\n已发生的原文。\n`).join(''));
 p.creator.ip.reading=p.creator.ip.source.chapters.map(c=>({sourceId:p.creator.ip.source.id,chapterId:c.id,start:c.start,end:c.end,note:'已发生因果与章节事实。'.repeat(45)}));
 return p;
}

test('overlong completed digest is retained then tightened once without trimming the original input',async()=>{
 const p=cachedNovel(),drafts=[],requests=[];let digestCalls=0;
 const result=await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'tighten',onDraft:d=>drafts.push(d),api:{aiChat:async r=>{
  requests.push(r);if(r.taskId.includes(':digest-')){digestCalls++;return digestCalls===1?'过长但完整的事实。'.repeat(200):'压缩后的关键因果与所有章节范围。';}return direct(p);
 }}});
 assert.equal(result.plan.episodes.length,1);
 const stored=drafts.filter(d=>d.type==='digest');assert.equal(stored[0].compact,false);assert.ok(stored.some(d=>d.compact===true));assert.equal(stored[0].content,'过长但完整的事实。'.repeat(200));
 assert.ok(stored.every(d=>d.sourceId===p.creator.ip.source.id&&typeof d.cacheKey==='string'&&d.cacheKey));
 const digestRequests=requests.filter(r=>r.taskId.includes(':digest-'));assert.ok(digestRequests[1].messages.some(m=>m.content.includes('第1章 事实1')));assert.ok(digestRequests[1].messages.some(m=>m.content.includes('已发生因果与章节事实。'.repeat(45))));
});

test('digest still overlong after bounded splitting stops and keeps all paid results',async()=>{
 const p=cachedNovel(),drafts=[];let digestCalls=0;
 await assert.rejects(()=>runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'tighten-limit',onDraft:d=>drafts.push(d),api:{aiChat:async r=>{if(r.taskId.includes(':digest-')){digestCalls++;return '无法压缩的完整结果。'.repeat(200);}return direct(p);}}}),/压缩|过长/);
 assert.ok(digestCalls<=12);assert.equal(drafts.filter(d=>d.type==='digest'&&d.compact===false).length,digestCalls);
});

test('overlong successful multi-note digest splits without losing any facts and resumes successful subgroups',async()=>{
 const p=cachedNovel(),diagnostics=[];let digestCalls=0;
 const result=await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'too-long-split',onDraft:d=>diagnostics.push(d),api:{aiChat:async r=>{
  if(r.taskId.includes(':digest-')){digestCalls++;return digestCalls<=2?'过长事实'.repeat(500):'完整紧凑的子范围索引';}return direct(p);
 }}});
 assert.equal(result.plan.episodes.length,1);assert.equal(diagnostics.filter(d=>d.type==='digest'&&!d.compact).length,2);
 assert.ok(diagnostics.filter(d=>d.type==='digest'&&d.compact).length>=3);
 p.creator.records=[{diagnostics}];let calls=0;
 await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'split-cache',api:{aiChat:async r=>{if(r.taskId.includes(':digest-'))calls++;return r.taskId.includes(':digest-')?'复用以外的完整索引':direct(p);}}});
 assert.ok(calls<=1,'Successful child ranges should be reused without retrying the failed parent');
});

test('valid same-source compact digest cache resumes and invalid cache or changed instruction is recomputed',async t=>{
 const p=cachedNovel(),diagnostics=[];let calls=0;
 const invoke=async r=>{if(r.taskId.includes(':digest-')){calls++;return '完整且紧凑的事实索引';}return direct(p);};
 await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'cache-first',onDraft:d=>diagnostics.push(d),api:{aiChat:invoke}});
 assert.ok(diagnostics.some(d=>d.type==='digest'&&d.compact===true));
 for(const scenario of ['valid','source','too-long','instruction'])await t.test(scenario,async()=>{
  const project=structuredClone(p);project.creator.records=[{diagnostics:diagnostics.map(d=>scenario==='source'?{...d,sourceId:'older-source'}:scenario==='too-long'&&d.type==='digest'?{...d,compact:true,content:'过长结果'.repeat(400)}:d)}];
  calls=0;await runIPTask({project,task:'plan',profile:{model:'m'},taskId:`cache-${scenario}`,instruction:scenario==='instruction'?'改变选材偏好':'',api:{aiChat:invoke}});
  assert.equal(calls===0,scenario==='valid');
 });
});

test('completed digest survives later network failure and is reused on the next attempt',async()=>{
 const p=cachedNovel(),diagnostics=[];let calls=0;
 await assert.rejects(()=>runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'digest-interrupted',onDraft:d=>diagnostics.push(d),api:{aiChat:async r=>{
  if(r.taskId.includes(':digest-')){calls++;if(calls===1)return '第一批已付费成功的完整紧凑事实';return {ok:false,error:'第二批网络中断'};}return direct(p);
 }}}),/第二批网络中断/);
 assert.ok(diagnostics.some(d=>d.type==='digest'&&d.content==='第一批已付费成功的完整紧凑事实'));
 p.creator.records=[{diagnostics}];calls=0;
 await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'digest-resume',api:{aiChat:async r=>{if(r.taskId.includes(':digest-')){calls++;return '第二批已完成的紧凑事实';}return direct(p);}}});
 assert.equal(calls,1);
});

test('helper stages append a system phase contract after the entire Skill and separate planning budget from writing',async()=>{
 const p=novel('第一章 原著\n已有事实'),requests=[];
 await runIPTask({project:p,task:'settings',episodeId:p.episodes[0].id,profile:{model:'m'},taskId:'stage-contract',api:{aiChat:async r=>{requests.push(r);return range(r)?'阅读事实':'【故事梗概】原著事实\n【人物小传】';}}});
 const request=requests.at(-1),systems=request.messages.filter(m=>m.role==='system');
 assert.match(systems.at(-1).content,/当前阶段|本阶段/);assert.match(systems.at(-1).content,/正文|场景/);assert.doesNotMatch(request.messages.filter(m=>m.role==='user').at(-1).content.split('\n')[0],/40000|70000/);
 for(const file of IP_BUILTIN_SKILLS[1].files)assert.ok(text(request).includes(file.content));
});

test('reasonable compact digests above the requested target remain usable and cached below the safety ceiling',async t=>{
 for(const characters of [1100,1400])await t.test(String(characters),async()=>{
  const p=cachedNovel(),diagnostics=[];let calls=0;
  const api={aiChat:async r=>{if(r.taskId.includes(':digest-')){calls++;return '甲'.repeat(characters);}return direct(p);}};
  await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'reasonable-digest',onDraft:d=>diagnostics.push(d),api});
  assert.ok(diagnostics.some(d=>d.type==='digest'&&d.compact===true&&d.content.length===characters));
  p.creator.records=[{diagnostics}];calls=0;
  await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'reasonable-cache',api});assert.equal(calls,0);
 });
});

test('valid long-novel plans may contain more than twelve bounded story units',async()=>{
 const p=novel(Array.from({length:22},(_,i)=>`第${i+1}章 原著场面\n本章事实。\n`).join(''));
 const result=await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'many-units',api:{aiChat:async r=>{
  if(range(r))return '原著事实';
  if(r.taskId.includes(':plan-group-')){
   const ids=JSON.parse(text(r).match(/本单元有效章节：\n([^\n]+)/)[1]).map(c=>c.id);
   return JSON.stringify({episodes:[{chapterIds:ids,outline:'按原著单元安排'}]});
  }
  return JSON.stringify({mainline:'贯通主线',ending:'第22章真实终点',notes:'22个简短单元',segments:Array.from({length:22},(_,i)=>({from:i+1,to:i+1,episodes:1,focus:'原著场面'}))});
 }}});
 assert.equal(result.plan.episodes.length,22);
 assert.deepEqual(result.plan.episodes.map(e=>e.chapterIds[0]),p.creator.ip.source.chapters.map(c=>c.id));
});

test('malformed episode-batch JSON remains saved and retries as smaller validated batches',async()=>{
 const p=novel('第一章 原著\n相识。\n第二章 原著\n发展。\n第三章 原著\n原文终点。'),drafts=[];let failures=0;
 const result=await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'invalid-group',onDraft:d=>drafts.push(d),api:{aiChat:async r=>{
  if(range(r))return '原著事实';
  if(r.taskId.includes(':plan-group-')){
   if(failures<2){failures++;return '{"episodes":[malformed';}
   const count=Number(text(r).match(/本次只规划 (\d+) 集/)[1]);
   return JSON.stringify({episodes:Array.from({length:count},()=>({chapterIds:[p.creator.ip.source.chapters[0].id],outline:'原著场面'}))});
  }
  return JSON.stringify({mainline:'主线',ending:'真实终点',notes:'预算',segments:[{from:1,to:3,episodes:3,focus:'单元'}]});
 }}});
 assert.equal(result.plan.episodes.length,3);assert.equal(drafts.filter(d=>d.type==='plan'&&d.content==='{"episodes":[malformed').length,2);
});
