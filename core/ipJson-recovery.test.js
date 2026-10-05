import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIPJson,recoverIPPlanMap,isIPModelRefusal,createIPProject,importIPNovel,getIPProject} from './ipWorkspace.js';
import {runIPTask} from './ipAi.js';
import {IP_BUILTIN_SKILLS} from './ipBuiltinSkills.js';
import {withGroundedScenes,groundedGroup,continuityReply} from './ipPlanTestFixture.js';

const fixture=(content='第一章 开篇\n人物出发。\n第二章 结果\n人物归还失物。')=>{
 let s=createIPProject({fruitProjects:[]},{name:'实际截断恢复',duration:60,readConcurrency:1});const id=s.fruitProjects[0].id;
 s=importIPNovel(s,id,{content:withGroundedScenes(content)});return getIPProject(s,id);
};
const map=(p,count=50)=>({mainline:'原文已有主线',ending:'原文真实停点',notes:'只选当前原文故事',readingIndex:'原文起点、因果与结果',segments:[{from:1,to:p.creator.ip.source.chapters.length,episodes:count,focus:'主线已有场面'}]});
const input=r=>r.messages.at(-1).content;
const group=(p,r)=>{
 return JSON.stringify(groundedGroup(p.creator.ip.source,r,'原文不同场面与切点'));
};

test('captured production refusal replies are distinguished from facts and from quoted character dialogue',()=>{
 const captured=['身为一个语言模型，我没办法提供这方面的帮助。','请恕我爱莫能助，我只是一个语言模型，不能理解或回复你的这个问题。','我只是一个文本 AI，在这方面没法帮到你。','我无法提供这方面的帮助，因为我只是一个语言模型。','我是一个文本 AI，这超出了我的能力范围。','我只是一个语言模型，不具备这方面的信息或能力，因此没法帮到你。','由于程序代码的局限，我没法办到。'];
 for(const text of captured){assert.equal(isIPModelRefusal(text),true,text);assert.throws(()=>parseIPJson(text),e=>e.code==='IP_MODEL_REFUSAL');}
 assert.equal(isIPModelRefusal('原文角色说“我只是一个语言模型，无法帮助你”，随后交出物品；这是主角识破假身份的起点。'),false);
 assert.equal(isIPModelRefusal('抱歉，主角不能解释自己的身份。实际结果是对方接受了归还的物品。'),false);
 assert.equal(isIPModelRefusal('人物出发并归还失物；停点为双方相识。'),false);
});

test('production endings inside sourceRanges and segment focus are explicit truncation, including JSON fences',()=>{
 // These suffixes preserve the exact failure shapes captured in the user's
 // 10,418- and 1,454-character replies; no private novel text is published.
 const partialEpisode='{"mainline":"主线","ending":"停点","segments":[{"from":1,"to":8,"episodes":63}],"episodes":[{"chapterIds":["source_c50"],"outline":"不同场面","sourceRanges":[{"start":121482,"end":123780}]';
 const partialSegment='{"mainline":"主线","ending":"停点","segments":[{"from":1,"to":8,"episodes":8,"focus":"初见与误会';
 for(const output of [partialEpisode,partialSegment,'```json\n'+partialEpisode])assert.throws(()=>parseIPJson(output),e=>e.code==='IP_JSON_TRUNCATED');
 const recovered=recoverIPPlanMap(partialEpisode);assert.equal(recovered.segments[0].episodes,63);assert.ok(!('episodes' in recovered));
 assert.equal(recoverIPPlanMap(partialSegment),null,'a missing focus/segment ending cannot be invented');
 assert.throws(()=>parseIPJson('{"segments":[}'),e=>e.code==='IP_JSON_INVALID');
});

test('map recovery respects nested values, escaped quotes, braces in strings, and duplicate keys',()=>{
 const complete={mainline:'主角说“{并非结构}”并写下 "引号"。',ending:'原著停点\\下一步未给出',segments:[{from:1,to:2,episodes:50,focus:'角色讨论 "episodes" 词与 } 字符'}]};
 const prefix=JSON.stringify(complete).slice(0,-1);
 assert.deepEqual(recoverIPPlanMap(prefix+',"episodes":[{"outline":"未结束'),complete);
 assert.deepEqual(recoverIPPlanMap(prefix),complete);
 assert.equal(recoverIPPlanMap('{"mainline":"旧","mainline":"新","ending":"停点","segments":[{"from":1,"to":2,"episodes":50}],"episodes":['),null);
 assert.deepEqual(parseIPJson('```JSON\n'+JSON.stringify(complete)+'\n```'),complete);
});

test('a plain truncated full plan reuses only complete validated map fields and generates every episode in bounded batches',async()=>{
 const p=fixture(),calls=[],drafts=[],progress=[],plan=map(p,63);
 const partial=JSON.stringify(plan).slice(0,-1)+',"episodes":[{"chapterIds":["'+p.creator.ip.source.chapters[0].id+'"],"outline":"半段尚未完成","sourceRanges":[{"start":0,"end":12}]';
 const result=await runIPTask({project:p,task:'plan',taskId:'captured-full',profile:{model:'mock'},onDraft:d=>drafts.push(d),onProgress:v=>progress.push(v),api:{aiChat:async r=>{
  calls.push(r);if(r.taskId.includes(':plan-continuity-'))return continuityReply();if(r.taskId.endsWith(':plan'))return partial;
  if(r.taskId.includes(':settings'))return '【故事梗概】真实原文主线\n【人物小传】已有原著角色';
  if(r.taskId.includes(':plan-group-'))return group(p,r);
  throw new Error(`Unexpected repeat ${r.taskId}`);
 }}});
 assert.equal(result.plan.episodes.length,63);assert.equal(calls.filter(r=>r.taskId.endsWith(':plan')).length,1);
 assert.equal(calls.filter(r=>r.taskId.includes('plan-map')||r.taskId.includes('plan-repair')).length,0);
 assert.equal(calls.filter(r=>r.taskId.includes(':plan-group-')).length,11);
 assert.ok(result.plan.episodes.every(e=>!e.outline.includes('半段尚未完成')));
 assert.ok(drafts.some(d=>d.content===partial));assert.ok(progress.some(v=>v.label.includes('已恢复完整主线')));
 assert.ok(drafts.some(d=>d.type==='planning-checkpoint'&&d.stage==='map'&&!JSON.parse(d.content).episodes));
 for(const r of calls.filter(r=>r.taskId.includes(':plan'))){for(const file of IP_BUILTIN_SKILLS[0].files)assert.ok(r.messages.some(m=>m.content.includes(file.content)),'the complete Skill remains attached');}
});

test('a segment-level truncation without any episodes field regenerates a compact map, with one bounded repair',async()=>{
 const p=fixture(),calls=[];let compact=0;
 const result=await runIPTask({project:p,task:'plan',taskId:'captured-segment',profile:{model:'mock'},api:{aiChat:async r=>{
  calls.push(r);
  if(r.taskId.includes(':plan-continuity-'))return continuityReply();
  if(r.taskId.endsWith(':plan'))return '{"mainline":"主线","ending":"真实停点","segments":[{"from":1,"to":2,"episodes":50,"focus":"断在字段';
  if(r.taskId.includes(':plan-map')){
   assert.doesNotMatch(input(r),/"episodes"\s*:\s*\[/,'the compact fallback must not include the full episode template');
   if(++compact===1)return '{"mainline":"主线","ending":"停点","segments":[';
   return JSON.stringify(map(p));
  }
  if(r.taskId.includes(':settings'))return '【故事梗概】已选原著主线';
  return group(p,r);
 }}});
 assert.equal(compact,2);assert.equal(calls.filter(r=>r.taskId.includes('plan-repair')).length,0);assert.equal(result.plan.episodes.length,50);
});

test('recovered maps still validate source bounds and cannot silently become a plan with impossible chapters',async()=>{
 const p=fixture(),calls=[];
 const result=await runIPTask({project:p,task:'plan',taskId:'invalid-source-map',profile:{model:'mock'},api:{aiChat:async r=>{
  calls.push(r);if(r.taskId.includes(':plan-continuity-'))return continuityReply();if(r.taskId.endsWith(':plan'))return '{"mainline":"主线","ending":"停点","segments":[{"from":1,"to":999,"episodes":50}],"episodes":[';
  if(r.taskId.includes(':plan-map'))return JSON.stringify(map(p));
  if(r.taskId.includes(':settings'))return '【故事梗概】真实原文';return group(p,r);
 }}});
 assert.equal(result.plan.segments[0].to,p.creator.ip.source.chapters.length);assert.equal(calls.filter(r=>r.taskId.includes(':plan-map')).length,1);
});

test('refusal caches are reread only at missing source ranges and cannot contaminate the selected mainline',async()=>{
 const p=fixture('第一章 原著\n'+'真实因果。'.repeat(13000)),source=p.creator.ip.source,cut=2000,reads=[],drafts=[],calls=[];
 p.creator.ip.reading=[{sourceId:source.id,start:0,end:cut,note:'身为一个语言模型，我没办法提供这方面的帮助。',readingMode:'story-index'},{sourceId:source.id,start:cut,end:source.content.length,note:'已读其余有效因果及实际停点',readingMode:'story-index'}];
 const result=await runIPTask({project:p,task:'plan',taskId:'refused-cache',profile:{model:'mock'},onRead:r=>reads.push(r),onDraft:d=>drafts.push(d),api:{aiChat:async r=>{
  calls.push(r);
  if(r.taskId.includes(':plan-continuity-'))return continuityReply();
  if(r.taskId.includes(':plan-group-'))return group(p,r);
  if(r.taskId.includes(':read-')){assert.match(input(r),/字符 \[0,2000\)/);return '修复后已完整理解小说开篇、角色目标和故事起点';}
  if(r.taskId.includes(':settings'))return '【故事梗概】以真实第一章开始';
  assert.ok(input(r).includes('修复后已完整理解小说开篇'));assert.ok(input(r).includes('已读其余有效因果'));assert.ok(!input(r).includes('身为一个语言模型'));
  return JSON.stringify({...map(p),episodes:Array.from({length:50},(_,i)=>({chapterIds:[source.chapters[0].id],outline:`真实开篇之后的切点${i+1}`}))});
 }}});
 assert.equal(result.plan.episodes.length,50);assert.deepEqual(reads.map(r=>[r.start,r.end]),[[0,cut]]);assert.equal(calls.filter(r=>r.taskId.includes(':read-')).length,1);
 // Persist the recovered range and map exactly as the UI does, then ensure a
 // later failure resumes the valid-fact checkpoint without reselecting it.
 p.creator.ip.reading=[...p.creator.ip.reading.filter(r=>r.start!==0),reads[0]];p.creator.records.push({diagnostics:drafts});
 let repeated=false;
 await runIPTask({project:p,task:'plan',taskId:'refused-cache-resume',profile:{model:'mock'},api:{aiChat:async r=>{repeated=true;throw new Error('valid checkpoint should have resumed');}}});
 assert.equal(repeated,false);
});

test('new provider refusal preserves the raw reply, never marks a range read, and never retries it silently',async()=>{
 const p=fixture('第一章 原著\n'+'真实因果。'.repeat(13000)),reads=[],drafts=[];let calls=0;
 await assert.rejects(()=>runIPTask({project:p,task:'plan',taskId:'new-refusal',profile:{model:'mock'},onRead:r=>reads.push(r),onDraft:d=>drafts.push(d),api:{aiChat:async()=>{calls++;return '我只是一个文本 AI，在这方面没法帮到你。';}}}),e=>e.code==='IP_MODEL_REFUSAL'&&/未计作已读/.test(e.message));
 assert.equal(calls,1);assert.equal(reads.length,0);assert.equal(drafts[0].type,'read-refusal');assert.match(drafts[0].content,/文本 AI/);
 let plans=0;
 await assert.rejects(()=>runIPTask({project:fixture(),task:'plan',taskId:'plan-refusal',profile:{model:'mock'},api:{aiChat:async()=>{plans++;return '由于程序代码的局限，我没法办到。';}}}),e=>e.code==='IP_MODEL_REFUSAL');
 assert.equal(plans,1);
});
