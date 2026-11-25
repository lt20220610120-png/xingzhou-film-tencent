import {createInitialState} from '../../core/projectStore.js';
import {manorScene} from '../../core/directorSceneBudget.fixtures.js';

const account={id:'duration-fixture',username:'fixture',roles:['director'],activeRole:'director'};
const auto=new URLSearchParams(location.search).has('auto');
const legacy=new URLSearchParams(location.search).has('legacy');
const text=auto?`第一集\n${manorScene.replace('场景 2-1','场景 1-1')}`:'第一集\n1-1 客厅 日 内\n（1）\n- 她掏出手机。\n【内心独白：现在终于确定了。】\n（2）\n乙：我在门外等你。\n（3）\n- 她出门，转身看向楼梯。';
const oldPrompt={id:'legacy-clip',label:'1-1-1',content:'1-1-1\n角色说：我需要500万，OK？',durationSourceScript:'角色说：我需要500万，OK？',generationMode:'quick',
 durationEstimate:{version:'2.0.0',status:'estimated',maxDurationSeconds:30,naturalSeconds:9,recommendedSeconds:9,capacityStatus:'正常',needsResegment:false,
  breakdown:{speechSeconds:5,nonparallelActionSeconds:3,pauseBufferSeconds:1},reason:'旧版静态记录。'}};
const episode={id:'fixture-episode',number:1,title:'第1集',content:text,prompts:legacy?[oldPrompt]:[]};
const project={id:'fixture-director',name:'隔离估时剧本',masterScript:text,episodes:[episode],lastUsedSkillId:'fixture-skill'};
const profiles=['director-fixture','estimator-fixture'].map((id,index)=>({id,name:index?'独立估时':'导演模型',model:index?'mimo-v2.6-pro':'cn:deepseek-v4.1-flash',endpoint:'https://example.invalid/v1',apiKey:'mock'}));
const state={...createInitialState(),apiProfiles:profiles,activeApiId:profiles[0].id,directorProjects:[project],skills:[{id:'fixture-skill',name:'隔离导演 Skill',content:'执行完整导演正文。'}]};
const calls=[],runs=new Map();
window.durationFixture={calls,saved:null,unexpected:[],cancelled:[],releaseRetry:null};
const labels=['1-1-1','1-1-2','1-1-3'];
const body=labels.map((id,index)=>`${id}\n${['- 她掏出手机。\n【内心独白：现在终于确定了。】','乙：我在门外等你。','- 她出门，转身看向楼梯。'][index]}`).join('\n\n');
localStorage.setItem('xz-role','director');
localStorage.setItem('xz-director-last-project',project.id);
localStorage.setItem('xz-director-last-pane',episode.id);
localStorage.setItem(`xz-director-mode:${account.id}:${project.id}`,'quick');
localStorage.setItem(`xz-director-quick-settings:${account.id}:${project.id}`,JSON.stringify({segmentationMode:auto?'auto':'manual',maxDurationSeconds:35}));

async function model(payload){
 const messages=payload.messages,request=messages.at(-1).content;
 if(payload.taskId?.startsWith('director-duration-')){
  const input=JSON.parse(request),number=calls.filter(call=>call.kind==='estimate').length+1;
  calls.push({kind:'estimate',profileId:payload.profileId,input,taskId:payload.taskId,analysisMode:payload.analysisMode,stream:payload.stream,
   skillIsolated:messages[0].content.includes('3.0.0')&&messages[0].content.includes('turns')&&!messages[0].content.includes('执行完整导演正文。')&&!messages[0].content.includes('experiment-cases.json')});
  if(legacy)return {ok:true,output:JSON.stringify({results:[{segment_id:input.segments[0].segment_id,groups:[{turns:[{text:'我需要500万，OK？',pace:'normal'}]}],reason:'正常说话。'}]})};
  if(auto)return {ok:true,output:JSON.stringify({results:input.segments.map((row,index)=>({segment_id:row.segment_id,groups:[{visual_seconds:number===1&&!index?35.4:10.4}]}))})};
  if(number===2||number===3||number===5)await new Promise(resolve=>{window.durationFixture.releaseRetry=resolve;});
  if(number===2)return {ok:true,output:'{"results":[]}'};
  const results=input.segments.filter(row=>number!==1||row.segment_id!==labels[2]).map(row=>({segment_id:row.segment_id,
   groups:[{visual_seconds:number===3?33.4:10.4}],reason:'按动作发生顺序计时。'}));
  return {ok:true,output:`\`\`\`json\n${JSON.stringify({results})}\n\`\`\``};
 }
 if(auto&&payload.taskId?.startsWith('director-quick-')){
  if(payload.taskId.includes('-plan-')){calls.push({kind:'plan'});return {ok:true,output:'{"estimatedSceneSeconds":45,"timingRationale":"测试按动作过程连续表演"}'};}
  if(payload.taskId.includes('-skill-')){
   const labels=request.match(/外层编号各自独占一行：([\d、-]+)。/u)?.[1].split('、');
   if(!labels)throw Error('隔离夹具未收到固定编号');
   calls.push({kind:'body'});
   const count=calls.filter(row=>row.kind==='body').length;
   return {ok:true,output:labels.map(label=>`${label}\n测试导演正文第 ${count} 版。`).join('\n\n')};
  }
 }
 if(payload.taskId?.startsWith('director-manual-review-')){
  calls.push({kind:'review',profileId:payload.profileId});
  return {ok:true,output:JSON.stringify({segments:labels.map(label=>({label,ok:true,issues:[]}))})};
 }
 if(payload.taskId?.startsWith('director-manual-')){
  calls.push({kind:'body',profileId:payload.profileId,independent:!messages.some(row=>row.content.includes('稳定输出协议'))});
  return {ok:true,output:body};
 }
 window.durationFixture.unexpected.push(payload?.taskId||'unknown');
 throw Error('Unexpected external request');
}
const answers={authSession:account,licenseCheck:{status:'active',allowed:true,authenticated:true},appVersion:'2.8.206',checkUpdate:null,
 loadState:state,loadDirectorProjects:state.directorProjects,storageInfo:{dataDir:'isolated',dataFile:'isolated',engine:'fixture'},
 saveDirectorProjects:projects=>{window.durationFixture.saved=projects;},saveWorkspaceDelta:({directors})=>{
  if(directors?.changed?.length)window.durationFixture.saved=structuredClone(directors.changed);
 },directorQuickSaveRun:({run})=>runs.set(run.id,structuredClone(run)),
 directorQuickListRuns:()=>[...runs.values()],directorQuickLoadRun:({runId})=>runs.get(runId)||null,directorCollabListProjects:[],productionList:[],
 localProjectHas:false,aiChat:model,cancelAiTask:({taskId})=>{window.durationFixture.cancelled.push(taskId);window.durationFixture.releaseRetry?.();}};
window.xingzhou=new Proxy({}, {get(_,key){
 if(typeof key!=='string'||key==='then')return undefined;
 if(key.startsWith('on'))return ()=>()=>{};
 return async (...args)=>{
  if(/^(?:generationSubmit|mediaGenerate|audioGenerate)/.test(key)){window.durationFixture.unexpected.push(key);throw Error('隔离环境禁止付费');}
  const answer=answers[key];return structuredClone(await (typeof answer==='function'?answer(...args):answer===undefined?[]:answer));
 };
}});
await import('../../src/main.jsx');
