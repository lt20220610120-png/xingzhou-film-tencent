import {createInitialState} from '../../core/projectStore.js';

const account={id:'duration-fixture',username:'fixture',roles:['director'],activeRole:'director'};
const text='第一集\n1-1 客厅 日 内\n（1）\n- 她掏出手机。\n【内心独白：现在终于确定了。】\n（2）\n乙：我在门外等你。';
const episode={id:'fixture-episode',number:1,title:'第1集',content:text,prompts:[]};
const project={id:'fixture-director',name:'隔离估时剧本',masterScript:text,episodes:[episode],lastUsedSkillId:'fixture-skill'};
const profiles=['director-fixture','estimator-fixture'].map((id,index)=>({id,name:index?'独立估时':'导演模型',model:id,endpoint:'https://example.invalid/v1',apiKey:'mock'}));
const state={...createInitialState(),apiProfiles:profiles,activeApiId:profiles[0].id,directorProjects:[project],skills:[{id:'fixture-skill',name:'隔离导演 Skill',content:'执行完整导演正文。'}]};
const calls=[],runs=new Map();
window.durationFixture={calls,saved:null,unexpected:[]};
const labels=['1-1-1','1-1-2'];
const body=labels.map((id,index)=>`${id}\n${index?'乙：我在门外等你。':'- 她掏出手机。\n【内心独白：现在终于确定了。】'}`).join('\n\n');
localStorage.setItem('xz-role','director');
localStorage.setItem('xz-director-last-project',project.id);
localStorage.setItem('xz-director-last-pane',episode.id);
localStorage.setItem(`xz-director-mode:${account.id}:${project.id}`,'quick');
localStorage.setItem(`xz-director-quick-settings:${account.id}:${project.id}`,JSON.stringify({segmentationMode:'manual',maxDurationSeconds:35}));

function model(payload){
 const messages=payload.messages,request=messages.at(-1).content;
 if(payload.taskId?.startsWith('director-duration-')){
  const input=JSON.parse(request),number=calls.filter(call=>call.kind==='estimate').length+1;
  calls.push({kind:'estimate',profileId:payload.profileId,input,skillIsolated:messages[0].content.includes('稳定输出协议')&&!messages[0].content.includes('执行完整导演正文。')&&!messages[0].content.includes('experiment-cases.json')});
  return {ok:true,output:JSON.stringify({max_duration_seconds:input.max_duration_seconds,limit_defaulted:false,schema_version:'1.0',
   results:input.segments.flatMap((row,i)=>{
    if(number===1&&i===1)return [];
    const natural=number===2?34:11,tight=natural>input.max_duration_seconds;
    return [{segment_id:row.segment_id,timing:{natural_seconds:natural,recommended_seconds:tight?input.max_duration_seconds:natural,needs_resegment:false},
     breakdown:{speech_seconds:natural-4,nonparallel_action_seconds:3,pause_buffer_seconds:1},reason:'同步看手机，VO与动作去重。',capacity_status:tight?'略偏紧':'正常'}];
   }),errors:number===1?[{segment_id:labels[1],code:'SOURCE_CONFLICT',message:'两源未明确是否朗读。'}]:[]})};
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
const answers={authSession:account,licenseCheck:{status:'active',allowed:true,authenticated:true},appVersion:'2.8.203',checkUpdate:null,
 loadState:state,loadDirectorProjects:state.directorProjects,storageInfo:{dataDir:'isolated',dataFile:'isolated',engine:'fixture'},
 saveDirectorProjects:projects=>{window.durationFixture.saved=projects;},directorQuickSaveRun:({run})=>runs.set(run.id,structuredClone(run)),
 directorQuickListRuns:()=>[...runs.values()],directorQuickLoadRun:({runId})=>runs.get(runId)||null,directorCollabListProjects:[],productionList:[],
 localProjectHas:false,aiChat:model};
window.xingzhou=new Proxy({}, {get(_,key){
 if(typeof key!=='string'||key==='then')return undefined;
 if(key.startsWith('on'))return ()=>()=>{};
 return async (...args)=>{
  if(/^(?:generationSubmit|mediaGenerate|audioGenerate)/.test(key)){window.durationFixture.unexpected.push(key);throw Error('隔离环境禁止付费');}
  const answer=answers[key];return structuredClone(typeof answer==='function'?answer(...args):answer===undefined?[]:answer);
 };
}});
await import('../../src/main.jsx');
