import test from 'node:test';
import assert from 'node:assert/strict';
import * as ip from './ipWorkspace.js';
import {normalizeState} from './projectStore.js';
import {runIPTask} from './ipAi.js';
import {runIPAdaptationFlow} from './ipAdaptationFlow.js';

function fixture(){
 let state=ip.createIPProject({fruitProjects:[]},{name:'版本测试',duration:60});
 const id=state.fruitProjects[0].id;
 state=ip.importIPNovel(state,id,{name:'小说',content:'第一章 开始\n甲收到来信。\n第二章 结束\n甲找到了乙。'});
 const plan=(count,label)=>({mainline:label,ending:'找到乙',episodes:Array.from({length:count},(_,i)=>({chapterIds:[state.fruitProjects[0].creator.ip.source.chapters[i%2].id],outline:`${label}${i+1}`}))});
 state=ip.applyIPPlan(state,id,plan(50,'六十分钟'));
 return {state,id,plan};
}

test('changing duration retains existing planning candidates',()=>{
 let {state,id}=fixture();
 state=ip.mutateIP(state,id,p=>({...p,creator:{...p.creator,ip:{...p.creator.ip,planCandidates:[{id:'candidate-60',duration:60,plan:p.creator.ip.plan}]}}}));
 state=ip.updateIPMeta(state,id,{duration:120});
 assert.equal(ip.getIPProject(state,id).creator.ip.planCandidates.length,1);
});

test('duration switch archives complete first edition before invalidating the working plan',()=>{
 let {state,id}=fixture();const episode=ip.getIPProject(state,id).episodes[1];
 state=ip.appendIPVersion(state,id,episode.id,{content:'六十分钟正文',label:'初版'},{activate:true});
 state=ip.confirmIPEpisode(state,id,episode.id);
 const saved=ip.getIPProject(state,id).episodes;
 state=ip.updateIPMeta(state,id,{duration:120});
 const project=ip.getIPProject(state,id);
 assert.equal(project.creator.ip.editions?.length,1);
 assert.equal(project.creator.ip.editions[0].duration,60);
 assert.deepEqual(project.creator.ip.editions[0].episodes,saved);
 assert.equal(project.creator.ip.plan,null);
});

test('switching complete editions restores episode count, source, requirements, text and versions without generation',()=>{
 let {state,id,plan}=fixture();
 state=ip.updateIPMeta(state,id,{requirements:'从收到来信开始'});
 let p=ip.getIPProject(state,id);state=ip.updateIPDraft(state,id,p.episodes[1].id,'首版正文');
 const firstId=ip.getIPProject(state,id).creator.ip.activeEditionId;
 state=ip.updateIPMeta(state,id,{duration:120,requirements:'增加寻找过程'});
 state=ip.applyIPPlan(state,id,plan(80,'一百二十分钟'));
 p=ip.getIPProject(state,id);state=ip.updateIPDraft(state,id,p.episodes[1].id,'长版正文');
 const secondId=ip.getIPProject(state,id).creator.ip.activeEditionId;
 assert.equal(typeof ip.applyIPEdition,'function');
 state=ip.applyIPEdition(normalizeState(JSON.parse(JSON.stringify(state))),id,firstId);
 p=ip.getIPProject(state,id);
 assert.equal(p.creator.ip.duration,60);assert.equal(p.creator.ip.requirements,'从收到来信开始');
 assert.equal(p.episodes.filter(e=>e.type==='episode').length,50);assert.equal(p.episodes[1].scriptText,'首版正文');
 state=ip.updateIPDraft(state,id,p.episodes[1].id,'首版人工修改');
 state=ip.applyIPEdition(state,id,secondId);
 p=ip.getIPProject(state,id);assert.equal(p.episodes.length,81);assert.equal(p.episodes[1].scriptText,'长版正文');
 state=ip.applyIPEdition(state,id,firstId);
 assert.equal(ip.getIPProject(state,id).episodes[1].scriptText,'首版人工修改');
 assert.equal(ip.getIPProject(state,id).creator.ip.editions.filter(v=>v.kind!=='working-draft').length,2);
});

test('replanning same duration preserves the previous complete edition and only explicit deletion removes it',()=>{
 let {state,id,plan}=fixture();
 const firstId=ip.getIPProject(state,id).creator.ip.activeEditionId;
 state=ip.updateIPDraft(state,id,ip.getIPProject(state,id).episodes[1].id,'旧稿');
 state=ip.beginIPFirstDraft(state,id,plan(55,'新版'),{replace:true});
 assert.equal(ip.getIPProject(state,id).creator.ip.editions?.length,2);
 assert.equal(typeof ip.deleteIPEdition,'function');
 state=ip.deleteIPEdition(state,id,firstId);
 assert.equal(ip.getIPProject(state,id).creator.ip.editions.length,1);
 assert.equal(ip.getIPProject(state,id).episodes.length,56);
});

test('legacy adopted plan is retained on duration switch and old source remains recoverable',()=>{
 let {state,id}=fixture();
 state=ip.mutateIP(state,id,p=>({...p,creator:{...p.creator,ip:{...p.creator.ip,editions:[],activeEditionId:null}}}));
 const oldSource=ip.getIPProject(state,id).creator.ip.source;
 state=ip.importIPNovel(state,id,{name:'新小说',content:'第一章 新开头\n全新资料。'});
 assert.equal(typeof ip.applyIPEdition,'function');
 const version=ip.getIPProject(state,id).creator.ip.editions.find(e=>e.sourceId===oldSource.id);
 assert.ok(version);
 state=ip.applyIPEdition(state,id,version.id);
 assert.equal(ip.getIPProject(state,id).creator.ip.source.content,oldSource.content);
});

test('persisted adaptation requirements reach domain generation and combine with per-episode revisions',()=>{
 assert.equal(typeof ip.resolveIPInstruction,'function');
 const {state,id}=fixture();const p=ip.getIPProject(ip.updateIPMeta(state,id,{requirements:'从拜师开始，到第937章结束'}),id);
 const recovered=normalizeState(JSON.parse(JSON.stringify({fruitProjects:[p]}))).fruitProjects[0];
 assert.equal(ip.resolveIPInstruction(recovered),'从拜师开始，到第937章结束');
 assert.match(ip.resolveIPInstruction(recovered,'保留原著对白'),/从拜师开始[\s\S]*保留原著对白/);
 assert.equal(ip.resolveIPInstruction(recovered,ip.resolveIPInstruction(recovered,'保留原著对白')),ip.resolveIPInstruction(recovered,'保留原著对白'));
});

test('generation requests actually include persisted requirements without a page-local instruction',async()=>{
 const {state,id}=fixture();const p=ip.getIPProject(ip.updateIPMeta(state,id,{requirements:'从来信开始，到找到乙结束，保留原著对白。'}),id),requests=[];
 await runIPTask({api:{aiChat:async request=>{requests.push(request);return '【故事梗概】甲收到信并找到乙。\n【核心标签】寻找。\n【人物小传】甲：寻找乙。\n【核心设定】只保留原著。';}},project:p,task:'settings',episodeId:p.episodes[0].id,profile:{model:'mock'},taskId:'requirements'});
 assert.ok(requests.length>0);
 assert.ok(requests.at(-1).messages.some(m=>m.content.includes('从来信开始，到找到乙结束，保留原著对白。')));
});

test('a different duration generates a candidate without replacing the saved manuscript until adoption',async()=>{
 let {state,id,plan}=fixture();state=ip.updateIPMeta(state,id,{duration:120});
 const tasks=[];let adopted=false;
 const result=await runIPAdaptationFlow({getProject:()=>ip.getIPProject(state,id),runTask:async input=>{tasks.push(input.task);return {plan:plan(80,'长版')};},adoptPlan:()=>{adopted=true;}});
 assert.equal(result.type,'planCandidate');assert.deepEqual(tasks,['plan']);assert.equal(adopted,false);
});

test('edits made after changing duration remain recoverable when applying an older complete version',()=>{
 let {state,id}=fixture();const firstId=ip.getIPProject(state,id).creator.ip.activeEditionId,e=ip.getIPProject(state,id).episodes[1].id;
 state=ip.updateIPDraft(state,id,e,'原稿');state=ip.updateIPMeta(state,id,{duration:120});state=ip.updateIPDraft(state,id,e,'更改时长之后的人工稿');
 state=ip.applyIPEdition(state,id,firstId);
 const draft=ip.getIPProject(state,id).creator.ip.editions.find(v=>v.episodes[1]?.scriptText==='更改时长之后的人工稿');
 assert.ok(draft,'未采用新规划时的修改必须另存工作稿');
 state=ip.applyIPEdition(state,id,draft.id);assert.equal(ip.getIPProject(state,id).episodes[1].scriptText,'更改时长之后的人工稿');
 assert.equal(ip.getIPProject(state,id).creator.ip.plan,null);
});

test('deleting active record does not resurrect its ID but current edits are saved under a new ID before switching',()=>{
 let {state,id,plan}=fixture();const firstId=ip.getIPProject(state,id).creator.ip.activeEditionId;
 state=ip.applyIPPlan(state,id,plan(55,'第二版'));const secondId=ip.getIPProject(state,id).creator.ip.activeEditionId;
 state=ip.deleteIPEdition(state,id,secondId);state=ip.updateIPDraft(state,id,ip.getIPProject(state,id).episodes[1].id,'删除记录后保留的当前编辑稿');
 state=ip.applyIPEdition(state,id,firstId);
 const p=ip.getIPProject(state,id);assert.ok(!p.creator.ip.editions.some(v=>v.id===secondId));
 assert.ok(p.creator.ip.editions.some(v=>v.episodes[1]?.scriptText==='删除记录后保留的当前编辑稿'));
});

test('legacy planning candidates acquire their original duration before a duration change',()=>{
 let {state,id,plan}=fixture();state=ip.updateIPMeta(state,id,{duration:120});
 state=ip.mutateIP(state,id,p=>({...p,creator:{...p.creator,ip:{...p.creator.ip,planCandidates:[{id:'legacy-120',plan:plan(80,'旧120分钟'),sourceId:p.creator.ip.source.id}]}}}));
 state=ip.updateIPMeta(state,id,{duration:60});
 assert.equal(ip.getIPProject(state,id).creator.ip.planCandidates[0].duration,120);
});

test('requirements changed during automatic initial planning leave a candidate for adoption',async()=>{
 const {state,id,plan}=fixture();const p=ip.getIPProject(state,id);p.creator.ip.plan=null;p.creator.ip.editions=[];
 let adopted=false;
 const result=await runIPAdaptationFlow({getProject:()=>p,runTask:async()=>{p.creator.ip.requirements='运行期间新要求';return {plan:plan(50,'旧要求规划')};},adoptPlan:()=>{adopted=true;}});
 assert.equal(adopted,false);assert.equal(result.type,'planCandidate');
});

test('planless work with empty bodies still preserves modified requirements and source mappings',()=>{
 let {state,id}=fixture();const firstId=ip.getIPProject(state,id).creator.ip.activeEditionId,e=ip.getIPProject(state,id).episodes[1].id;
 state=ip.updateIPMeta(state,id,{duration:120,requirements:'空正文期间修改的改编要求'});
 state=ip.updateIPMapping(state,id,e,[ip.getIPProject(state,id).creator.ip.source.chapters[1].id],'新的范围和细纲');
 state=ip.applyIPEdition(state,id,firstId);
 const draft=ip.getIPProject(state,id).creator.ip.editions.find(v=>v.kind==='working-draft'&&v.requirements==='空正文期间修改的改编要求');
 assert.ok(draft);assert.equal(draft.episodes[1].outline,'新的范围和细纲');
});
