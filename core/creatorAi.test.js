import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCreatorContext, runCreatorTask, creatorModelOptions } from './creatorAi.js';

const project = { id:'p',name:'测试剧',episodes:[{id:'e',title:'第1集',content:'原稿',result:'定稿'}],creator:{mode:'framework',sections:{settings:{output:'已确认规则',accepted:true},skeleton:{output:'固定结局',accepted:true,locked:true},simulation:{output:'尚未采用结局',accepted:false}},records:[{output:'已弃用身份',status:'rejected'}],chat:[],references:[]}};
test('generation context includes adopted constraints but not unadopted branches',()=>{
 const text=buildCreatorContext(project,{kind:'script',target:{episodeId:'e'}});
 assert.match(text,/已确认规则/);assert.match(text,/固定结局/);assert.doesNotMatch(text,/尚未采用结局|已弃用身份/);
});
test('model options expand discovered models without mutating profiles',()=>{
 const profiles=[{id:'a',name:'接口',model:'m1',models:['m1','m2']}];
 assert.deepEqual(creatorModelOptions(profiles).map(x=>x.model),['m1','m2']);assert.equal(profiles[0].model,'m1');
});
test('task executes complete Skill files and binds main input to current episode',async()=>{
 let request; const result=await runCreatorTask({api:{aiChat:async p=>(request=p,{ok:true,output:'新剧本'})},state:{skills:[{id:'s',name:'规则',content:'主规则',files:[{path:'refs/a.md',content:'完整附属规则'}]}]},project,kind:'script',target:{episodeId:'e',side:'input'},profile:{id:'a',model:'m'},skillId:'s',instruction:'转换',taskId:'test'});
 assert.equal(result.output,'新剧本');assert.match(request.messages.map(x=>x.content).join('\n'),/完整附属规则/);assert.match(request.messages.at(-1).content,/原稿/);
});
test('long source analysis reads every segment before synthesis and preserves coverage',async()=>{
 const source='开头'+('甲'.repeat(22000))+'最后的证据'; const requests=[];
 const result=await runCreatorTask({api:{aiChat:async p=>{requests.push(p);return {ok:true,output:requests.length<4?'阅读记录':'分析结论'};}},state:{skills:[]},project:{...project,creator:{...project.creator,source:{content:source}}},kind:'script',target:{section:'outline'},profile:{id:'a',model:'m'},instruction:'分析',taskId:'long'});
 assert.ok(requests.length>=4);assert.ok(requests.some(p=>p.messages.some(m=>m.content.includes('最后的证据'))));assert.equal(result.meta.sourceCharacters,source.length);assert.ok(result.meta.readSegments>=3);
});
test('empty and failed responses never become successful candidates',async()=>{
 for(const response of ['', {ok:false,error:'失败'}]) await assert.rejects(()=>runCreatorTask({api:{aiChat:async()=>response},state:{skills:[]},project,kind:'script',target:{episodeId:'e'},profile:{id:'a',model:'m'},instruction:'写作',taskId:'empty'}));
});
test('cancelled long reading stops before issuing the next request',async()=>{
 let cancelled=false,count=0;
 await assert.rejects(()=>runCreatorTask({api:{aiChat:async()=>{count++;cancelled=true;return '笔记';}},state:{skills:[]},project:{...project,creator:{...project.creator,source:{content:'甲'.repeat(24000)}}},kind:'script',target:{section:'outline'},profile:{id:'a',model:'m'},taskId:'cancel',isCancelled:()=>cancelled}),/停止/);
 assert.equal(count,1);
});
test('older project discussion remains available after more than twelve turns',async()=>{
 let request;
 await runCreatorTask({api:{aiChat:async p=>(request=p,'建议')},state:{skills:[]},project:{...project,creator:{...project.creator,chat:Array.from({length:25},(_,i)=>({role:'user',content:i===0?'最早的未决问题：能力只限近距离':`后续讨论${i}`}))}},kind:'script',target:{section:'inspiration'},profile:{id:'a',model:'m'},taskId:'memory'});
 assert.match(request.messages.map(m=>m.content).join('\n'),/最早的未决问题/);
});
test('current scope excludes full sources and other episodes while retaining adopted constraints',async()=>{
 const requests=[];
 const p={...project,episodes:[...project.episodes,{id:'other',title:'第2集',content:'其他分集私有正文'}],creator:{...project.creator,source:{content:'来源开始'+ '甲'.repeat(40000)+'来源结尾'},references:[{content:'对标附件正文'}]}};
 await runCreatorTask({api:{aiChat:async r=>(requests.push(r),'候选')},state:{skills:[]},project:p,kind:'script',target:{episodeId:'e',inputSide:'input'},profile:{id:'a',model:'m'},taskId:'current',scope:'current'});
 assert.equal(requests.length,1);
 const sent=requests[0].messages.map(m=>m.content).join('\n');
 assert.match(sent,/已确认规则|固定结局/);assert.match(sent,/原稿/);
 assert.doesNotMatch(sent,/来源开始|来源结尾|对标附件正文|其他分集私有正文/);
});
test('scene conversion explicitly supplies current episode numbering',async()=>{
 let request;const episodes=Array.from({length:17},(_,i)=>({id:`e${i+1}`,title:`第${i+1}集`,content:'本集故事'}));
 await runCreatorTask({api:{aiChat:async r=>(request=r,'17-1 公园 日 外')},state:{skills:[]},project:{...project,episodes},kind:'script',target:{episodeId:'e17',task:'scene',inputSide:'input'},profile:{id:'a',model:'m'},taskId:'scene'});
 assert.match(request.messages.at(-1).content,/当前节点：第17集/);assert.match(request.messages.at(-1).content,/分场编号使用 17-1/);
});
test('long current fruit input is fully read in segments without repeating the entire input in synthesis',async()=>{
 const raw='输入开头'+ '甲'.repeat(40000)+'输入末尾';const requests=[];
 const result=await runCreatorTask({api:{aiChat:async r=>(requests.push(r),'阅读摘要或候选')},state:{skills:[]},project:{id:'f',name:'果子',episodes:[{id:'e',title:'第1集',rawText:raw,scriptText:''}],creator:{mode:'fruit',sections:{},references:[],chat:[]}},kind:'fruit',target:{episodeId:'e',inputSide:'input'},profile:{id:'a',model:'m'},taskId:'long-input'});
 assert.ok(result.meta.readSegments>=5);assert.ok(requests.some(r=>r.messages.some(m=>m.content.includes('输入末尾'))));
 assert.doesNotMatch(requests.at(-1).messages.at(-1).content,/甲{10000}/);
 assert.match(requests.at(-1).messages.at(-1).content,/主要工作对象/);
});
test('single imported numbered episode retains its title number for scene output',async()=>{
 let request;await runCreatorTask({api:{aiChat:async r=>(request=r,'17-1 场景')},state:{skills:[]},project:{...project,episodes:[{id:'e17',title:'第十七集',content:'故事'}]},kind:'script',target:{episodeId:'e17',task:'scene'},profile:{id:'a',model:'m'},taskId:'seventeen'});
 assert.match(request.messages.at(-1).content,/分场编号使用 17-1/);
});
test('stale derived drafts are excluded while locked facts and names of referenced candidates remain explicit',()=>{
 const p={...project,creator:{...project.creator,sections:{detail:{output:'旧细纲不应当事实',accepted:true,stale:true},skeleton:{output:'锁定结局',accepted:true,stale:true,locked:true}},story:{characters:[{id:'c',name:'候选人物名',description:'未采用人物秘密',accepted:false}],events:[{id:'e',title:'采用事件',characterIds:['c'],predecessorIds:[],accepted:true}]}}};
 const context=buildCreatorContext(p,{kind:'script',target:{section:'simulation'}});
 assert.match(context,/锁定结局|候选人物名/);assert.doesNotMatch(context,/旧细纲不应当事实|未采用人物秘密/);
});
