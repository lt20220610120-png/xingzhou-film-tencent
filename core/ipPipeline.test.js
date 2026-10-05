import test from 'node:test';
import assert from 'node:assert/strict';
import { createIPProject, importIPNovel, getIPProject, applyIPPlan, validateIPPlan, ipMaster, updateIPDraft, appendIPVersion, adoptIPVersion, confirmIPEpisode } from './ipWorkspace.js';
import { normalizeCreatorProject } from './creatorWorkspace.js';
import { runIPTask } from './ipAi.js';
import { IP_BUILTIN_SKILLS } from './ipBuiltinSkills.js';
import * as workspace from './ipWorkspace.js';

function fixture(duration=60){
 let state=createIPProject({fruitProjects:[]},{name:'持续规划',duration});
 const id=state.fruitProjects[0].id;
 state=importIPNovel(state,id,{content:'第一章 开篇\n甲捡包，找到失主。\n第二章 归还\n甲归还失物，双方相识。'});
 return {state,id,p:getIPProject(state,id)};
}
const episodes=(source,count,offset=0)=>Array.from({length:count},(_,i)=>({chapterIds:[source.chapters[i%2].id],outline:`原文已发生场面${offset+i+1}的因果与停点`}));
const input=request=>request.messages.map(m=>m.content).join('\n');
const apiFor=(p,{count=50,failBatch=false,requests=[]}={})=>({aiChat:async request=>{
 requests.push(request);
 if(request.taskId.includes(':read-'))return '甲捡包归还，失主与甲相识；真实停点为相识，没有后续结局。';
 if(request.taskId.includes(':settings'))return '【故事梗概】甲归还失物并相识。\n【核心标签】都市、相识\n【人物小传】甲：归还失物。\n【核心设定】依据导入两章，后续【待定】。';
 if(request.taskId.includes(':plan-group-')){
  const match=input(request).match(/本次只规划 (\d+) 集/),n=Number(match?.[1]);
  assert.ok(n>=1&&n<=12,'单元细纲每批至多十二集，输出中断时自动缩小');
  if(failBatch&&input(request).includes('单元内第13至24集'))throw new Error('模型服务暂不可用');
  const offset=Number(input(request).match(/单元内第(\d+)至/)[1])-1;
  return JSON.stringify({episodes:episodes(p.creator.ip.source,n,offset)});
 }
 if(request.taskId.endsWith(':plan')||request.taskId.endsWith(':plan-repair'))return JSON.stringify({mainline:'归还失物相识',ending:'第二章相识',segments:[{from:1,to:2,episodes:count,focus:'仅切分已有原文场面'}]});
 throw new Error(`意外请求 ${request.taskId}`);
}});

test('new plan adoption enforces each duration floor and leaves an undersized existing draft readable',()=>{
 for(const [duration,rejected,accepted] of [[60,49,50],[120,79,80]]){
  const {state,id,p}=fixture(duration),source=p.creator.ip.source;
  assert.throws(()=>validateIPPlan({episodes:episodes(source,rejected)},source,duration),/至少/);
  assert.throws(()=>applyIPPlan(state,id,{episodes:episodes(source,rejected)}),/至少/);
  assert.equal(getIPProject(applyIPPlan(state,id,{episodes:episodes(source,accepted)}),id).creator.ip.plan.episodes.length,accepted);
 }
 const {p}=fixture();p.creator.ip.plan={sourceId:p.creator.ip.source.id,episodes:episodes(p.creator.ip.source,43)};
 p.episodes.push(...p.creator.ip.plan.episodes.map((e,i)=>({...e,id:`legacy-${i}`,type:'episode',scriptText:i===42?'已有第43集正文':'',ipVersions:[]})));
 const normalized=normalizeCreatorProject(p,'fruit');
 assert.equal(normalized.episodes.filter(e=>e.type==='episode').length,43);assert.match(ipMaster(normalized),/已有第43集正文/);
});

test('planning always validates the actual count and extracts settings with summary Skill from the already-read notes',async()=>{
 const {p}=fixture(),requests=[],drafts=[],reads=[];
 const result=await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'pipeline',api:apiFor(p,{requests}),onRead:r=>reads.push(r),onDraft:d=>drafts.push(d)});
 assert.equal(result.plan.episodes.length,50);assert.equal(result.settings.type,'version');assert.equal(result.generation.settings,'generated');
 assert.equal(reads.reduce((n,r)=>n+r.end-r.start,0),p.creator.ip.source.content.length);
 const settingsRequest=requests.find(r=>r.taskId.includes(':settings'));
 for(const file of IP_BUILTIN_SKILLS[1].files)assert.ok(input(settingsRequest).includes(file.content));
 assert.ok(!settingsRequest.messages.some(m=>m.content.includes(p.creator.ip.source.content)),'设定只消费已读记录，不重发整本原文');
 assert.equal(drafts.filter(d=>d.type==='settings-ready').length,1);
 await assert.rejects(()=>runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'short',api:apiFor(p,{count:43})}),/至少50集/);
});

test('planning preserves manual settings and resumes successful batches without rereading or regenerating settings',async()=>{
 const {p}=fixture(),diagnostics=[],requests=[];
 await assert.rejects(()=>runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'first',api:apiFor(p,{failBatch:true,requests}),onRead:r=>p.creator.ip.reading.push(r),onDraft:d=>diagnostics.push(d)}),/服务暂不可用/);
 const ready=diagnostics.find(d=>d.type==='settings-ready');assert.ok(ready);
 p.creator.records.push({diagnostics});
 const resumedRequests=[];
 const result=await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'resume',api:apiFor(p,{requests:resumedRequests})});
 assert.equal(result.plan.episodes.length,50);
 assert.ok(!resumedRequests.some(r=>r.taskId.includes(':read-')||r.taskId.includes(':settings')||r.taskId.endsWith(':plan')));
 assert.ok(!resumedRequests.some(r=>input(r).includes('单元内第1至12集')));
 p.episodes[0].scriptText='手动维护的设定与小传';
 const manualRequests=[];
 const manual=await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'manual',api:apiFor(p,{requests:manualRequests})});
 assert.equal(manual.generation.settings,'needs-review');assert.ok(!manualRequests.some(r=>r.taskId.includes(':settings')));
 assert.equal(p.episodes[0].scriptText,'手动维护的设定与小传');
});

test('continuous writing fills missing settings first, reports completion, and a retry keeps completed output once',async()=>{
 assert.equal(typeof workspace.runRemainingIPTasks,'function');
 let {state,id,p}=fixture();const source=p.creator.ip.source;
 // A persisted older plan remains eligible for finishing its existing manuscript.
 p.creator.ip.plan={sourceId:source.id,episodes:episodes(source,2)};
 p.episodes.push(...p.creator.ip.plan.episodes.map((e,i)=>({...e,id:`body-${i}`,sourceId:source.id,type:'episode',scriptText:'',ipVersions:[]})));
 const order=[],statuses=[];let fail=true;
 const runTask=async({task,episodeId})=>{
  order.push(task);
  p=getIPProject(state,id);
  const result=await runIPTask({project:p,task,episodeId,profile:{model:'m'},taskId:episodeId,allowReviewedPrevious:true,onRead:r=>p.creator.ip.reading.push(r),api:{aiChat:async request=>{
   if(request.taskId.includes(':read-'))return '归还失物，相识。';
   if(request.taskId.endsWith(':settings'))return '【故事梗概】归还失物\n【人物小传】甲。';
   if(request.taskId.endsWith(':write')){if(episodeId==='body-1'&&fail)throw new Error('模型不可用');return `### 场景${episodeId==='body-0'?1:2}-1 内景 客厅 日\n△甲归还失物。`;}
   return JSON.stringify({comparison:'核对已有原句',corrections:[],issues:[]});
  }}});
  state=appendIPVersion(state,id,episodeId,result,{activate:true});return result;
 };
 await assert.rejects(()=>workspace.runRemainingIPTasks({getProject:()=>getIPProject(state,id),runTask,onActivity:a=>statuses.push(a)}),/模型不可用/);
 assert.deepEqual(order,['settings','episode','episode']);
 assert.equal(statuses.at(-1).status,'failed');assert.equal(statuses.at(-1).completed,1);
 assert.equal(getIPProject(state,id).episodes[0].ipVersions.length,1);
 fail=false;order.length=0;
 const result=await workspace.runRemainingIPTasks({getProject:()=>getIPProject(state,id),runTask,onActivity:a=>statuses.push(a)});
 assert.deepEqual(order,['episode']);assert.deepEqual(result,{status:'completed',completed:1,settingsGenerated:false});
 assert.equal(statuses.at(-1).status,'completed');assert.equal(getIPProject(state,id).episodes[0].ipVersions.length,1);
});

test('first settings fill can preserve reviewed legacy episodes and cached retry does not add visible versions',()=>{
 let {state,id,p}=fixture();
 p.episodes.push({id:'legacy-body',type:'episode',sourceId:p.creator.ip.source.id,scriptText:'已有正文',stale:false,finalConfirmed:true,ipVersions:[]});
 const version={sourceId:p.creator.ip.source.id,content:'依据同一原文的设定与小传',generationKey:'same-settings'};
 state=appendIPVersion(state,id,p.episodes[0].id,version,{activate:true,invalidateLater:false});
 state=appendIPVersion(state,id,p.episodes[0].id,version);
 p=getIPProject(state,id);
 assert.equal(p.episodes[1].stale,false);assert.equal(p.episodes[1].finalConfirmed,true);assert.equal(p.episodes[0].ipVersions.length,1);
});

test('settings and planning reuse factual digests across tasks without hiding selection-specific extraction',async()=>{
 const {p}=fixture(),source=p.creator.ip.source,diagnostics=[],calls=[];
 p.creator.ip.reading=source.chapters.map(c=>({sourceId:source.id,chapterId:c.id,start:c.start,end:c.end,note:'甲归还失物的真实因果与身份。'.repeat(600)}));
 const api={aiChat:async request=>{
  calls.push(request);
  if(request.taskId.includes(':digest-'))return '第一章捡包，第二章归还，相识为原文真实停点。';
  return apiFor(p).aiChat(request);
 }};
 await runIPTask({project:p,task:'settings',episodeId:p.episodes[0].id,profile:{model:'m'},taskId:'settings-first',api,onDraft:d=>diagnostics.push(d)});
 assert.ok(diagnostics.some(d=>d.type==='digest'));
 p.creator.records.push({diagnostics});calls.length=0;
 const planned=await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'plan-next',api});
 assert.equal(planned.plan.episodes.length,50);assert.ok(!calls.some(r=>r.taskId.includes(':read-')||r.taskId.includes(':digest-')));
 const settingsRequest=calls.find(r=>r.taskId.endsWith(':settings'));
 assert.ok(settingsRequest);assert.match(input(settingsRequest),/已选改编范围/);
});

test('interrupted split settings resume only the unfinished character section and retain complete source coverage',async()=>{
 const {p}=fixture(),source=p.creator.ip.source,diagnostics=[],requests=[];
 p.creator.ip.reading=source.chapters.map(c=>({sourceId:source.id,chapterId:c.id,start:c.start,end:c.end,note:'完整事实、人物与命运。'.repeat(500)}));
 let characters=0;
 await assert.rejects(()=>runIPTask({project:p,task:'settings',episodeId:p.episodes[0].id,profile:{model:'m'},taskId:'interrupted-settings',onDraft:d=>diagnostics.push(d),api:{aiChat:async request=>{
  if(request.taskId.endsWith(':settings'))return {ok:false,code:'OUTPUT_TRUNCATED',error:'输出截断',partialText:'半份小传'};
  if(request.taskId.endsWith(':settings-overview'))return '【故事梗概】已完成概览\n【核心设定】真实规则';
  if(request.taskId.includes(':settings-characters-')){if(++characters===1)return '【人物小传】甲：已发生的事实';throw new Error('第二批服务中断');}
  if(request.taskId.includes(':digest-'))return '不丢原文来源的紧凑事实';
  throw new Error('不应重读原文');
 }}}),/第二批服务中断/);
 p.creator.records.push({diagnostics});
 const result=await runIPTask({project:p,task:'settings',episodeId:p.episodes[0].id,profile:{model:'m'},taskId:'resumed-settings',api:{aiChat:async request=>{requests.push(request);return '【人物小传】乙：后续原文事实';}}});
 assert.match(result.content,/已完成概览/);assert.match(result.content,/甲：已发生/);assert.match(result.content,/乙：后续/);
 assert.equal(requests.length,1);assert.ok(requests[0].taskId.includes(':settings-characters-'));
});

test('old-source settings stop continuous and direct episode writing before paid requests; explicit extraction remains a candidate until adopted',async()=>{
 let {state,id,p}=fixture();const settingId=p.episodes[0].id;
 state=updateIPDraft(state,id,settingId,'原小说的手动人物资料');
 state=importIPNovel(state,id,{content:'第一章 新小说\n丙在门口等人。\n第二章 新发展\n丁与丙相识。'});p=getIPProject(state,id);
 state=applyIPPlan(state,id,{mainline:'丙与丁相识',ending:'第二章相识',episodes:episodes(p.creator.ip.source,50)});p=getIPProject(state,id);
 let paid=0,queued=0;
 await assert.rejects(()=>workspace.runRemainingIPTasks({getProject:()=>p,runTask:async()=>{queued++;}}),e=>e.code==='IP_SETTINGS_REVIEW_REQUIRED'&&e.episodeId===settingId);
 await assert.rejects(()=>runIPTask({project:p,task:'episode',episodeId:p.episodes[1].id,profile:{model:'m'},taskId:'blocked',api:{aiChat:async()=>{paid++;return '不应调用';}}}),/设定|小传/);
 assert.equal(queued,0);assert.equal(paid,0);
 const result=await runIPTask({project:p,task:'settings',episodeId:settingId,profile:{model:'m'},taskId:'refresh',api:{aiChat:async r=>r.taskId.endsWith(':settings')?'【故事梗概】丙丁相识\n【人物小传】丙、丁。':'当前小说阅读记录'}});
 state=appendIPVersion(state,id,settingId,result);p=getIPProject(state,id);
 assert.equal(p.episodes[0].scriptText,'原小说的手动人物资料');assert.equal(p.episodes[0].stale,true);
 state=adoptIPVersion(state,id,settingId,p.episodes[0].ipVersions.at(-1).id);p=getIPProject(state,id);
 assert.equal(workspace.ipSettingsNeedReview(p),false);assert.equal(p.episodes[0].sourceId,p.creator.ip.source.id);assert.equal(p.episodes[0].stale,false);
 await runIPTask({project:p,task:'episode',episodeId:p.episodes[1].id,profile:{model:'m'},taskId:'resumed',api:{aiChat:async r=>{paid++;return r.taskId.endsWith(':write')?'### 场景1-1 外景 门口 日\n△丙等候。':JSON.stringify({comparison:'当前小说原句',corrections:[],issues:[]});}}});
 assert.equal(paid,2);
});

test('new selected mainline gets a separate settings candidate, while adopting matching first-fill settings does not stale them',async()=>{
 let {state,id,p}=fixture();const drafts=[];
 const first=await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'initial',api:apiFor(p)});
 state=appendIPVersion(state,id,p.episodes[0].id,first.settings,{activate:true});
 state=applyIPPlan(state,id,first.plan);p=getIPProject(state,id);
 assert.equal(p.episodes[0].stale,false);
 const oldText=p.episodes[0].scriptText;
 const api=apiFor(p);
 const changed=await runIPTask({project:p,task:'plan',profile:{model:'m'},taskId:'changed',onDraft:d=>drafts.push(d),api:{aiChat:async r=>{
  if(r.taskId.endsWith(':plan'))return JSON.stringify({mainline:'只保留第二章相识',ending:'新的选材停点',segments:[{from:1,to:2,episodes:50,focus:'不同选材范围'}]});
  return api.aiChat(r);
 }}});
 assert.equal(changed.generation.settings,'candidate');assert.equal(drafts.filter(d=>d.type==='settings-ready').length,1);
 state=appendIPVersion(state,id,p.episodes[0].id,changed.settings);
 const settingsFirstState=adoptIPVersion(state,id,p.episodes[0].id,getIPProject(state,id).episodes[0].ipVersions.at(-1).id);
 const matching=getIPProject(applyIPPlan(settingsFirstState,id,changed.plan),id);
 assert.equal(matching.episodes[0].stale,false,'先采用匹配设定再采用规划，也应识别正确范围');
 state=applyIPPlan(state,id,changed.plan);p=getIPProject(state,id);
 assert.equal(p.episodes[0].scriptText,oldText);assert.equal(p.episodes[0].stale,true);assert.equal(workspace.ipSettingsNeedReview(p),true);
 state=adoptIPVersion(state,id,p.episodes[0].id,p.episodes[0].ipVersions.at(-1).id);p=getIPProject(state,id);
 assert.equal(p.episodes[0].stale,false);assert.equal(workspace.ipSettingsNeedReview(p),false);
});
