import test from 'node:test';import assert from 'node:assert/strict';
import {createIPProject,importIPNovel,getIPProject} from './ipWorkspace.js';import {runIPTask} from './ipAi.js';
const scene=n=>`事件${String(n).padStart(4,'0')}：角色找到真实证据，按原文因果继续调查。`;
function fixture(){let s=createIPProject({fruitProjects:[]},{name:'自主修复',duration:60}),id=s.fruitProjects[0].id;s=importIPNovel(s,id,{content:'第1章 证据\n'+Array.from({length:110},(_,i)=>scene(i+1)).join('\n')});return getIPProject(s,id);}
const map={mainline:'核查原著证据',ending:'已有阶段终点',segments:[{from:1,to:1,episodes:50,focus:'真实证据'}]};
test('fabricated repeated quotes automatically switch to software source-unit IDs and finish all episode planning',async()=>{
 const p=fixture(),source=p.creator.ip.source,calls=[],diagnostics=[];
 const result=await runIPTask({project:p,task:'plan',taskId:'repair-units',profile:{model:'mock'},onDraft:d=>diagnostics.push(d),api:{aiChat:async r=>{calls.push(r);if(r.taskId.includes(':settings'))return '【故事梗概】真实调查';if(r.taskId.includes(':plan-continuity-'))return '{"ok":true,"issues":[]}';if(r.taskId.includes(':plan-locator-')){const text=r.messages.at(-1).content,n=Number(text.match(/本次只规划 (\d+) 集/)[1]),units=JSON.parse(text.split('【可选原文单元 JSON】\n')[1]);return JSON.stringify({episodes:units.slice(0,n).map((u,i)=>({outline:'角色依当前证据采取行动 '+u.id,sourceUnitRanges:[{startId:u.id,endId:u.id}]}))});}if(r.taskId.includes(':plan-group-'))return JSON.stringify({episodes:[{chapterIds:[source.chapters[0].id],outline:'真实行动',sourceQuotes:[{startQuote:'AI伪造的呵何错之有……',endQuote:'同样不在原文的停点'}]}]});return JSON.stringify(map);}}});
 assert.equal(result.plan.episodes.length,50);assert.ok(result.plan.episodes.every(e=>e.sourceRanges?.length));assert.ok(calls.some(r=>r.taskId.includes(':plan-locator-')));assert.ok(diagnostics.some(d=>d.type==='planning-recovery'));
 for(let i=1;i<50;i++)assert.ok(result.plan.episodes[i].sourceRanges[0].start>=result.plan.episodes[i-1].sourceRanges.at(-1).end);
});
import {parseNovel} from './ipWorkspace.js';
import {ipSourceUnits,groundIPUnitPlan,carryIPWindowQuota} from './ipPlanningRecovery.js';

test('source-unit IDs preserve literal CRLF/Unicode ranges and reject invented IDs or repeated cuts',()=>{
 const source=parseNovel('第1章 开门\r\n  甲看见🚢。\r\n  乙：同一句对白。\r\n  乙：同一句对白。\r\n','unit-source'),units=ipSourceUnits(source,0,source.content.length);assert.equal(units.length,3);for(const u of units)assert.equal(source.content.slice(u.start,u.end),u.text);
 const plan={episodes:units.map(u=>({outline:'真实场面'+u.id,sourceUnitRanges:[{startId:u.id,endId:u.id}]}))};const grounded=groundIPUnitPlan(plan,source,units,{expectedCount:3});assert.deepEqual(grounded.episodes.map(e=>source.content.slice(e.sourceRanges[0].start,e.sourceRanges[0].end)),units.map(u=>u.text));
 assert.throws(()=>groundIPUnitPlan({episodes:[{outline:'错误',sourceUnitRanges:[{startId:'u_fake',endId:units[0].id}]}]},source,units),/编号/);
 assert.throws(()=>groundIPUnitPlan({episodes:[plan.episodes[0],plan.episodes[0]]},source,units),e=>e.code==='IP_PLAN_SOURCE_OVERLAP');
});
test('window quota can advance with the unread tail, conserving the total and never filling empty episodes',()=>{
 const windows=[{start:0,end:47722,episodes:18},{start:47722,end:95400,episodes:17}];assert.equal(carryIPWindowQuota(windows,0,17,47720),1);assert.equal(windows[0].episodes+windows[1].episodes,35);assert.equal(windows[1].start,47720);assert.equal(carryIPWindowQuota(windows,1,18,95400),0);
});

test('repeated dialogue source-unit checkpoints resume without any new planning request',async()=>{
 let state=createIPProject({fruitProjects:[]},{name:'重复对白恢复',duration:60}),id=state.fruitProjects[0].id;state=importIPNovel(state,id,{content:'第1章 同一句对白\n'+'甲：我已经确认了这条线索。\n'.repeat(110)});const p=getIPProject(state,id),diagnostics=[];
 const result=await runIPTask({project:p,task:'plan',taskId:'same-lines',profile:{model:'mock'},onDraft:d=>diagnostics.push(d),api:{aiChat:async r=>{if(r.taskId.includes(':settings'))return '【故事梗概】确认线索';if(r.taskId.includes(':plan-continuity-'))return '{"ok":true,"issues":[]}';if(r.taskId.includes(':plan-group-'))return '{"episodes":[]}';if(r.taskId.includes(':plan-locator-')){const text=r.messages.at(-1).content,n=Number(text.match(/本次只规划 (\d+) 集/)[1]),units=JSON.parse(text.split('【可选原文单元 JSON】\n')[1]);return JSON.stringify({episodes:units.slice(0,n).map(u=>({outline:'当场确认 '+u.id,sourceUnitRanges:[{startId:u.id,endId:u.id}]}))});}return JSON.stringify(map);}}});
 assert.equal(result.plan.episodes.length,50);assert.ok(result.plan.episodes.every(e=>e.sourceUnitRanges?.length));p.creator.records.push({diagnostics});
 const resumed=await runIPTask({project:p,task:'plan',taskId:'same-lines-resumed',profile:{model:'mock'},api:{aiChat:async()=>{throw Error('有效检查点不应再次付费');}}});assert.deepEqual(resumed.plan.episodes,result.plan.episodes);
});

test('an exhausted second story segment rebalances its own quota without rewinding the earlier segment',async()=>{
 const content=Array.from({length:2},(_,chapter)=>`第${chapter+1}章 线索\n${Array.from({length:120},(_,i)=>`章节${chapter+1}场面${i+1}角色确认真实线索。`).join('\n')}`).join('\n'),state0=createIPProject({fruitProjects:[]},{name:'跨单元重划'}),id=state0.fruitProjects[0].id,state=importIPNovel(state0,id,{content}),p=getIPProject(state,id),source=p.creator.ip.source,diagnostics=[];let consumed=false;
 const result=await runIPTask({project:p,task:'plan',taskId:'tail',profile:{model:'mock'},onDraft:d=>diagnostics.push(d),api:{aiChat:async r=>{const text=r.messages.at(-1).content;if(r.taskId.includes(':settings'))return '【故事梗概】确认线索';if(r.taskId.includes(':plan-continuity-'))return '{"ok":true,"issues":[]}';if(r.taskId.includes(':plan-group-')){const window=text.match(/完整原文窗口\[(\d+),(\d+)\)/),units=ipSourceUnits(source,Number(window[1]),Number(window[2])),n=Number(text.match(/本次只规划 (\d+) 集/)[1]),remaining=Number(text.match(/本批尚余(\d+)集/)[1]),eat=Number(window[1])===source.chapters[1].start&&!consumed;if(eat)consumed=true;return JSON.stringify({episodes:Array.from({length:n},(_,i)=>{const a=units[Math.floor(i*units.length/(eat?n:remaining))],b=units[Math.max(Math.floor((i+1)*units.length/(eat?n:remaining))-1,Math.floor(i*units.length/(eat?n:remaining)))];return {outline:'真实场面 '+a.id,sourceUnitRanges:[{startId:a.id,endId:b.id}]};})});}return JSON.stringify({mainline:'两章完整因果',ending:'第二章停点',segments:[{from:1,to:1,episodes:20},{from:2,to:2,episodes:30}]});}}});
 assert.equal(result.plan.episodes.length,50);assert.equal(result.plan.episodes.filter(e=>e.chapterIds.includes(source.chapters[0].id)).length,20);assert.equal(result.plan.episodes.filter(e=>e.chapterIds.includes(source.chapters[1].id)).length,30);assert.ok(diagnostics.some(d=>d.strategy==='rebalance-window-tail'));
});

test('punctuation-only tails cannot become screenplay episodes',()=>{
 const source=parseNovel('第1章 线索\n人物核实线索。\n。\n……\n','punctuation');assert.equal(ipSourceUnits(source,0,source.content.length).length,1);
});

test('first-draft finale repairs repeated anchors within a declared context and reaches the real ending',async()=>{
 const initial=createIPProject({fruitProjects:[]},{name:'末段修复'}),id=initial.fruitProjects[0].id,state=importIPNovel(initial,id,{content:'第1章 线索\n'+Array.from({length:2600},(_,i)=>`场面${String(i).padStart(4,'0')}发现线索。`).join('\n')}),p=getIPProject(state,id),source=p.creator.ip.source;let finaleCatalogSize=0;
 const result=await runIPTask({project:p,task:'plan',firstDraftMode:true,taskId:'finale-capacity',profile:{model:'mock',contextWindowTokens:65536},api:{aiChat:async r=>{const text=r.messages.at(-1).content;if(r.taskId.includes(':read-'))return '已读主线及真实停点';if(r.taskId.includes(':settings'))return '【故事梗概】发现真实线索';if(r.taskId.includes(':plan-finale-locator')){const units=JSON.parse(text.split('【可选原文单元 JSON】\n')[1]),mid=Math.floor(units.length/2);finaleCatalogSize=units.length;return JSON.stringify({episodes:[{outline:'前段核查线索',sourceUnitRanges:[{startId:units[0].id,endId:units[mid-1].lastId||units[mid-1].id}]},{outline:'原著已有停点',sourceUnitRanges:[{startId:units[mid].id,endId:units.at(-1).lastId||units.at(-1).id}]}]});}if(r.taskId.includes(':plan-finale'))return '{"episodes":[]}';if(r.taskId.includes(':plan-group-')){const window=text.match(/完整原文窗口\[(\d+),(\d+)\)/),units=ipSourceUnits(source,Number(window[1]),Number(window[2])),n=Number(text.match(/本次只规划 (\d+) 集/)[1]);return JSON.stringify({episodes:units.slice(0,n).map(u=>({outline:'场面 '+u.id,sourceUnitRanges:[{startId:u.id,endId:u.id}]}))});}return JSON.stringify(map);}}});
 assert.equal(result.plan.episodes.length,50);assert.ok(finaleCatalogSize>0&&finaleCatalogSize<=160);assert.equal(result.plan.episodes.at(-1).sourceRanges.at(-1).end,source.content.length);
});

test('restart after tail rebalance preserves a valid prefix crossing the old batch boundary',async()=>{
 const p=fixture(),source=p.creator.ip.source,diagnostics=[];let resumed=false;const requests=[];
 const api={aiChat:async r=>{const text=r.messages.at(-1).content;if(r.taskId.includes(':settings'))return '【故事梗概】真实证据';if(r.taskId.includes(':plan-continuity-'))return '{"ok":true,"issues":[]}';if(r.taskId.includes(':plan-locator-'))return '{"episodes":[]}';if(r.taskId.includes(':plan-group-')){const first=Number(text.match(/单元内第(\d+)至/)[1]),n=Number(text.match(/本次只规划 (\d+) 集/)[1]),window=text.match(/完整原文窗口\[(\d+),(\d+)\)/),units=ipSourceUnits(source,Number(window[1]),Number(window[2]));requests.push({first,n});if(!resumed&&first===40)throw Error('QA重分末批时服务中断');if(!resumed&&first===43&&n>3)return '{"episodes":[]}';return JSON.stringify({episodes:units.slice(0,n).map((u,i)=>({outline:'真实证据 '+u.id,sourceUnitRanges:[{startId:u.id,endId:!resumed&&first===43&&i===n-1?units.at(-1).id:u.id}]}))});}return JSON.stringify(map);}};
 await assert.rejects(runIPTask({project:p,task:'plan',taskId:'rebalance-stop',profile:{model:'mock'},onDraft:d=>diagnostics.push(d),api}),/QA重分末批时服务中断/);assert.ok(diagnostics.some(d=>d.strategy==='rebalance-window-tail'&&d.fromOffset===39));
 p.creator.records.push({diagnostics});resumed=true;requests.length=0;
 const result=await runIPTask({project:p,task:'plan',taskId:'rebalance-resume',profile:{model:'mock'},api});assert.equal(result.plan.episodes.length,50);assert.deepEqual(requests.map(r=>r.first),[40,46]);
});
