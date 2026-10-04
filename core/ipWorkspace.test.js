import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCreatorProject,archiveCreatorProject,recoverCreatorTasks } from './creatorWorkspace.js';
import { createIPProject,getIPProject,parseNovel,importIPNovel,applyIPPlan,updateIPDraft,saveIPVersion,appendIPVersion,adoptIPVersion,deleteIPVersion,ipOriginal,ipMaster,confirmIPEpisode,updateIPMapping,ipBodyCount,validateIPPlan } from './ipWorkspace.js';
import { runIPTask } from './ipAi.js';
import { IP_BUILTIN_SKILLS } from './ipBuiltinSkills.js';

function fixture(content='第一章 捡包\r\n女主捡到包。\r\n\r\n第二章 归还\r\n女主归还包，妈妈介绍儿子。\r\n第三章 相识\r\n两人见面。'){
 let state=createIPProject({fruitProjects:[],scriptProjects:[],scriptLibrary:[]},{name:'小说改编',duration:120});
 const id=state.fruitProjects[0].id;state=importIPNovel(state,id,{name:'原著.txt',content});
 let p=getIPProject(state,id),chapters=p.creator.ip.source.chapters;
 // Load a persisted pre-2.7.3 small plan to verify legacy manuscript operations.
 const plan={mainline:'捡包→归还→相识',ending:'原著第三章相识',sourceId:p.creator.ip.source.id,episodes:[{chapterIds:chapters.slice(0,2).map(c=>c.id),outline:'捡包归还'},...(chapters.length>2?[{chapterIds:chapters.slice(2).map(c=>c.id),outline:'相识'}]:[])]};
 p.creator.ip.plan=plan;p.episodes.push(...plan.episodes.map((e,i)=>({...e,id:`${id}_legacy_${i}`,title:`第${i+1}集`,type:'episode',sourceId:plan.sourceId,scriptText:'',ipVersions:[]})));
 return {state,id,p:getIPProject(state,id)};
}
const validNewPlan=(p,count=80,outline='新规划')=>({episodes:Array.from({length:count},()=>({chapterIds:[p.creator.ip.source.chapters[0].id],outline}))});
test('IP normalization and chapter offsets retain exact original bytes as imported text',()=>{
 const {p}=fixture();assert.equal(normalizeCreatorProject(p,'fruit').creator.mode,'ip');
 const source=p.creator.ip.source;assert.equal(source.chapters.length,3);assert.equal(source.chapters.map(c=>source.content.slice(c.start,c.end)).join(''),source.content);
 assert.equal(ipOriginal(p,p.episodes[1]),source.content.slice(0,source.chapters[2].start));
 assert.equal(parseNovel('没有章标题的完整小说').chapters.length,1);
 assert.throws(()=>validateIPPlan({episodes:[{chapterIds:['missing']}]},source),/原文章节无效/);
});
test('master and episodes share content, archive remains immutable and identified as IP',()=>{
 let {state,id,p}=fixture();
 for(const e of p.episodes)state=updateIPDraft(state,id,e.id,e.type==='settings'?'【人物小传】女主':'### 场景1-1 外景 街道 日\n△归还包。');
 const master=ipMaster(getIPProject(state,id));assert.match(master,/设定和小传/);assert.doesNotMatch(master,/女主捡到包|捡包→/);
 state=archiveCreatorProject(state,id);const saved=state.scriptLibrary[0].content;
 state=updateIPDraft(state,id,p.episodes[1].id,'新修改');assert.match(ipMaster(getIPProject(state,id)),/新修改/);assert.equal(state.scriptLibrary[0].content,saved);assert.equal(state.scriptLibrary[0].modeLabel,'IP · 小说改编');
});
test('generation, manual edits, adoption and deletion preserve other versions and current text',()=>{
 let {state,id,p}=fixture();const e=p.episodes[1].id;
 state=appendIPVersion(state,id,e,{content:'Skill 初版',label:'初版'},{activate:true});
 state=updateIPDraft(state,id,e,'手动调整');state=saveIPVersion(state,id,e);
 state=appendIPVersion(state,id,e,{content:'AI 修改版',label:'修改版'});
 p=getIPProject(state,id);assert.equal(p.episodes[1].scriptText,'手动调整');assert.equal(p.episodes[1].ipVersions.length,3);
 const initial=p.episodes[1].ipVersions[0];state=adoptIPVersion(state,id,e,initial.id);state=deleteIPVersion(state,id,e,initial.id);
 p=getIPProject(state,id);assert.equal(p.episodes[1].scriptText,'Skill 初版');assert.equal(p.episodes[1].ipVersions.length,2);assert.ok(p.episodes[1].ipVersions.some(v=>v.content==='AI 修改版'));
});
test('reimport and replan keep all old sources and version mappings independently readable',()=>{
 let {state,id,p}=fixture();const e=p.episodes[1];
 state=appendIPVersion(state,id,e.id,{content:'原版'},{activate:true});const version=getIPProject(state,id).episodes[1].ipVersions[0],oldSource=ipOriginal(p,e);
 state=importIPNovel(state,id,{content:'第一章 新版\n全新原文',name:'新版'});p=getIPProject(state,id);
 assert.equal(p.creator.ip.sources.length,2);assert.equal(ipOriginal(p,e,version),oldSource);assert.equal(p.episodes[1].scriptText,'原版');assert.ok(p.episodes[1].stale);
 state=applyIPPlan(state,id,validNewPlan(p));p=getIPProject(state,id);
 assert.equal(p.episodes.length,81);assert.equal(p.episodes[1].ipVersions.length,1);assert.equal(p.creator.ip.retiredEpisodes.length,0);
});
test('chapter mapping and earlier edits invalidate confirmation of later episodes',()=>{
 let {state,id,p}=fixture();for(const e of p.episodes){state=updateIPDraft(state,id,e.id,'正文');state=confirmIPEpisode(state,id,e.id);}
 state=updateIPDraft(state,id,p.episodes[1].id,'变化');p=getIPProject(state,id);assert.equal(p.episodes[2].finalConfirmed,false);assert.ok(p.episodes[2].stale);
 state=updateIPMapping(state,id,p.episodes[1].id,[p.creator.ip.source.chapters[2].id],'新范围');assert.match(ipOriginal(getIPProject(state,id),getIPProject(state,id).episodes[1]),/两人见面/);
 assert.equal(ipBodyCount({episodes:[{type:'settings',scriptText:'不计入'},{type:'episode',scriptText:'## 第1集 标题\n### 场景1-1\n△甲。'}]}),8);
});
test('whole-novel planning reads all chunks and includes both duration and full Skill package',async()=>{
 const content='第一章 开始\n'+'甲'.repeat(15000)+'末尾真实证据';let {p}=fixture(content);const requests=[],reads=[];
 const result=await runIPTask({api:{aiChat:async r=>{requests.push(r);if(r.taskId.endsWith(':plan'))return JSON.stringify({mainline:'主线',ending:'真实停点',segments:[{from:1,to:1,episodes:80,focus:'保留原句'}]});if(r.taskId.includes(':plan-group-'))return JSON.stringify(validNewPlan(p,Number(r.messages.at(-1).content.match(/本次只规划 (\d+) 集/)[1]),'保留原句'));return '完整阅读笔记';}},project:p,task:'plan',profile:{id:'api',model:'configured'},taskId:'read',onRead:r=>reads.push(r)});
 assert.equal(reads.reduce((n,r)=>n+r.end-r.start,0),content.length);assert.ok(requests.some(r=>r.messages.some(m=>m.content.includes('末尾真实证据'))));
 const prompt=requests.at(-1).messages.map(m=>m.content).join('\n');assert.match(prompt,/120 分钟/);assert.match(prompt,/70000/);
 for(const file of IP_BUILTIN_SKILLS[0].files)assert.ok(prompt.includes(file.content));assert.equal(result.plan.episodes.length,80);
});
test('episode generation re-reads ALL previous current text then exact novel and retains initial draft before review',async()=>{
 let {state,id,p}=fixture();for(const e of p.episodes.slice(0,2)){state=updateIPDraft(state,id,e.id,e.type==='settings'?'设定资料':'第一集最新完整正文和专属末句');state=confirmIPEpisode(state,id,e.id);}
 p=getIPProject(state,id);const requests=[],drafts=[];
 const result=await runIPTask({api:{aiChat:async r=>{requests.push(r);return r.taskId.endsWith(':review')?JSON.stringify({script:'第二集修订正文',comparison:'原文对照卡',issues:[]}):'第二集初稿';}},project:p,task:'episode',episodeId:p.episodes[2].id,profile:{id:'x',model:'model-selected'},taskId:'episode',onDraft:d=>drafts.push(d)});
 assert.equal(drafts[0].content,'第二集初稿');assert.equal(result.content,'第二集修订正文');assert.equal(requests.length,2);
 const user=requests[0].messages.filter(m=>m.role==='user');assert.match(user[0].content,/第一集最新完整正文和专属末句/);assert.match(user[1].content,/第三章 相识/);assert.equal(requests[0].model,'model-selected');assert.equal(result.coverage[0].characters,'第一集最新完整正文和专属末句'.length);
});
test('capacity, missing earlier confirmation, malformed output and cancellation fail without fabricated completion',async()=>{
 const {p}=fixture();let calls=0;
 await assert.rejects(()=>runIPTask({api:{aiChat:async()=>{calls++;return 'x';}},project:p,task:'episode',episodeId:p.episodes[2].id,profile:{model:'m'},taskId:'missing'}),/此前/);assert.equal(calls,0);
 await assert.rejects(()=>runIPTask({api:{aiChat:async()=>{calls++;return 'x';}},project:p,task:'plan',profile:{model:'m',contextWindowTokens:1},taskId:'capacity'}),/容量/);assert.equal(calls,0);
 let cancelled=false;
 await assert.rejects(()=>runIPTask({api:{aiChat:async()=>{cancelled=true;return '笔记';}},project:p,task:'plan',profile:{model:'m'},taskId:'cancel',isCancelled:()=>cancelled}),/停止/);
 const bad=[];await assert.rejects(()=>runIPTask({api:{aiChat:async r=>r.taskId.endsWith(':plan')?'非 JSON':'笔记'},project:p,task:'plan',profile:{model:'m'},taskId:'bad',onDraft:d=>bad.push(d)}),/结构/);assert.equal(bad[0].content,'非 JSON');
});
test('settings extraction uses full provided summary Skill, and interrupted IP jobs recover on restart',async()=>{
 const {p,state,id}=fixture();let request;
 const result=await runIPTask({api:{aiChat:async r=>{request=r;return '【故事梗概】\n【核心标签】\n【人物小传】';}},project:p,task:'settings',episodeId:p.episodes[0].id,profile:{model:'m'},taskId:'settings'});
 assert.equal(result.type,'version');assert.ok(request.messages.map(m=>m.content).join('\n').includes(IP_BUILTIN_SKILLS[1].files[0].content));
 state.fruitProjects[0].creator.records=[{id:'j',type:'ip-task',status:'running'}];assert.equal(getIPProject(recoverCreatorTasks(state),id).creator.records[0].status,'interrupted');
});
test('restoring an earlier novel version keeps its exact original mapping through subsequent manual saves',()=>{
 let {state,id,p}=fixture();const e=p.episodes[1];
 state=appendIPVersion(state,id,e.id,{content:'旧来源初稿'},{activate:true});
 const initial=getIPProject(state,id).episodes[1].ipVersions[0],original=ipOriginal(p,e);
 state=importIPNovel(state,id,{content:'第一章 新版\n新版故事',name:'新版'});
 p=getIPProject(state,id);state=applyIPPlan(state,id,validNewPlan(p));
 state=adoptIPVersion(state,id,e.id,initial.id);p=getIPProject(state,id);
 assert.equal(ipOriginal(p,p.episodes[1]),original);
 state=updateIPDraft(state,id,e.id,'基于旧原文继续手动修改');state=saveIPVersion(state,id,e.id);
 p=getIPProject(state,id);const manual=p.episodes[1].ipVersions.at(-1);
 assert.equal(manual.sourceId,initial.sourceId);assert.equal(ipOriginal(p,p.episodes[1],manual),original);
});
test('cancelled API partial output survives the task error for recovery',async()=>{
 const {p}=fixture();let cancelled=false;
 await assert.rejects(()=>runIPTask({api:{aiChat:async()=>{cancelled=true;return {ok:false,error:'已停止',partialText:'已经生成的可找回文字'};}},project:p,task:'plan',profile:{model:'m'},taskId:'partial',isCancelled:()=>cancelled}),e=>e.partialText==='已经生成的可找回文字');
});
test('mapping changes archive the prior draft with its original chapters before replacing them',()=>{
 let {state,id,p}=fixture();const e=p.episodes[1],prior=ipOriginal(p,e);
 state=updateIPDraft(state,id,e.id,'未经 blur 存档的修改');state=updateIPMapping(state,id,e.id,[p.creator.ip.source.chapters[2].id],'改章节');
 p=getIPProject(state,id);const saved=p.episodes[1].ipVersions.at(-1);assert.equal(saved.content,'未经 blur 存档的修改');assert.equal(ipOriginal(p,p.episodes[1],saved),prior);
});
test('shorter replanning retires old tail episodes and excludes them from active master',()=>{
 let {state,id,p}=fixture();state=applyIPPlan(state,id,validNewPlan(p,81));p=getIPProject(state,id);state=updateIPDraft(state,id,p.episodes[81].id,'旧规划尾集');
 state=applyIPPlan(state,id,validNewPlan(p,80));p=getIPProject(state,id);
 assert.equal(p.episodes.filter(e=>e.type==='episode').length,80);assert.doesNotMatch(ipMaster(p),/旧规划尾集/);
 assert.equal(p.creator.ip.retiredEpisodes[0].scriptText,'旧规划尾集');assert.equal(p.creator.ip.retiredEpisodes[0].ipVersions[0].content,'旧规划尾集');
});
