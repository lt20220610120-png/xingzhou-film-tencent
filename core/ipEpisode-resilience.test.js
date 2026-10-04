import test from 'node:test';
import assert from 'node:assert/strict';
import {runIPTask} from './ipAi.js';
import {createIPProject,importIPNovel,applyIPPlan,getIPProject,appendIPVersion,updateIPDraft,saveIPVersion,adoptIPVersion,ipOriginal,updateIPMapping,ipHash} from './ipWorkspace.js';
import {sourceRangeLabel,episodeSourceRanges,validateSourceRanges,resolveSourceQuotes} from './ipSourceRanges.js';
import {splitIPScenes,replaceIPScene} from './ipScenes.js';
import {reviewedIPBody} from './ipEpisodeAi.js';
import {createCreatorProject,appendCreatorRecord,adoptCreatorRecord,deleteCreatorRecord} from './creatorWorkspace.js';

function fixture(){
 let state=createIPProject({fruitProjects:[]},{name:'原文定位回归'}),id=state.fruitProjects[0].id;
 state=importIPNovel(state,id,{name:'文件名不能充当章节范围',content:'第1章 开始\r\n甲走进房间，听到乙说的话。\r\n第2章 结果\r\n乙回应，甲离开。\r\n'});
 const p=getIPProject(state,id),episode={id:`${id}_legacy_1`,title:'第1集',type:'episode',sourceId:p.creator.ip.source.id,chapterIds:p.creator.ip.source.chapters.map(c=>c.id),outline:'按故事切分',scriptText:'',ipVersions:[]};
 p.creator.ip.plan={sourceId:p.creator.ip.source.id,episodes:[{chapterIds:episode.chapterIds,outline:episode.outline}]};p.episodes.push(episode);
 return {state,id,p,eid:p.episodes[1].id};
}
const body='## 第1集\n### 场景1-1 内景 房间 日\n人物：甲、乙\n甲：原文对白。\n';
const card={comparison:'逐场原文核对已完成，原文未展开的部分保持未展开',corrections:[],issues:['有待人工复核的来源问题']};
const args=(p,eid,api,extra={})=>({project:p,episodeId:eid,task:'episode',profile:{id:'test',model:'mock'},api,taskId:'regression',...extra});

test('malformed review repairs automatically without regenerating or publishing an initial version',async()=>{
 const {p,eid}=fixture(),diagnostics=[],requests=[];let audits=0;
 const result=await runIPTask(args(p,eid,{aiChat:async r=>{requests.push(r);if(r.taskId.endsWith(':write'))return body;return ++audits===1?'not JSON':JSON.stringify(card);}},{onDraft:d=>diagnostics.push(d)}));
 assert.equal(result.content,body);assert.equal(requests.filter(r=>r.taskId.endsWith(':write')).length,1);
 assert.equal(diagnostics.filter(d=>d.type==='version').length,0);assert.ok(diagnostics.some(d=>d.type==='review-error'));
 assert.ok(result.issues.includes(card.issues[0]));assert.ok(requests.at(-1).messages.at(-1).content.includes('正文不放进 JSON'));
});
test('completed draft resumes after a provider outage and identical final retry deduplicates its visible version',async()=>{
 let {state,id,p,eid}=fixture(),writes=0;const diagnostics=[];
 await assert.rejects(runIPTask(args(p,eid,{aiChat:async r=>{if(r.taskId.endsWith(':write')){writes++;return body;}throw new Error('Service unavailable');}},{onDraft:d=>diagnostics.push(d)})),/unavailable/);
 p.creator.records.push({type:'ip-task',diagnostics});
 const result=await runIPTask(args(p,eid,{aiChat:async r=>{assert.ok(!r.taskId.endsWith(':write'));return JSON.stringify(card);}}));
 assert.equal(writes,1);assert.equal(result.content,body);
 state=appendIPVersion(state,id,eid,result);state=appendIPVersion(state,id,eid,result);
 assert.equal(getIPProject(state,id).episodes[1].ipVersions.length,1);
});
test('2.7.1 initial draft can resume its failed audit, but changed requirements cannot reuse the draft',async()=>{
 const {p,eid}=fixture(),e=p.episodes[1],source=p.creator.ip.source;
 const old=ipHash(JSON.stringify({source:source.id,duration:p.creator.ip.duration,plan:p.creator.ip.plan,episode:{id:e.id,sourceId:e.sourceId,chapterIds:e.chapterIds,outline:e.outline,scriptText:e.scriptText},previous:p.episodes.slice(0,1).map(e=>[e.id,e.sourceId,e.chapterIds,e.scriptText])}));
 e.ipVersions.push({content:body,label:'Skill 初稿 · 待对照',sourceId:source.id,fingerprint:old});
 let writes=0;const api={aiChat:async r=>{if(r.taskId.endsWith(':write')){writes++;return body;}return JSON.stringify(card);}};
 await runIPTask(args(p,eid,api));assert.equal(writes,0);
 await runIPTask(args(p,eid,api,{instruction:'本次明确重写另一种措辞'}));assert.equal(writes,1);
});
test('truncated screenplay automatically continues the saved tail; cancellation cannot adopt partial text',async()=>{
 const {p,eid}=fixture(),diagnostics=[];let call=0;
 const result=await runIPTask(args(p,eid,{aiChat:async r=>{call++;if(call===1)return {ok:false,code:'OUTPUT_TRUNCATED',error:'输出被截断',partialText:body};if(r.taskId.includes('continue')){assert.equal(r.messages.at(-2).content,body);return '乙：回应。\n';}return JSON.stringify(card);}},{onDraft:d=>diagnostics.push(d)}));
 assert.equal(result.content,body+'乙：回应。\n');assert.ok(diagnostics.some(d=>d.complete===false&&d.content===body));
 let stopped=false;
 await assert.rejects(runIPTask(args(p,eid,{aiChat:async()=>{stopped=true;return {ok:false,partialText:'付费片段',error:'cancel'};}},{isCancelled:()=>stopped})),e=>e.partialText==='付费片段');
});
test('review format failure becomes an explicit warning, keeps body and permits batch continuity without human confirmation',async()=>{
 const {p,eid}=fixture();const result=await runIPTask(args(p,eid,{aiChat:async r=>r.taskId.endsWith(':write')?body:'broken card'}));
 assert.equal(result.content,body);assert.match(result.issues.join(' '),/人工核对/);
 const e={scriptText:result.content,ipVersions:[result],stale:false};
 assert.equal(reviewedIPBody(e,p.creator.ip.source.id),true);assert.equal(reviewedIPBody({...e,stale:true},p.creator.ip.source.id),false);
});
test('specific correction rounds return plain screenplay, retain checkpoints and expose only the final result',async()=>{
 const {p,eid}=fixture(),diagnostics=[];let writes=0;
 const result=await runIPTask(args(p,eid,{aiChat:async r=>{
  if(r.taskId.endsWith(':write'))return body;
  if(r.taskId.endsWith(':review'))return JSON.stringify({...card,corrections:['删去无原文依据的对白']});
  if(r.taskId.endsWith(':revision-0')){writes++;return body.replace('原文对白','忠实对白');}
  return JSON.stringify({...card,issues:[]});
 }},{onDraft:d=>diagnostics.push(d)}));
 assert.equal(writes,1);assert.match(result.content,/忠实对白/);assert.equal(diagnostics.filter(d=>d.type==='version').length,0);
 assert.ok(diagnostics.some(d=>d.stage==='revision-0'));
});
test('partial chapter ranges remain exact through edits, snapshots, adoption, replan and old-outline migration',()=>{
 let {state,id,p,eid}=fixture();const source=p.creator.ip.source,end=source.content.indexOf('乙回应')+3;
 state=updateIPMapping(state,id,eid,source.chapters.map(c=>c.id),'故事停在回应',[{start:source.content.indexOf('甲走'),end}]);
 p=getIPProject(state,id);assert.equal(ipOriginal(p,p.episodes[1]),source.content.slice(source.content.indexOf('甲走'),end));
 assert.equal(sourceRangeLabel(p.episodes[1],source),'第1章至第2章 · 故事片段');
 state=appendIPVersion(state,id,eid,{content:body,sourceRanges:p.episodes[1].sourceRanges},{activate:true});
 state=updateIPDraft(state,id,eid,body+'修改');state=saveIPVersion(state,id,eid);
 p=getIPProject(state,id);state=adoptIPVersion(state,id,eid,p.episodes[1].ipVersions[0].id);
 assert.deepEqual(getIPProject(state,id).episodes[1].sourceRanges,p.episodes[1].sourceRanges);
 assert.deepEqual(episodeSourceRanges({chapterIds:source.chapters.map(c=>c.id),outline:`原文[0,${end})：故事停点`},source),[{start:0,end}]);
 assert.throws(()=>validateSourceRanges([{start:0,end:source.content.length+1}],source));
});
test('scene edits preserve episode preface, other scenes and CRLF verbatim; Markdown headers are recognized',()=>{
 const text='## 第10集 标题\r\n\r\n### 场景10-1 内景 客厅 日\r\n人物：甲\r\n甲：对白。\r\n\r\n10-2 【场景：门口（夜/外）】\r\n乙：回应。\r\n';
 const scenes=splitIPScenes(text);assert.deepEqual(scenes.map(s=>s.label),['10-1','10-2']);
 const edited=replaceIPScene(text,scenes[0].id,scenes[0].content.replace('对白','新对白'));
 assert.equal(edited,text.replace('对白','新对白'));assert.equal(splitIPScenes(edited)[1].content,scenes[1].content);
 assert.equal(splitIPScenes('未分场正文').length,0);
 assert.equal(splitIPScenes(replaceIPScene(text,scenes[0].id,scenes[0].content.trimEnd())).length,2);
});
test('source anchors may cross chapters and flatten whitespace without changing verbatim offsets',()=>{
 const {p}=fixture(),s=p.creator.ip.source;
 const ranges=s.chapters.map(c=>({start:c.start,end:c.end}));
 const expected={start:s.content.indexOf('甲走进'),end:s.content.indexOf('甲离开')+'甲离开。'.length};
 assert.deepEqual(resolveSourceQuotes([{startQuote:'甲走进房间，听到乙说的话。第2章 结果',endQuote:'乙回应，甲离开。'}],s,ranges),[expected]);
 assert.throws(()=>resolveSourceQuotes([{startQuote:'甲走进虚构房间',endQuote:'乙回应，甲离开。'}],s,ranges),/唯一/);
});
test('explicit deletion removes provenance and examples while preserving adopted content and other candidates',()=>{
 let state=createCreatorProject({scriptProjects:[]},{name:'原创',mode:'framework'}),id=state.scriptProjects[0].id;
 state=appendCreatorRecord(state,'script',id,{id:'example',target:{section:'inspiration'},output:'已经采用的灵感'});
 state=adoptCreatorRecord(state,'script',id,'example');state=appendCreatorRecord(state,'script',id,{id:'other',output:'其他候选'});
 state=deleteCreatorRecord(state,'script',id,'example');
 assert.equal(state.scriptProjects[0].creator.sections.inspiration.output,'已经采用的灵感');
 assert.ok(state.scriptProjects[0].creator.records.some(r=>r.id==='other'));assert.ok(!state.scriptProjects[0].creator.records.some(r=>r.id==='example'));
 state=appendCreatorRecord(state,'script',id,{id:'running',status:'running'});
 assert.throws(()=>deleteCreatorRecord(state,'script',id,'running'),/停止/);
});
